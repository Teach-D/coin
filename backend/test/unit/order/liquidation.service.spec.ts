import { LiquidationService } from 'src/domain/order/service/liquidation.service';
import { PositionRepository } from 'src/domain/order/repository/position.repository';
import { TickerRedisRepository } from 'src/domain/market/repository/ticker-redis.repository';
import { OrderService } from 'src/domain/order/service/order.service';
import { TickerPubSubSubscriber } from 'src/domain/market/service/ticker-pubsub.service';
import { OrderDirection } from 'src/domain/order/entity/order.entity';
import { Position, PositionStatus } from 'src/domain/order/entity/position.entity';
import { EventEmitter2 } from '@nestjs/event-emitter';

function makePosition(overrides: Partial<Position> = {}): Position {
  const p = new Position();
  p.id = overrides.id ?? 1;
  p.userId = overrides.userId ?? 100;
  p.ticker = overrides.ticker ?? 'KRW-BTC';
  p.direction = overrides.direction ?? OrderDirection.LONG;
  p.averagePrice = overrides.averagePrice ?? 50_000_000;
  p.leverage = overrides.leverage ?? 2;
  p.margin = overrides.margin ?? 1_000_000;
  p.quantity = overrides.quantity ?? '0.0200000000';
  p.status = overrides.status ?? PositionStatus.OPEN;
  p.version = overrides.version ?? 0;
  p.openedAt = overrides.openedAt ?? new Date();
  p.closedAt = overrides.closedAt ?? null;
  return p;
}

function makeTickerPayload(ticker: string, tradePrice: number) {
  return { market: ticker, tradePrice, code: ticker } as any;
}

function makeDeps(overrides: Partial<{
  positionRepo: Record<string, any>;
  tickerRedisRepo: Record<string, any>;
  orderService: Record<string, any>;
  subscriber: Record<string, any>;
}> = {}) {
  const positionRepo = {
    findAllByStatus: jest.fn().mockResolvedValue([]),
    ...overrides.positionRepo,
  } as unknown as PositionRepository;

  const tickerRedisRepo = {
    addLiquidationIndex: jest.fn().mockResolvedValue(undefined),
    removeLiquidationIndex: jest.fn().mockResolvedValue(undefined),
    getLiquidationCandidates: jest.fn().mockResolvedValue([]),
    ...overrides.tickerRedisRepo,
  } as any;

  const orderService = {
    forceClose: jest.fn().mockResolvedValue({ orderId: 999, userId: 100, direction: OrderDirection.LONG }),
    ...overrides.orderService,
  } as unknown as OrderService;

  const capturedHandlers: Array<(ticker: any) => void> = [];
  const subscriber = {
    onMessage: jest.fn().mockImplementation((handler: (ticker: any) => void) => {
      capturedHandlers.push(handler);
    }),
    ...overrides.subscriber,
  } as unknown as TickerPubSubSubscriber;

  const eventEmitter = {
    emit: jest.fn(),
  } as unknown as EventEmitter2;

  return { positionRepo, tickerRedisRepo, orderService, subscriber, capturedHandlers, eventEmitter };
}

