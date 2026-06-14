import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TickerRedisRepository } from '../../market/repository/ticker-redis.repository';
import { TickerPubSubSubscriber } from '../../market/service/ticker-pubsub.service';
import { PositionRepository } from '../repository/position.repository';
import { PositionStatus } from '../entity/position.entity';
import { OrderDirection } from '../entity/order.entity';
import { OrderService } from './order.service';
import { TickerResponse } from '../../market/dto/ticker.dto';
import { Semaphore } from '../../../common/util/semaphore';

const LIQUIDATION_CONCURRENCY = 10;

@Injectable()
export class LiquidationService implements OnModuleInit {
  private readonly logger = new Logger(LiquidationService.name);
  private readonly semaphore = new Semaphore(LIQUIDATION_CONCURRENCY);

  constructor(
    private readonly positionRepository: PositionRepository,
    private readonly tickerRedisRepository: TickerRedisRepository,
    private readonly orderService: OrderService,
    private readonly tickerSubscriber: TickerPubSubSubscriber,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.rebuildIndex();
    this.tickerSubscriber.onMessage((ticker) => this.onTicker(ticker));
  }

  private async rebuildIndex(): Promise<void> {
    const openPositions = await this.positionRepository.findAllByStatus(PositionStatus.OPEN);
    for (const position of openPositions) {
      await this.tickerRedisRepository.addLiquidationIndex(
        position.id,
        position.ticker,
        position.direction,
        position.liquidationPrice(),
      );
    }
    this.logger.log(`liquidation index rebuilt: ${openPositions.length} positions`);
  }

  private async onTicker(ticker: TickerResponse): Promise<void> {
    const detectStart = Date.now();
    const currentPrice = Math.floor(ticker.tradePrice);
    const market = ticker.market;

    const [longCandidates, shortCandidates] = await Promise.all([
      this.tickerRedisRepository.getLiquidationCandidates(market, OrderDirection.LONG, currentPrice),
      this.tickerRedisRepository.getLiquidationCandidates(market, OrderDirection.SHORT, currentPrice),
    ]);

    const candidates = [
      ...longCandidates.map((id) => ({ positionId: id, direction: OrderDirection.LONG })),
      ...shortCandidates.map((id) => ({ positionId: id, direction: OrderDirection.SHORT })),
    ];

    if (candidates.length === 0) return;

    this.logger.log(`liq-candidates market=${market} candidates=${candidates.length} elapsed=${Date.now() - detectStart}ms`);

    await Promise.all(
      candidates.map(({ positionId, direction }) =>
        this.semaphore.run(async () => {
          const closeStart = Date.now();
          try {
            const result = await this.orderService.forceClose(positionId, currentPrice);
            this.logger.log(
              `liquidated positionId=${positionId} userId=${result.userId} ticker=${market} price=${currentPrice} closeMs=${Date.now() - closeStart}ms`,
            );
            this.eventEmitter.emit('socket.user.liquidation', {
              userId: result.userId,
              ticker: market,
              direction: result.direction,
            });
          } catch (e) {
            this.logger.error(`forceClose failed positionId=${positionId}`, e);
            await this.tickerRedisRepository.removeLiquidationIndex(positionId, market, direction).catch(() => {});
          }
        }),
      ),
    );
  }
}
