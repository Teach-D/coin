jest.mock('redlock', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    acquire: jest.fn().mockResolvedValue({ release: jest.fn().mockResolvedValue(undefined) }),
  })),
}));

import { OrderService } from 'src/domain/order/service/order.service';
import { UserRepository } from 'src/domain/user/repository/user.repository';
import { OrderRepository } from 'src/domain/order/repository/order.repository';
import { PositionRepository } from 'src/domain/order/repository/position.repository';
import { TickerRedisRepository } from 'src/domain/market/repository/ticker-redis.repository';
import { RedisService } from 'src/common/config/redis.config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { CoinBattleException } from 'src/common/exception/coin-battle.exception';
import { ErrorCode } from 'src/common/exception/error-code.enum';
import { OrderType, OrderDirection } from 'src/domain/order/entity/order.entity';
import { PositionStatus } from 'src/domain/order/entity/position.entity';
import { User } from 'src/domain/user/entity/user.entity';

function makeOrderService(overrides: Partial<{
  userRepo: Partial<UserRepository>;
  orderRepo: Partial<OrderRepository>;
  positionRepo: Partial<PositionRepository>;
  tickerRepo: Partial<TickerRedisRepository>;
}>= {}): OrderService {
  const userRepo = { findById: jest.fn(), save: jest.fn(), ...overrides.userRepo } as any;
  const orderRepo = {
    findByIdempotencyKey: jest.fn().mockResolvedValue(null),
    existsByIdempotencyKey: jest.fn().mockResolvedValue(false),
    findByUserIdOrderByCreatedAtDesc: jest.fn().mockResolvedValue([]),
    save: jest.fn(),
    ...overrides.orderRepo,
  } as any;
  const positionRepo = {
    findById: jest.fn(),
    findByUserIdAndStatus: jest.fn().mockResolvedValue([]),
    findAllByStatus: jest.fn().mockResolvedValue([]),
    findByUserIdAndTickerAndDirectionAndStatus: jest.fn().mockResolvedValue(null),
    save: jest.fn(),
    ...overrides.positionRepo,
  } as any;
  const tickerRepo = {
    findByMarket: jest.fn(),
    ...overrides.tickerRepo,
  } as any;
  const redisService = { client: { get: jest.fn(), set: jest.fn() } } as any;
  const eventEmitter = { emit: jest.fn() } as any;

  const manager = {
    save: jest.fn().mockImplementation((entity) => Promise.resolve({ ...entity, id: entity.id ?? 1 })),
  };
  const dataSource = {
    transaction: jest.fn().mockImplementation((cb: (manager: any) => Promise<any>) => cb(manager)),
  } as any;

  return new OrderService(userRepo, orderRepo, positionRepo, tickerRepo, redisService, eventEmitter, dataSource);
}

describe('OrderService', () => {
  describe('슬리피지 계산', () => {
    it('주문금액_100만원_이하_슬리피지_없음', async () => {
      const user = { id: 1, balance: 5_000_000, version: 0 } as User;
      const service = makeOrderService({
        userRepo: { findById: jest.fn().mockResolvedValue(user), save: jest.fn().mockResolvedValue(user) },
        tickerRepo: { findByMarket: jest.fn().mockResolvedValue({ tradePrice: 50000 }) },
      });

      const request = {
        idempotencyKey: 'key-1',
        ticker: 'KRW-BTC',
        orderType: OrderType.MARKET,
        direction: OrderDirection.LONG,
        amount: 500_000,
        leverage: 1,
      };

      const result = await service.buy(1, request);
      expect(result.slippageRate).toBe(0);
      expect(result.marketPrice).toBe(50000);
    });

    it('주문금액_100만원_초과_500만원_이하_슬리피지_0.05퍼센트', async () => {
      const user = { id: 1, balance: 10_000_000, version: 0 } as User;
      const service = makeOrderService({
        userRepo: { findById: jest.fn().mockResolvedValue(user), save: jest.fn().mockResolvedValue(user) },
        tickerRepo: { findByMarket: jest.fn().mockResolvedValue({ tradePrice: 50000 }) },
      });

      const request = {
        idempotencyKey: 'key-2',
        ticker: 'KRW-BTC',
        orderType: OrderType.MARKET,
        direction: OrderDirection.LONG,
        amount: 2_000_000,
        leverage: 1,
      };

      const result = await service.buy(1, request);
      expect(Math.abs(result.slippageRate!)).toBeCloseTo(0.0005, 4);
    });

    it('주문금액_500만원_초과_슬리피지_0.1_0.3퍼센트_사이', async () => {
      const user = { id: 1, balance: 10_000_000, version: 0 } as User;
      const service = makeOrderService({
        userRepo: { findById: jest.fn().mockResolvedValue(user), save: jest.fn().mockResolvedValue(user) },
        tickerRepo: { findByMarket: jest.fn().mockResolvedValue({ tradePrice: 50000 }) },
      });

      const request = {
        idempotencyKey: 'key-3',
        ticker: 'KRW-BTC',
        orderType: OrderType.MARKET,
        direction: OrderDirection.LONG,
        amount: 6_000_000,
        leverage: 1,
      };

      const result = await service.buy(1, request);
      const absRate = Math.abs(result.slippageRate!);
      expect(absRate).toBeGreaterThanOrEqual(0.001);
      expect(absRate).toBeLessThanOrEqual(0.003);
    });
  });

  describe('잔고 검증', () => {
    it('잔고_부족시_CoinBattleException_발생', async () => {
      const user = { id: 1, balance: 100_000, version: 0 } as User;
      const service = makeOrderService({
        userRepo: { findById: jest.fn().mockResolvedValue(user), save: jest.fn().mockResolvedValue(user) },
        tickerRepo: { findByMarket: jest.fn().mockResolvedValue({ tradePrice: 50000 }) },
      });

      const request = {
        idempotencyKey: 'key-4',
        ticker: 'KRW-BTC',
        orderType: OrderType.MARKET,
        direction: OrderDirection.LONG,
        amount: 500_000,
        leverage: 1,
      };

      await expect(service.buy(1, request)).rejects.toThrow(
        new CoinBattleException(ErrorCode.INSUFFICIENT_BALANCE),
      );
    });
  });

  describe('멱등성', () => {
    it('동일_idempotencyKey_재요청시_기존_주문_반환', async () => {
      const existingOrder = {
        id: 99,
        idempotencyKey: 'dup-key',
        ticker: 'KRW-BTC',
        status: 'FILLED',
        createdAt: new Date(),
      } as any;

      const service = makeOrderService({
        orderRepo: { findByIdempotencyKey: jest.fn().mockResolvedValue(existingOrder) },
      });

      const request = {
        idempotencyKey: 'dup-key',
        ticker: 'KRW-BTC',
        orderType: OrderType.MARKET,
        direction: OrderDirection.LONG,
        amount: 500_000,
        leverage: 1,
      };

      const result = await service.buy(1, request);
      expect(result.orderId).toBe(99);
    });
  });

  describe('지정가 주문 검증', () => {
    it('LIMIT_주문에_limitPrice_없으면_예외_발생', async () => {
      const service = makeOrderService();

      const request = {
        idempotencyKey: 'key-limit',
        ticker: 'KRW-BTC',
        orderType: OrderType.LIMIT,
        direction: OrderDirection.LONG,
        amount: 500_000,
        leverage: 1,
      };

      await expect(service.buy(1, request)).rejects.toThrow(
        new CoinBattleException(ErrorCode.LIMIT_PRICE_REQUIRED),
      );
    });
  });
});
