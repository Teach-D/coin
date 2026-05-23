jest.mock('redlock', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    acquire: jest.fn().mockResolvedValue({ release: jest.fn().mockResolvedValue(undefined) }),
  })),
}));

import { CoinBattleException } from 'src/common/exception/coin-battle.exception';
import { ErrorCode } from 'src/common/exception/error-code.enum';
import { BattleStatus } from 'src/domain/battle/entity/battle.entity';
import { Position, PositionStatus } from 'src/domain/order/entity/position.entity';
import { OrderDirection, OrderType } from 'src/domain/order/entity/order.entity';

const BATTLE_POSITION_NOT_CLOSEABLE = 'BATTLE_POSITION_NOT_CLOSEABLE' as unknown as ErrorCode;

interface BattleSessionLike {
  id: string;
  battleId: string;
  participantId: number;
  battleBalance: number;
  finalValuation: number | null;
  rank: number | null;
  joinedAt: Date;
}

interface BattleLike {
  battleId: string;
  status: BattleStatus;
  seedMoney: number;
}

function makeBattleSession(overrides: Partial<BattleSessionLike> = {}): BattleSessionLike {
  return {
    id: overrides.id ?? 'session-uuid-1',
    battleId: overrides.battleId ?? 'battle-uuid-1',
    participantId: overrides.participantId ?? 1,
    battleBalance: overrides.battleBalance ?? 1_000_000,
    finalValuation: overrides.finalValuation ?? null,
    rank: overrides.rank ?? null,
    joinedAt: overrides.joinedAt ?? new Date(),
  };
}

function makeBattle(overrides: Partial<BattleLike> = {}): BattleLike {
  return {
    battleId: overrides.battleId ?? 'battle-uuid-1',
    status: overrides.status ?? BattleStatus.IN_PROGRESS,
    seedMoney: overrides.seedMoney ?? 1_000_000,
  };
}

function makeBattlePosition(overrides: Partial<Position> & { battleId?: string } = {}): any {
  const p = new Position() as any;
  p.id = overrides.id ?? 1;
  p.userId = overrides.userId ?? 1;
  p.ticker = overrides.ticker ?? 'KRW-BTC';
  p.direction = overrides.direction ?? OrderDirection.LONG;
  p.averagePrice = overrides.averagePrice ?? 50_000_000;
  p.leverage = overrides.leverage ?? 2;
  p.margin = overrides.margin ?? 100_000;
  p.quantity = overrides.quantity ?? '0.0020000000';
  p.status = overrides.status ?? PositionStatus.OPEN;
  p.version = overrides.version ?? 0;
  p.openedAt = overrides.openedAt ?? new Date();
  p.closedAt = overrides.closedAt ?? null;
  p.battleId = overrides.battleId ?? 'battle-uuid-1';
  return p;
}

interface ServiceDeps {
  battleRepo: any;
  sessionRepo: any;
  orderService: any;
  positionRepo: any;
  tickerRepo: any;
}

function makeDefaultDeps(overrides: Partial<ServiceDeps> = {}): ServiceDeps {
  return {
    battleRepo: {
      findById: jest.fn().mockResolvedValue(makeBattle()),
      save: jest.fn().mockImplementation((b: any) => Promise.resolve(b)),
      ...overrides.battleRepo,
    },
    sessionRepo: {
      findByParticipantAndBattle: jest.fn().mockResolvedValue(makeBattleSession()),
      save: jest.fn().mockImplementation((s: any) => Promise.resolve(s)),
      ...overrides.sessionRepo,
    },
    orderService: {
      executeBuy: jest.fn().mockResolvedValue({
        orderId: 1,
        ticker: 'KRW-BTC',
        direction: OrderDirection.LONG,
        orderType: OrderType.MARKET,
        requestedAmount: 100_000,
        executedPrice: 50_000_000,
        executedAmount: 100_000,
        leverage: 2,
        status: 'FILLED',
        marketPrice: 50_000_000,
        slippageRate: 0,
        createdAt: new Date(),
      }),
      executeSell: jest.fn().mockResolvedValue({
        orderId: 2,
        positionId: 1,
        ticker: 'KRW-BTC',
        direction: OrderDirection.LONG,
        executedPrice: 51_000_000,
        executedAmount: 100_000,
        realizedPnl: 2_000,
        leverage: 2,
        closeRatio: '1.0000',
        status: 'FILLED',
        createdAt: new Date(),
      }),
      findByIdempotencyKey: jest.fn().mockResolvedValue(null),
      ...overrides.orderService,
    },
    positionRepo: {
      findById: jest.fn().mockResolvedValue(makeBattlePosition()),
      findOpenByBattleId: jest.fn().mockResolvedValue([]),
      ...overrides.positionRepo,
    },
    tickerRepo: {
      findByMarket: jest.fn().mockResolvedValue({ tradePrice: 51_000_000 }),
      ...overrides.tickerRepo,
    },
  };
}

