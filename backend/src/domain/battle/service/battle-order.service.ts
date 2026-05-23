import { Injectable } from '@nestjs/common';
import Redlock from 'redlock';
import { CoinBattleException } from '../../../common/exception/coin-battle.exception';
import { ErrorCode } from '../../../common/exception/error-code.enum';
import { RedisService } from '../../../common/config/redis.config';
import { BattleRepository } from '../repository/battle.repository';
import { BattleSessionRepository } from '../repository/battle-session.repository';
import { PositionRepository } from '../../order/repository/position.repository';
import { TickerRedisRepository } from '../../market/repository/ticker-redis.repository';
import { OrderService } from '../../order/service/order.service';
import { BuyOrderRequest, SellOrderRequest } from '../../order/dto/order-request.dto';
import { OrderResponse } from '../../order/dto/order-response.dto';
import { BattleStatus } from '../entity/battle.entity';
import { BattleBalanceResponse } from '../dto/battle-response.dto';

@Injectable()
export class BattleOrderService {
  private readonly redlock: Redlock;

  constructor(
    private readonly battleRepository: BattleRepository,
    private readonly battleSessionRepository: BattleSessionRepository,
    private readonly positionRepository: PositionRepository,
    private readonly tickerRedisRepository: TickerRedisRepository,
    private readonly orderService: OrderService,
    private readonly redisService: RedisService,
  ) {
    this.redlock = new Redlock([this.redisService.client], {
      retryCount: 0,
      retryDelay: 0,
    });
  }

  async battleBuy(userId: number, battleId: string, request: BuyOrderRequest): Promise<OrderResponse> {
    let lock: any;
    try {
      lock = await this.redlock.acquire([`user:${userId}:order`], 3000);
    } catch {
      throw new CoinBattleException(ErrorCode.ORDER_LOCK_TIMEOUT);
    }

    try {
      const battle = await this.battleRepository.findById(battleId);
      if (!battle) throw new CoinBattleException(ErrorCode.BATTLE_NOT_FOUND);
      if (battle.status !== BattleStatus.IN_PROGRESS) {
        throw new CoinBattleException(ErrorCode.BATTLE_NOT_IN_PROGRESS);
      }

      const session = await this.battleSessionRepository.findByParticipantAndBattle(userId, battleId);
      if (!session) throw new CoinBattleException(ErrorCode.BATTLE_ACCESS_DENIED);

      const existing = await this.orderService.findByIdempotencyKey(request.idempotencyKey);
      if (existing) return existing;

      if (session.battleBalance < request.amount) {
        throw new CoinBattleException(ErrorCode.INSUFFICIENT_BALANCE);
      }

      const result = await this.orderService.executeBuy(userId, { ...request, battleId });
      session.battleBalance -= request.amount;
      await this.battleSessionRepository.save(session);
      return result;
    } finally {
      await lock.release().catch(() => {});
    }
  }

  async battleSell(userId: number, battleId: string, request: SellOrderRequest): Promise<OrderResponse> {
    let lock: any;
    try {
      lock = await this.redlock.acquire([`user:${userId}:order`], 3000);
    } catch {
      throw new CoinBattleException(ErrorCode.ORDER_LOCK_TIMEOUT);
    }

    try {
      const session = await this.battleSessionRepository.findByParticipantAndBattle(userId, battleId);
      if (!session) throw new CoinBattleException(ErrorCode.BATTLE_ACCESS_DENIED);

      const position = await this.positionRepository.findById(request.positionId);
      if (!position) throw new CoinBattleException(ErrorCode.POSITION_NOT_FOUND);
      if (Number(position.userId) !== userId) throw new CoinBattleException(ErrorCode.POSITION_NOT_OWNED);

      if (position.battleId !== battleId) {
        throw new CoinBattleException(ErrorCode.BATTLE_POSITION_NOT_CLOSEABLE);
      }

      const existing = await this.orderService.findByIdempotencyKey(request.idempotencyKey);
      if (existing) return existing;

      const result = await this.orderService.executeSell(userId, { ...request, battleId });
      const closeMargin = Math.floor(position.margin * request.closeRatio);
      session.battleBalance += closeMargin + (result.realizedPnl ?? 0);
      await this.battleSessionRepository.save(session);
      return result;
    } finally {
      await lock.release().catch(() => {});
    }
  }

  async getMyBalance(userId: number, battleId: string): Promise<BattleBalanceResponse> {
    const battle = await this.battleRepository.findById(battleId);
    if (!battle) throw new CoinBattleException(ErrorCode.BATTLE_NOT_FOUND);

    const session = await this.battleSessionRepository.findByParticipantAndBattle(userId, battleId);
    if (!session) throw new CoinBattleException(ErrorCode.BATTLE_ACCESS_DENIED);

    const openPositions = await this.positionRepository.findOpenByUserIdAndBattleId(userId, battleId);
    let openPositionValue = 0;
    for (const pos of openPositions) {
      const ticker = await this.tickerRedisRepository.findByMarket(pos.ticker);
      const price = ticker?.tradePrice ? Math.floor(ticker.tradePrice) : pos.averagePrice;
      openPositionValue += pos.evaluatedValue(price);
    }

    const totalValuation = session.battleBalance + openPositionValue;
    const returnRate =
      battle.seedMoney > 0 ? ((totalValuation - battle.seedMoney) / battle.seedMoney) * 100 : 0;

    return {
      battleBalance: session.battleBalance,
      openPositionValue,
      totalValuation,
      returnRate,
      seedMoney: battle.seedMoney,
    };
  }

  async getBattlePositions(userId: number, battleId: string) {
    const session = await this.battleSessionRepository.findByParticipantAndBattle(userId, battleId);
    if (!session) throw new CoinBattleException(ErrorCode.BATTLE_ACCESS_DENIED);

    const positions = await this.positionRepository.findOpenByUserIdAndBattleId(userId, battleId);

    const result = await Promise.all(
      positions.map(async (pos) => {
        const ticker = await this.tickerRedisRepository.findByMarket(pos.ticker);
        const currentPrice = ticker?.tradePrice ? Math.floor(ticker.tradePrice) : Number(pos.averagePrice);
        const unrealizedPnl = pos.unrealizedPnl(currentPrice);
        const evaluatedValue = pos.evaluatedValue(currentPrice);
        const unrealizedPnlRate =
          pos.margin > 0 ? (unrealizedPnl / pos.margin) * 100 : 0;

        return {
          positionId: Number(pos.id),
          ticker: pos.ticker,
          direction: pos.direction,
          quantity: parseFloat(pos.quantity),
          averagePrice: Number(pos.averagePrice),
          leverage: pos.leverage,
          currentPrice,
          evaluatedValue,
          unrealizedPnl,
          unrealizedPnlRate: Math.round(unrealizedPnlRate * 100) / 100,
          liquidationPrice: pos.liquidationPrice(),
          status: pos.status,
          openedAt: pos.openedAt.toISOString(),
        };
      }),
    );

    return { positions: result };
  }

  async findByIdempotencyKey(key: string): Promise<OrderResponse | null> {
    return this.orderService.findByIdempotencyKey(key);
  }
}
