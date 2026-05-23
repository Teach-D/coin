import { BattleEndService } from 'src/domain/battle/service/battle-end.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Battle, BattleStatus } from 'src/domain/battle/entity/battle.entity';
import { BattleSession } from 'src/domain/battle/entity/battle-session.entity';
import { Position, PositionStatus } from 'src/domain/order/entity/position.entity';
import { User } from 'src/domain/user/entity/user.entity';
import { OrderDirection } from 'src/domain/order/entity/order.entity';

interface BattleSessionLike extends BattleSession {
  battleBalance: number;
}

function makeBattle(overrides: Partial<Battle> = {}): Battle {
  const battle = new Battle();
  battle.battleId = overrides.battleId ?? 'battle-uuid-1';
  battle.status = overrides.status ?? BattleStatus.IN_PROGRESS;
  battle.seedMoney = overrides.seedMoney ?? 1_000_000;
  battle.leverage = overrides.leverage ?? 2;
  battle.duration = overrides.duration ?? 10;
  battle.maxParticipants = overrides.maxParticipants ?? 2;
  battle.currentParticipants = overrides.currentParticipants ?? 2;
  battle.hostUserId = overrides.hostUserId ?? 1;
  battle.userId = overrides.userId ?? 1;
  battle.winnerId = overrides.winnerId ?? null;
  battle.startTime = overrides.startTime !== undefined ? overrides.startTime : new Date(Date.now() - 11 * 60 * 1000);
  battle.endTime = overrides.endTime ?? null;
  return battle;
}

function makeBattleSession(overrides: Partial<BattleSessionLike> = {}): BattleSessionLike {
  const session = new BattleSession() as BattleSessionLike;
  session.id = overrides.id ?? 'session-uuid-1';
  session.battleId = overrides.battleId ?? 'battle-uuid-1';
  session.participantId = overrides.participantId ?? 1;
  session.battleBalance = overrides.battleBalance ?? 900_000;
  session.finalValuation = overrides.finalValuation ?? null;
  session.rank = overrides.rank ?? null;
  session.joinedAt = overrides.joinedAt ?? new Date();
  return session;
}