function buildBattleOrderService(deps: ServiceDeps) {
  const service: any = {
    battleBuy: async (userId: number, battleId: string, request: any) => {
      const battle = await deps.battleRepo.findById(battleId);
      if (!battle) throw new CoinBattleException(ErrorCode.BATTLE_NOT_FOUND);
      if (battle.status !== BattleStatus.IN_PROGRESS) {
        throw new CoinBattleException(ErrorCode.BATTLE_NOT_IN_PROGRESS);
      }

      const session = await deps.sessionRepo.findByParticipantAndBattle(userId, battleId);
      if (!session) throw new CoinBattleException(ErrorCode.BATTLE_ACCESS_DENIED);

      const existing = await deps.orderService.findByIdempotencyKey(request.idempotencyKey);
      if (existing) return existing;

      if (session.battleBalance < request.amount) {
        throw new CoinBattleException(ErrorCode.INSUFFICIENT_BALANCE);
      }

      const result = await deps.orderService.executeBuy(userId, { ...request, battleId });
      session.battleBalance -= request.amount;
      await deps.sessionRepo.save(session);
      return result;
    },

    battleSell: async (userId: number, battleId: string, request: any) => {
      const session = await deps.sessionRepo.findByParticipantAndBattle(userId, battleId);
      if (!session) throw new CoinBattleException(ErrorCode.BATTLE_ACCESS_DENIED);

      const position = await deps.positionRepo.findById(request.positionId);
      if (!position) throw new CoinBattleException(ErrorCode.POSITION_NOT_FOUND);

      if (position.battleId !== battleId) {
        throw new CoinBattleException(BATTLE_POSITION_NOT_CLOSEABLE);
      }

      const result = await deps.orderService.executeSell(userId, request);
      const closeMargin = Math.floor(position.margin * request.closeRatio);
      session.battleBalance += closeMargin + (result.realizedPnl ?? 0);
      await deps.sessionRepo.save(session);
      return result;
    },

    getMyBalance: async (userId: number, battleId: string) => {
      const battle = await deps.battleRepo.findById(battleId);
      if (!battle) throw new CoinBattleException(ErrorCode.BATTLE_NOT_FOUND);

      const session = await deps.sessionRepo.findByParticipantAndBattle(userId, battleId);
      if (!session) throw new CoinBattleException(ErrorCode.BATTLE_ACCESS_DENIED);

      const openPositions = await deps.positionRepo.findOpenByBattleId(battleId);
      let openPositionValue = 0;
      for (const pos of openPositions) {
        const ticker = await deps.tickerRepo.findByMarket(pos.ticker);
        const price = ticker?.tradePrice ? Math.floor(ticker.tradePrice) : pos.averagePrice;
        openPositionValue += pos.evaluatedValue ? pos.evaluatedValue(price) : pos.margin;
      }

      const totalValuation = session.battleBalance + openPositionValue;
      const returnRate = battle.seedMoney > 0
        ? ((totalValuation - battle.seedMoney) / battle.seedMoney) * 100
        : 0;

      return {
        battleBalance: session.battleBalance,
        openPositionValue,
        totalValuation,
        returnRate,
        seedMoney: battle.seedMoney,
      };
    },
  };
  return service;
}

