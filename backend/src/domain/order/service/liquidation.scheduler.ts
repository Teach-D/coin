import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Server } from 'socket.io';
import { TickerRedisRepository } from '../../market/repository/ticker-redis.repository';
import { PositionRepository } from '../repository/position.repository';
import { PositionStatus } from '../entity/position.entity';
import { OrderDirection } from '../entity/order.entity';
import { OrderService } from './order.service';

@Injectable()
export class LiquidationScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LiquidationScheduler.name);
  private intervalId: ReturnType<typeof setInterval> | null = null;
  server?: Server;

  constructor(
    private readonly positionRepository: PositionRepository,
    private readonly tickerRedisRepository: TickerRedisRepository,
    private readonly orderService: OrderService,
  ) {}

  onModuleInit() {
    this.intervalId = setInterval(() => this.checkLiquidations(), 1000);
  }

  onModuleDestroy() {
    if (this.intervalId) clearInterval(this.intervalId);
  }

  private async checkLiquidations() {
    try {
      const openPositions = await this.positionRepository.findAllByStatus(PositionStatus.OPEN);
      for (const position of openPositions) {
        const ticker = await this.tickerRedisRepository.findByMarket(position.ticker);
        if (!ticker) continue;

        const currentPrice = Math.floor(ticker.tradePrice);
        const liquidationPrice = position.liquidationPrice();

        const shouldLiquidate =
          position.direction === OrderDirection.LONG
            ? currentPrice <= liquidationPrice
            : currentPrice >= liquidationPrice;

        if (shouldLiquidate) {
          try {
            await this.orderService.forceClose(position.id, liquidationPrice);
            this.logger.warn(
              `liquidated positionId=${position.id} userId=${position.userId} ticker=${position.ticker} price=${liquidationPrice}`,
            );
            if (this.server) {
              this.server.to(`user:${position.userId}`).emit('notification', {
                type: 'LIQUIDATION',
                ticker: position.ticker,
                positionType: position.direction,
                liquidatedAt: new Date().toISOString(),
              });
            }
          } catch (e) {
            this.logger.error(`forceClose failed positionId=${position.id}`, e);
          }
        }
      }
    } catch (e) {
      this.logger.error('liquidation check error', e);
    }
  }
}