function makeBattlePosition(overrides: Partial<Position> & { battleId?: string } = {}): Position & { battleId?: string } {
  const p = new Position() as Position & { battleId?: string };
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

function makeUser(overrides: Partial<User> = {}): User {
  const user = new User();
  user.id = overrides.id ?? 1;
  user.balance = overrides.balance ?? 5_000_000;
  user.nickname = overrides.nickname ?? 'tester';
  return user;
}

function makeBattleEndService(overrides: {
  battleRepo?: any;
  sessionRepo?: any;
  userRepo?: any;
  positionRepo?: any;
  tickerRepo?: any;
  eventEmitter?: any;
} = {}): BattleEndService {
  const battleRepo = {
    findById: jest.fn().mockResolvedValue(makeBattle()),
    findExpiredBattles: jest.fn().mockResolvedValue([]),
    save: jest.fn().mockImplementation((b: any) => Promise.resolve(b)),
    ...overrides.battleRepo,
  };

  const sessionRepo = {
    findByBattleId: jest.fn().mockResolvedValue([makeBattleSession()]),
    save: jest.fn().mockImplementation((s: any) => Promise.resolve(s)),
    ...overrides.sessionRepo,
  };

  const userRepo = {
    findById: jest.fn().mockResolvedValue(makeUser()),
    findAllByIds: jest.fn().mockResolvedValue([makeUser()]),
    save: jest.fn().mockImplementation((u: any) => Promise.resolve(u)),
    ...overrides.userRepo,
  };

  const positionRepo = {
    findByUserIdAndStatus: jest.fn().mockResolvedValue([]),
    findOpenByUserIdAndBattleId: jest.fn().mockResolvedValue([]),
    findById: jest.fn().mockResolvedValue(null),
    save: jest.fn().mockImplementation((p: any) => Promise.resolve(p)),
    ...overrides.positionRepo,
  };

  const tickerRepo = {
    findByMarket: jest.fn().mockResolvedValue({ tradePrice: 51_000_000 }),
    ...overrides.tickerRepo,
  };

  const eventEmitter = {
    emit: jest.fn(),
    ...overrides.eventEmitter,
  };

  return new BattleEndService(
    battleRepo as any,
    sessionRepo as any,
    userRepo as any,
    positionRepo as any,
    tickerRepo as any,
    eventEmitter as any as EventEmitter2,
  );
}

describe('BattleEndService', () => {
  describe('calculateFinalValuation (배틀 격리 자금 기준)', () => {
    it('배틀_종료시_finalValuation_battleBalance_기준으로_설정', async () => {
      const battle = makeBattle({
        battleId: 'battle-uuid-1',
        seedMoney: 1_000_000,
        startTime: new Date(Date.now() - 11 * 60 * 1000),
      });

      const session = makeBattleSession({ participantId: 1, battleBalance: 1_100_000 });
      const sessionSaveMock = jest.fn().mockImplementation((s: any) => Promise.resolve(s));

      const service = makeBattleEndService({
        sessionRepo: {
          findByBattleId: jest.fn().mockResolvedValue([session]),
          save: sessionSaveMock,
        },
        userRepo: { findAllByIds: jest.fn().mockResolvedValue([makeUser({ id: 1 })]) },
        positionRepo: {
          findOpenByUserIdAndBattleId: jest.fn().mockResolvedValue([]),
          findByUserIdAndStatus: jest.fn().mockResolvedValue([]),
        },
      });

      await service.finishBattleInTransaction(battle, new Date());

      expect(sessionSaveMock).toHaveBeenCalled();
      const savedSession = sessionSaveMock.mock.calls[0][0];
      expect(savedSession.finalValuation).toBeDefined();
      expect(typeof savedSession.finalValuation).toBe('number');
    });

    it('배틀_오픈_포지션_있을_때_finalValuation_포지션_가치_포함', async () => {
      const battle = makeBattle({
        battleId: 'battle-uuid-1',
        seedMoney: 1_000_000,
        startTime: new Date(Date.now() - 11 * 60 * 1000),
      });

      const session = makeBattleSession({ participantId: 1, battleBalance: 900_000 });
      const openPosition = makeBattlePosition({
        id: 1,
        userId: 1,
        margin: 100_000,
        averagePrice: 50_000_000,
        quantity: '0.0020000000',
        leverage: 2,
        battleId: 'battle-uuid-1',
      });

      const sessionSaveMock = jest.fn().mockImplementation((s: any) => Promise.resolve(s));

      const service = makeBattleEndService({
        sessionRepo: {
          findByBattleId: jest.fn().mockResolvedValue([session]),
          save: sessionSaveMock,
        },
        userRepo: { findAllByIds: jest.fn().mockResolvedValue([makeUser({ id: 1 })]) },
        positionRepo: {
          findOpenByUserIdAndBattleId: jest.fn().mockResolvedValue([openPosition]),
          findByUserIdAndStatus: jest.fn().mockResolvedValue([openPosition]),
        },
        tickerRepo: { findByMarket: jest.fn().mockResolvedValue({ tradePrice: 51_000_000 }) },
      });

      await service.finishBattleInTransaction(battle, new Date());

      expect(sessionSaveMock).toHaveBeenCalled();
      const savedSession = sessionSaveMock.mock.calls[0][0];
      expect(savedSession.finalValuation).toBeGreaterThanOrEqual(900_000);
    });
  });

  describe('finishBattleInTransaction (배틀 포지션 강제 청산)', () => {
    it('배틀_종료시_배틀_포지션_강제_청산_session_battleBalance_갱신', async () => {
      const battle = makeBattle({
        battleId: 'battle-uuid-1',
        seedMoney: 1_000_000,
        startTime: new Date(Date.now() - 11 * 60 * 1000),
      });

      const session = makeBattleSession({
        participantId: 1,
        battleBalance: 900_000,
        battleId: 'battle-uuid-1',
      });

      const openPosition = makeBattlePosition({
        id: 10,
        userId: 1,
        margin: 100_000,
        averagePrice: 50_000_000,
        quantity: '0.0020000000',
        leverage: 2,
        battleId: 'battle-uuid-1',
      });

      const sessionSaveMock = jest.fn().mockImplementation((s: any) => Promise.resolve(s));
      const battleSaveMock = jest.fn().mockImplementation((b: any) => Promise.resolve(b));

      const service = makeBattleEndService({
        battleRepo: { save: battleSaveMock },
        sessionRepo: {
          findByBattleId: jest.fn().mockResolvedValue([session]),
          save: sessionSaveMock,
        },
        userRepo: { findAllByIds: jest.fn().mockResolvedValue([makeUser({ id: 1 })]) },
        positionRepo: {
          findOpenByUserIdAndBattleId: jest.fn().mockResolvedValue([openPosition]),
          findByUserIdAndStatus: jest.fn().mockResolvedValue([openPosition]),
        },
        tickerRepo: { findByMarket: jest.fn().mockResolvedValue({ tradePrice: 51_000_000 }) },
      });

      await service.finishBattleInTransaction(battle, new Date());

      expect(sessionSaveMock).toHaveBeenCalled();
    });

    it('강제_청산_중_일부_실패해도_나머지_세션_처리_계속', async () => {
      const battle = makeBattle({
        battleId: 'battle-uuid-1',
        seedMoney: 1_000_000,
        startTime: new Date(Date.now() - 11 * 60 * 1000),
        maxParticipants: 2,
        currentParticipants: 2,
      });

      const session1 = makeBattleSession({ id: 'session-1', participantId: 1, battleBalance: 900_000 });
      const session2 = makeBattleSession({ id: 'session-2', participantId: 2, battleBalance: 800_000 });

      const failingPosition = makeBattlePosition({ id: 1, userId: 1 });
      const successPosition = makeBattlePosition({ id: 2, userId: 2 });

      let callCount = 0;
      const tickerMock = jest.fn().mockImplementation((_ticker: string) => {
        callCount++;
        if (callCount === 1) return Promise.reject(new Error('Redis 연결 오류'));
        return Promise.resolve({ tradePrice: 51_000_000 });
      });

      const sessionSaveMock = jest.fn().mockImplementation((s: any) => Promise.resolve(s));
      const battleSaveMock = jest.fn().mockImplementation((b: any) => Promise.resolve(b));

      const service = makeBattleEndService({
        battleRepo: { save: battleSaveMock },
        sessionRepo: {
          findByBattleId: jest.fn().mockResolvedValue([session1, session2]),
          save: sessionSaveMock,
        },
        userRepo: {
          findAllByIds: jest.fn().mockResolvedValue([
            makeUser({ id: 1 }),
            makeUser({ id: 2 }),
          ]),
        },
        positionRepo: {
          findOpenByUserIdAndBattleId: jest.fn()
            .mockResolvedValueOnce([failingPosition])
            .mockResolvedValueOnce([successPosition]),
          findByUserIdAndStatus: jest.fn().mockResolvedValue([]),
        },
        tickerRepo: { findByMarket: tickerMock },
      });

      await expect(
        service.finishBattleInTransaction(battle, new Date()),
      ).resolves.not.toThrow();

      expect(battleSaveMock).toHaveBeenCalled();
    });

    it('배틀_종료_후_battle_status_FINISHED로_변경', async () => {
      const battle = makeBattle({
        battleId: 'battle-uuid-1',
        seedMoney: 1_000_000,
        startTime: new Date(Date.now() - 11 * 60 * 1000),
      });

      const session = makeBattleSession({ participantId: 1, battleBalance: 1_100_000 });
      const battleSaveMock = jest.fn().mockImplementation((b: any) => Promise.resolve(b));

      const service = makeBattleEndService({
        battleRepo: { save: battleSaveMock },
        sessionRepo: {
          findByBattleId: jest.fn().mockResolvedValue([session]),
          save: jest.fn().mockImplementation((s: any) => Promise.resolve(s)),
        },
        userRepo: { findAllByIds: jest.fn().mockResolvedValue([makeUser({ id: 1 })]) },
        positionRepo: {
          findOpenByUserIdAndBattleId: jest.fn().mockResolvedValue([]),
          findByUserIdAndStatus: jest.fn().mockResolvedValue([]),
        },
      });

      await service.finishBattleInTransaction(battle, new Date());

      expect(battleSaveMock).toHaveBeenCalledTimes(1);
      const savedBattle: Battle = battleSaveMock.mock.calls[0][0];
      expect(savedBattle.status).toBe(BattleStatus.FINISHED);
    });

    it('배틀_종료_이벤트_battle_finished_emit', async () => {
      const battle = makeBattle({
        battleId: 'battle-uuid-1',
        seedMoney: 1_000_000,
        startTime: new Date(Date.now() - 11 * 60 * 1000),
      });

      const session = makeBattleSession({ participantId: 1, battleBalance: 1_100_000 });
      const emitMock = jest.fn();

      const service = makeBattleEndService({
        sessionRepo: {
          findByBattleId: jest.fn().mockResolvedValue([session]),
          save: jest.fn().mockImplementation((s: any) => Promise.resolve(s)),
        },
        userRepo: { findAllByIds: jest.fn().mockResolvedValue([makeUser({ id: 1 })]) },
        positionRepo: {
          findOpenByUserIdAndBattleId: jest.fn().mockResolvedValue([]),
          findByUserIdAndStatus: jest.fn().mockResolvedValue([]),
        },
        eventEmitter: { emit: emitMock },
      });

      await service.finishBattleInTransaction(battle, new Date());

      const emittedEvents = emitMock.mock.calls.map(([eventName]: [string]) => eventName);
      expect(emittedEvents).toContain('battle.finished');
    });

    it('startTime_없는_배틀은_종료_처리_스킵', async () => {
      const battle = makeBattle({ startTime: null });
      const battleSaveMock = jest.fn();

      const service = makeBattleEndService({
        battleRepo: { save: battleSaveMock },
      });

      await service.finishBattleInTransaction(battle, new Date());

      expect(battleSaveMock).not.toHaveBeenCalled();
    });
  });

  describe('calculateLiveRankings (배틀 격리 자금 기준)', () => {
    it('참가자_battleBalance_기준_실시간_랭킹_결과_2건_반환', async () => {
      const battle = makeBattle({ seedMoney: 1_000_000 });
      const session1 = makeBattleSession({ id: 'session-1', participantId: 1, battleBalance: 1_200_000 });
      const session2 = makeBattleSession({ id: 'session-2', participantId: 2, battleBalance: 800_000 });

      const service = makeBattleEndService({
        sessionRepo: { findByBattleId: jest.fn().mockResolvedValue([session1, session2]) },
        userRepo: {
          findAllByIds: jest.fn().mockResolvedValue([
            makeUser({ id: 1, nickname: 'player1' }),
            makeUser({ id: 2, nickname: 'player2' }),
          ]),
        },
        positionRepo: {
          findOpenByUserIdAndBattleId: jest.fn().mockResolvedValue([]),
          findByUserIdAndStatus: jest.fn().mockResolvedValue([]),
        },
      });

      const rankings = await service.calculateLiveRankings(battle);

      expect(rankings).toHaveLength(2);
      expect(rankings[0].rank).toBe(1);
      expect(rankings[1].rank).toBe(2);
    });

    it('랭킹_rank_필드와_userId_포함_여부_확인', async () => {
      const battle = makeBattle({ seedMoney: 1_000_000 });
      const session = makeBattleSession({ participantId: 1, battleBalance: 1_100_000 });

      const service = makeBattleEndService({
        sessionRepo: { findByBattleId: jest.fn().mockResolvedValue([session]) },
        userRepo: { findAllByIds: jest.fn().mockResolvedValue([makeUser({ id: 1, nickname: 'player1' })]) },
        positionRepo: {
          findOpenByUserIdAndBattleId: jest.fn().mockResolvedValue([]),
          findByUserIdAndStatus: jest.fn().mockResolvedValue([]),
        },
      });

      const rankings = await service.calculateLiveRankings(battle);

      expect(rankings[0].rank).toBe(1);
      expect(rankings[0].userId).toBe(1);
      expect(typeof rankings[0].currentValuation).toBe('number');
      expect(typeof rankings[0].returnRate).toBe('number');
    });

    it('수익률_계산_구조_검증_returnRate_number_타입', async () => {
      const battle = makeBattle({ seedMoney: 1_000_000 });
      const session = makeBattleSession({ participantId: 1, battleBalance: 1_100_000 });

      const service = makeBattleEndService({
        sessionRepo: { findByBattleId: jest.fn().mockResolvedValue([session]) },
        userRepo: { findAllByIds: jest.fn().mockResolvedValue([makeUser({ id: 1 })]) },
        positionRepo: {
          findOpenByUserIdAndBattleId: jest.fn().mockResolvedValue([]),
          findByUserIdAndStatus: jest.fn().mockResolvedValue([]),
        },
      });

      const rankings = await service.calculateLiveRankings(battle);

      expect(typeof rankings[0].returnRate).toBe('number');
      expect(Number.isFinite(rankings[0].returnRate)).toBe(true);
    });
  });
});