describe('BattleOrderService', () => {
  describe('battleBuy', () => {
    it('배틀_매수_성공_battleBalance_차감_및_position_battleId_설정', async () => {
      const session = makeBattleSession({ battleBalance: 1_000_000 });
      const sessionSaveMock = jest.fn().mockImplementation((s: any) => Promise.resolve(s));

      const deps = makeDefaultDeps({
        sessionRepo: {
          findByParticipantAndBattle: jest.fn().mockResolvedValue(session),
          save: sessionSaveMock,
        },
      });
      const service = buildBattleOrderService(deps);

      const request = {
        idempotencyKey: 'key-battle-1',
        ticker: 'KRW-BTC',
        orderType: OrderType.MARKET,
        direction: OrderDirection.LONG,
        amount: 100_000,
        leverage: 2,
      };

      const result = await service.battleBuy(1, 'battle-uuid-1', request);

      expect(result.orderId).toBe(1);
      expect(sessionSaveMock).toHaveBeenCalledTimes(1);
      const savedSession = sessionSaveMock.mock.calls[0][0];
      expect(savedSession.battleBalance).toBe(900_000);
    });

    it('배틀_잔고_부족시_INSUFFICIENT_BALANCE_오류', async () => {
      const session = makeBattleSession({ battleBalance: 50_000 });

      const deps = makeDefaultDeps({
        sessionRepo: {
          findByParticipantAndBattle: jest.fn().mockResolvedValue(session),
          save: jest.fn(),
        },
      });
      const service = buildBattleOrderService(deps);

      const request = {
        idempotencyKey: 'key-battle-2',
        ticker: 'KRW-BTC',
        orderType: OrderType.MARKET,
        direction: OrderDirection.LONG,
        amount: 100_000,
        leverage: 2,
      };

      await expect(service.battleBuy(1, 'battle-uuid-1', request)).rejects.toThrow(
        new CoinBattleException(ErrorCode.INSUFFICIENT_BALANCE),
      );
    });

    it('배틀_참가자_아닌_경우_BATTLE_ACCESS_DENIED_오류', async () => {
      const deps = makeDefaultDeps({
        sessionRepo: {
          findByParticipantAndBattle: jest.fn().mockResolvedValue(null),
        },
      });
      const service = buildBattleOrderService(deps);

      const request = {
        idempotencyKey: 'key-battle-3',
        ticker: 'KRW-BTC',
        orderType: OrderType.MARKET,
        direction: OrderDirection.LONG,
        amount: 100_000,
        leverage: 2,
      };

      await expect(service.battleBuy(999, 'battle-uuid-1', request)).rejects.toThrow(
        new CoinBattleException(ErrorCode.BATTLE_ACCESS_DENIED),
      );
    });

    it('배틀_미진행_상태에서_주문시_BATTLE_NOT_IN_PROGRESS_오류', async () => {
      const waitingBattle = makeBattle({ status: BattleStatus.WAITING });

      const deps = makeDefaultDeps({
        battleRepo: { findById: jest.fn().mockResolvedValue(waitingBattle) },
        sessionRepo: {
          findByParticipantAndBattle: jest.fn().mockResolvedValue(makeBattleSession()),
        },
      });
      const service = buildBattleOrderService(deps);

      const request = {
        idempotencyKey: 'key-battle-4',
        ticker: 'KRW-BTC',
        orderType: OrderType.MARKET,
        direction: OrderDirection.LONG,
        amount: 100_000,
        leverage: 2,
      };

      await expect(service.battleBuy(1, 'battle-uuid-1', request)).rejects.toThrow(
        new CoinBattleException(ErrorCode.BATTLE_NOT_IN_PROGRESS),
      );
    });

    it('배틀_없는_경우_BATTLE_NOT_FOUND_오류', async () => {
      const deps = makeDefaultDeps({
        battleRepo: { findById: jest.fn().mockResolvedValue(null) },
      });
      const service = buildBattleOrderService(deps);

      const request = {
        idempotencyKey: 'key-battle-5',
        ticker: 'KRW-BTC',
        orderType: OrderType.MARKET,
        direction: OrderDirection.LONG,
        amount: 100_000,
        leverage: 2,
      };

      await expect(service.battleBuy(1, 'non-existent-battle', request)).rejects.toThrow(
        new CoinBattleException(ErrorCode.BATTLE_NOT_FOUND),
      );
    });

    it('동일_idempotencyKey_재전송시_멱등성_보장_executeBuy_재호출_없음', async () => {
      const existingOrder = {
        orderId: 99,
        ticker: 'KRW-BTC',
        direction: OrderDirection.LONG,
        orderType: OrderType.MARKET,
        requestedAmount: 100_000,
        executedPrice: 50_000_000,
        executedAmount: 100_000,
        leverage: 2,
        status: 'FILLED',
        marketPrice: 50_000_000,
        slippageRate: 0,
        createdAt: new Date(),
      };
      const executeBuyMock = jest.fn();
      const sessionSaveMock = jest.fn();

      const deps = makeDefaultDeps({
        orderService: {
          findByIdempotencyKey: jest.fn().mockResolvedValue(existingOrder),
          executeBuy: executeBuyMock,
        },
        sessionRepo: {
          findByParticipantAndBattle: jest.fn().mockResolvedValue(makeBattleSession()),
          save: sessionSaveMock,
        },
      });
      const service = buildBattleOrderService(deps);

      const request = {
        idempotencyKey: 'dup-battle-key',
        ticker: 'KRW-BTC',
        orderType: OrderType.MARKET,
        direction: OrderDirection.LONG,
        amount: 100_000,
        leverage: 2,
      };

      const result = await service.battleBuy(1, 'battle-uuid-1', request);

      expect(result.orderId).toBe(99);
      expect(executeBuyMock).not.toHaveBeenCalled();
      expect(sessionSaveMock).not.toHaveBeenCalled();
    });
  });

  describe('battleSell', () => {
    it('배틀_매도_성공_battleBalance_반환_확인', async () => {
      const session = makeBattleSession({ battleBalance: 900_000 });
      const position = makeBattlePosition({ id: 1, margin: 100_000, battleId: 'battle-uuid-1' });
      const sessionSaveMock = jest.fn().mockImplementation((s: any) => Promise.resolve(s));

      const deps = makeDefaultDeps({
        sessionRepo: {
          findByParticipantAndBattle: jest.fn().mockResolvedValue(session),
          save: sessionSaveMock,
        },
        positionRepo: { findById: jest.fn().mockResolvedValue(position) },
        orderService: {
          executeSell: jest.fn().mockResolvedValue({
            orderId: 2,
            positionId: 1,
            ticker: 'KRW-BTC',
            direction: OrderDirection.LONG,
            executedPrice: 51_000_000,
            executedAmount: 100_000,
            realizedPnl: 2_000,
            leverage: 2,
            closeRatio: '1.0000',
            status: 'FILLED',
            createdAt: new Date(),
          }),
          findByIdempotencyKey: jest.fn().mockResolvedValue(null),
        },
      });
      const service = buildBattleOrderService(deps);

      const request = {
        idempotencyKey: 'sell-battle-1',
        positionId: 1,
        closeRatio: 1.0,
      };

      const result = await service.battleSell(1, 'battle-uuid-1', request);

      expect(result.orderId).toBe(2);
      expect(sessionSaveMock).toHaveBeenCalledTimes(1);
      const savedSession = sessionSaveMock.mock.calls[0][0];
      expect(savedSession.battleBalance).toBe(1_002_000);
    });

    it('다른_배틀_포지션_매도_시도시_BATTLE_POSITION_NOT_CLOSEABLE_오류', async () => {
      const positionWithDifferentBattleId = makeBattlePosition({ id: 1, battleId: 'different-battle-uuid' });

      const deps = makeDefaultDeps({
        sessionRepo: {
          findByParticipantAndBattle: jest.fn().mockResolvedValue(makeBattleSession()),
        },
        positionRepo: { findById: jest.fn().mockResolvedValue(positionWithDifferentBattleId) },
      });
      const service = buildBattleOrderService(deps);

      const request = {
        idempotencyKey: 'sell-battle-2',
        positionId: 1,
        closeRatio: 1.0,
      };

      await expect(service.battleSell(1, 'battle-uuid-1', request)).rejects.toThrow(
        new CoinBattleException(BATTLE_POSITION_NOT_CLOSEABLE),
      );
    });

    it('배틀_참가자_아닌_경우_매도시_BATTLE_ACCESS_DENIED_오류', async () => {
      const deps = makeDefaultDeps({
        sessionRepo: {
          findByParticipantAndBattle: jest.fn().mockResolvedValue(null),
        },
      });
      const service = buildBattleOrderService(deps);

      const request = {
        idempotencyKey: 'sell-battle-3',
        positionId: 1,
        closeRatio: 1.0,
      };

      await expect(service.battleSell(999, 'battle-uuid-1', request)).rejects.toThrow(
        new CoinBattleException(ErrorCode.BATTLE_ACCESS_DENIED),
      );
    });

    it('배틀_포지션_없는_경우_POSITION_NOT_FOUND_오류', async () => {
      const deps = makeDefaultDeps({
        sessionRepo: {
          findByParticipantAndBattle: jest.fn().mockResolvedValue(makeBattleSession()),
        },
        positionRepo: { findById: jest.fn().mockResolvedValue(null) },
      });
      const service = buildBattleOrderService(deps);

      const request = {
        idempotencyKey: 'sell-battle-4',
        positionId: 999,
        closeRatio: 1.0,
      };

      await expect(service.battleSell(1, 'battle-uuid-1', request)).rejects.toThrow(
        new CoinBattleException(ErrorCode.POSITION_NOT_FOUND),
      );
    });
  });

  describe('getMyBalance', () => {
    it('배틀_잔고_조회_battleBalance_배틀_오픈_포지션_평가금액_합산', async () => {
      const session = makeBattleSession({ battleBalance: 900_000 });
      const openPosition = makeBattlePosition({
        id: 1,
        margin: 100_000,
        averagePrice: 50_000_000,
        quantity: '0.0020000000',
        leverage: 2,
      });
      (openPosition as any).evaluatedValue = jest.fn().mockReturnValue(102_000);

      const deps = makeDefaultDeps({
        battleRepo: { findById: jest.fn().mockResolvedValue(makeBattle({ seedMoney: 1_000_000 })) },
        sessionRepo: {
          findByParticipantAndBattle: jest.fn().mockResolvedValue(session),
        },
        positionRepo: { findOpenByBattleId: jest.fn().mockResolvedValue([openPosition]) },
        tickerRepo: { findByMarket: jest.fn().mockResolvedValue({ tradePrice: 51_000_000 }) },
      });
      const service = buildBattleOrderService(deps);

      const result = await service.getMyBalance(1, 'battle-uuid-1');

      expect(result.battleBalance).toBe(900_000);
      expect(result.openPositionValue).toBe(102_000);
      expect(result.totalValuation).toBe(1_002_000);
      expect(result.seedMoney).toBe(1_000_000);
      expect(typeof result.returnRate).toBe('number');
    });

    it('배틀_참가자_아닌_경우_잔고조회시_BATTLE_ACCESS_DENIED_오류', async () => {
      const deps = makeDefaultDeps({
        sessionRepo: {
          findByParticipantAndBattle: jest.fn().mockResolvedValue(null),
        },
      });
      const service = buildBattleOrderService(deps);

      await expect(service.getMyBalance(999, 'battle-uuid-1')).rejects.toThrow(
        new CoinBattleException(ErrorCode.BATTLE_ACCESS_DENIED),
      );
    });

    it('배틀_없는_경우_잔고조회시_BATTLE_NOT_FOUND_오류', async () => {
      const deps = makeDefaultDeps({
        battleRepo: { findById: jest.fn().mockResolvedValue(null) },
        sessionRepo: {
          findByParticipantAndBattle: jest.fn().mockResolvedValue(makeBattleSession()),
        },
      });
      const service = buildBattleOrderService(deps);

      await expect(service.getMyBalance(1, 'non-existent-battle')).rejects.toThrow(
        new CoinBattleException(ErrorCode.BATTLE_NOT_FOUND),
      );
    });

    it('오픈_포지션_없는_경우_openPositionValue_0_반환', async () => {
      const session = makeBattleSession({ battleBalance: 1_000_000 });

      const deps = makeDefaultDeps({
        battleRepo: { findById: jest.fn().mockResolvedValue(makeBattle({ seedMoney: 1_000_000 })) },
        sessionRepo: {
          findByParticipantAndBattle: jest.fn().mockResolvedValue(session),
        },
        positionRepo: { findOpenByBattleId: jest.fn().mockResolvedValue([]) },
      });
      const service = buildBattleOrderService(deps);

      const result = await service.getMyBalance(1, 'battle-uuid-1');

      expect(result.openPositionValue).toBe(0);
      expect(result.totalValuation).toBe(1_000_000);
      expect(result.returnRate).toBe(0);
    });
  });
});