describe('LiquidationService', () => {
  describe('onModuleInit — 인덱스 재적재', () => {
    it('OPEN_포지션_수만큼_addLiquidationIndex_호출', async () => {
      const positions = [
        makePosition({ id: 1, ticker: 'KRW-BTC', direction: OrderDirection.LONG }),
        makePosition({ id: 2, ticker: 'KRW-ETH', direction: OrderDirection.SHORT }),
        makePosition({ id: 3, ticker: 'KRW-BTC', direction: OrderDirection.LONG }),
      ];

      const { positionRepo, tickerRedisRepo, orderService, subscriber, eventEmitter } = makeDeps({
        positionRepo: { findAllByStatus: jest.fn().mockResolvedValue(positions) },
      });

      const service = new LiquidationService(positionRepo, tickerRedisRepo, orderService, subscriber, eventEmitter);
      await service.onModuleInit();

      expect(positionRepo.findAllByStatus).toHaveBeenCalledWith(PositionStatus.OPEN);
      expect(tickerRedisRepo.addLiquidationIndex).toHaveBeenCalledTimes(3);
    });

    it('OPEN_포지션마다_올바른_인자로_addLiquidationIndex_호출', async () => {
      const longPosition = makePosition({
        id: 10,
        ticker: 'KRW-BTC',
        direction: OrderDirection.LONG,
        averagePrice: 50_000_000,
        leverage: 2,
      });
      const expectedLiquidationPrice = longPosition.liquidationPrice();

      const { positionRepo, tickerRedisRepo, orderService, subscriber, eventEmitter } = makeDeps({
        positionRepo: { findAllByStatus: jest.fn().mockResolvedValue([longPosition]) },
      });

      const service = new LiquidationService(positionRepo, tickerRedisRepo, orderService, subscriber, eventEmitter);
      await service.onModuleInit();

      expect(tickerRedisRepo.addLiquidationIndex).toHaveBeenCalledWith(
        10,
        'KRW-BTC',
        OrderDirection.LONG,
        expectedLiquidationPrice,
      );
    });

    it('OPEN_포지션_없으면_addLiquidationIndex_미호출', async () => {
      const { positionRepo, tickerRedisRepo, orderService, subscriber, eventEmitter } = makeDeps({
        positionRepo: { findAllByStatus: jest.fn().mockResolvedValue([]) },
      });

      const service = new LiquidationService(positionRepo, tickerRedisRepo, orderService, subscriber, eventEmitter);
      await service.onModuleInit();

      expect(tickerRedisRepo.addLiquidationIndex).not.toHaveBeenCalled();
    });

    it('onModuleInit_완료_후_subscriber에_콜백_등록', async () => {
      const { positionRepo, tickerRedisRepo, orderService, subscriber, eventEmitter } = makeDeps();

      const service = new LiquidationService(positionRepo, tickerRedisRepo, orderService, subscriber, eventEmitter);
      await service.onModuleInit();

      expect(subscriber.onMessage).toHaveBeenCalledTimes(1);
    });
  });

  describe('시세 이벤트 수신 — LONG 포지션 청산', () => {
    it('LONG_청산_대상_존재시_forceClose_호출', async () => {
      const { positionRepo, tickerRedisRepo, orderService, subscriber, capturedHandlers, eventEmitter } = makeDeps({
        tickerRedisRepo: {
          addLiquidationIndex: jest.fn().mockResolvedValue(undefined),
          removeLiquidationIndex: jest.fn().mockResolvedValue(undefined),
          getLiquidationCandidates: jest.fn().mockImplementation(
            (_ticker: string, direction: OrderDirection) => {
              if (direction === OrderDirection.LONG) return Promise.resolve([11, 22]);
              return Promise.resolve([]);
            },
          ),
        },
      });

      const service = new LiquidationService(positionRepo, tickerRedisRepo, orderService, subscriber, eventEmitter);
      await service.onModuleInit();

      await capturedHandlers[0](makeTickerPayload('KRW-BTC', 40_000_000));

      expect(orderService.forceClose).toHaveBeenCalledWith(11, 40_000_000);
      expect(orderService.forceClose).toHaveBeenCalledWith(22, 40_000_000);
    });

    it('LONG_청산시_getLiquidationCandidates_LONG_방향으로_currentPrice_이하_조회', async () => {
      const getLiquidationCandidates = jest.fn().mockResolvedValue([]);
      const { positionRepo, tickerRedisRepo, orderService, subscriber, capturedHandlers, eventEmitter } = makeDeps({
        tickerRedisRepo: {
          addLiquidationIndex: jest.fn().mockResolvedValue(undefined),
          removeLiquidationIndex: jest.fn().mockResolvedValue(undefined),
          getLiquidationCandidates,
        },
      });

      const service = new LiquidationService(positionRepo, tickerRedisRepo, orderService, subscriber, eventEmitter);
      await service.onModuleInit();

      await capturedHandlers[0](makeTickerPayload('KRW-ETH', 3_500_000));

      expect(getLiquidationCandidates).toHaveBeenCalledWith('KRW-ETH', OrderDirection.LONG, 3_500_000);
    });
  });

  describe('시세 이벤트 수신 — SHORT 포지션 청산', () => {
    it('SHORT_청산_대상_존재시_forceClose_호출', async () => {
      const { positionRepo, tickerRedisRepo, orderService, subscriber, capturedHandlers, eventEmitter } = makeDeps({
        tickerRedisRepo: {
          addLiquidationIndex: jest.fn().mockResolvedValue(undefined),
          removeLiquidationIndex: jest.fn().mockResolvedValue(undefined),
          getLiquidationCandidates: jest.fn().mockImplementation(
            (_ticker: string, direction: OrderDirection) => {
              if (direction === OrderDirection.SHORT) return Promise.resolve([33]);
              return Promise.resolve([]);
            },
          ),
        },
      });

      const service = new LiquidationService(positionRepo, tickerRedisRepo, orderService, subscriber, eventEmitter);
      await service.onModuleInit();

      await capturedHandlers[0](makeTickerPayload('KRW-BTC', 60_000_000));

      expect(orderService.forceClose).toHaveBeenCalledWith(33, 60_000_000);
    });

    it('SHORT_청산시_getLiquidationCandidates_SHORT_방향으로_currentPrice_이상_조회', async () => {
      const getLiquidationCandidates = jest.fn().mockResolvedValue([]);
      const { positionRepo, tickerRedisRepo, orderService, subscriber, capturedHandlers, eventEmitter } = makeDeps({
        tickerRedisRepo: {
          addLiquidationIndex: jest.fn().mockResolvedValue(undefined),
          removeLiquidationIndex: jest.fn().mockResolvedValue(undefined),
          getLiquidationCandidates,
        },
      });

      const service = new LiquidationService(positionRepo, tickerRedisRepo, orderService, subscriber, eventEmitter);
      await service.onModuleInit();

      await capturedHandlers[0](makeTickerPayload('KRW-SOL', 200_000));

      expect(getLiquidationCandidates).toHaveBeenCalledWith('KRW-SOL', OrderDirection.SHORT, 200_000);
    });
  });

  describe('시세 이벤트 수신 — 청산 대상 없음', () => {
    it('청산_대상_없으면_forceClose_미호출', async () => {
      const { positionRepo, tickerRedisRepo, orderService, subscriber, capturedHandlers, eventEmitter } = makeDeps({
        tickerRedisRepo: {
          addLiquidationIndex: jest.fn().mockResolvedValue(undefined),
          removeLiquidationIndex: jest.fn().mockResolvedValue(undefined),
          getLiquidationCandidates: jest.fn().mockResolvedValue([]),
        },
      });

      const service = new LiquidationService(positionRepo, tickerRedisRepo, orderService, subscriber, eventEmitter);
      await service.onModuleInit();

      await capturedHandlers[0](makeTickerPayload('KRW-BTC', 50_000_000));

      expect(orderService.forceClose).not.toHaveBeenCalled();
    });
  });

  describe('forceClose 실패 격리', () => {
    it('단일_forceClose_실패시_나머지_포지션_처리_계속_진행', async () => {
      const forceClose = jest.fn()
        .mockRejectedValueOnce(new Error('DB error'))
        .mockResolvedValue({ orderId: 999 });

      const { positionRepo, tickerRedisRepo, orderService, subscriber, capturedHandlers, eventEmitter } = makeDeps({
        tickerRedisRepo: {
          addLiquidationIndex: jest.fn().mockResolvedValue(undefined),
          removeLiquidationIndex: jest.fn().mockResolvedValue(undefined),
          getLiquidationCandidates: jest.fn().mockImplementation(
            (_ticker: string, direction: OrderDirection) => {
              if (direction === OrderDirection.LONG) return Promise.resolve([100, 200]);
              return Promise.resolve([]);
            },
          ),
        },
        orderService: { forceClose },
      });

      const service = new LiquidationService(positionRepo, tickerRedisRepo, orderService, subscriber, eventEmitter);
      await service.onModuleInit();

      await expect(
        capturedHandlers[0](makeTickerPayload('KRW-BTC', 40_000_000)),
      ).resolves.not.toThrow();

      expect(forceClose).toHaveBeenCalledWith(100, 40_000_000);
      expect(forceClose).toHaveBeenCalledWith(200, 40_000_000);
    });

    it('forceClose_실패시_에러_던지지_않고_정상_완료', async () => {
      const forceClose = jest.fn().mockRejectedValue(new Error('position already closed'));

      const { positionRepo, tickerRedisRepo, orderService, subscriber, capturedHandlers, eventEmitter } = makeDeps({
        tickerRedisRepo: {
          addLiquidationIndex: jest.fn().mockResolvedValue(undefined),
          removeLiquidationIndex: jest.fn().mockResolvedValue(undefined),
          getLiquidationCandidates: jest.fn().mockImplementation(
            (_ticker: string, direction: OrderDirection) => {
              if (direction === OrderDirection.LONG) return Promise.resolve([50]);
              return Promise.resolve([]);
            },
          ),
        },
        orderService: { forceClose },
      });

      const service = new LiquidationService(positionRepo, tickerRedisRepo, orderService, subscriber, eventEmitter);
      await service.onModuleInit();

      await expect(
        capturedHandlers[0](makeTickerPayload('KRW-BTC', 35_000_000)),
      ).resolves.not.toThrow();
    });
  });

  describe('LONG + SHORT 동시 청산', () => {
    it('같은_ticker의_LONG_SHORT_청산_대상_동시에_forceClose_호출', async () => {
      const forceClose = jest.fn().mockResolvedValue({ orderId: 999 });

      const { positionRepo, tickerRedisRepo, orderService, subscriber, capturedHandlers, eventEmitter } = makeDeps({
        tickerRedisRepo: {
          addLiquidationIndex: jest.fn().mockResolvedValue(undefined),
          removeLiquidationIndex: jest.fn().mockResolvedValue(undefined),
          getLiquidationCandidates: jest.fn().mockImplementation(
            (_ticker: string, direction: OrderDirection) => {
              if (direction === OrderDirection.LONG) return Promise.resolve([1]);
              if (direction === OrderDirection.SHORT) return Promise.resolve([2]);
              return Promise.resolve([]);
            },
          ),
        },
        orderService: { forceClose },
      });

      const service = new LiquidationService(positionRepo, tickerRedisRepo, orderService, subscriber, eventEmitter);
      await service.onModuleInit();

      await capturedHandlers[0](makeTickerPayload('KRW-BTC', 50_000_000));

      expect(forceClose).toHaveBeenCalledTimes(2);
      expect(forceClose).toHaveBeenCalledWith(1, 50_000_000);
      expect(forceClose).toHaveBeenCalledWith(2, 50_000_000);
    });
  });
});
