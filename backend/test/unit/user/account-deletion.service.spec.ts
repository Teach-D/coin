jest.mock('redlock', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    acquire: jest.fn().mockResolvedValue({ release: jest.fn().mockResolvedValue(undefined) }),
  })),
}));

import { CoinBattleException } from 'src/common/exception/coin-battle.exception';
import { ErrorCode } from 'src/common/exception/error-code.enum';
import { User, AuthProvider, UserRole } from 'src/domain/user/entity/user.entity';
import { Position, PositionStatus } from 'src/domain/order/entity/position.entity';
import { Battle, BattleStatus } from 'src/domain/battle/entity/battle.entity';
import { BattleSession } from 'src/domain/battle/entity/battle-session.entity';
import { OrderDirection } from 'src/domain/order/entity/order.entity';

type AccountDeletionServiceType = {
  withdraw(userId: number): Promise<void>;
};

function makeUser(overrides: Partial<Record<string, any>> = {}): User {
  const user = new User() as any;
  user.id = overrides.id ?? 1;
  user.email = overrides.email !== undefined ? overrides.email : 'test@example.com';
  user.nickname = overrides.nickname ?? 'tester';
  user.nicknameSet = overrides.nicknameSet ?? false;
  user.profileImageUrl = overrides.profileImageUrl ?? null;
  user.provider = overrides.provider ?? AuthProvider.GOOGLE;
  user.providerId = overrides.providerId ?? 'google-123';
  user.role = overrides.role ?? UserRole.ROLE_USER;
  user.balance = overrides.balance ?? 10_000_000;
  user.version = overrides.version ?? 0;
  user.deletedAt = overrides.deletedAt ?? null;
  user.withdraw = function () {
    this.email = null;
    this.profileImageUrl = null;
    this.providerId = null;
    this.nickname = `(탈퇴한 사용자)-${this.id}`;
    this.deletedAt = new Date();
  };
  user.isWithdrawn = function () {
    return this.deletedAt != null;
  };
  return user;
}

function makePosition(overrides: Partial<Position> = {}): Position {
  const p = new Position();
  p.id = overrides.id ?? 1;
  p.userId = overrides.userId ?? 1;
  p.ticker = overrides.ticker ?? 'KRW-BTC';
  p.direction = overrides.direction ?? OrderDirection.LONG;
  p.averagePrice = overrides.averagePrice ?? 50_000_000;
  p.leverage = overrides.leverage ?? 2;
  p.margin = overrides.margin ?? 1_000_000;
  p.quantity = overrides.quantity ?? '0.0200000000';
  p.status = overrides.status ?? PositionStatus.OPEN;
  p.battleId = overrides.battleId ?? null;
  p.version = overrides.version ?? 0;
  p.openedAt = overrides.openedAt ?? new Date();
  p.closedAt = overrides.closedAt ?? null;
  return p;
}

function makeBattle(overrides: Partial<Battle> = {}): Battle {
  const battle = new Battle();
  battle.battleId = overrides.battleId ?? 'battle-uuid-1';
  battle.hostUserId = overrides.hostUserId ?? 1;
  battle.userId = overrides.userId ?? 1;
  battle.status = overrides.status ?? BattleStatus.WAITING;
  battle.seedMoney = overrides.seedMoney ?? 1_000_000;
  battle.duration = overrides.duration ?? 10;
  battle.maxParticipants = overrides.maxParticipants ?? 2;
  battle.currentParticipants = overrides.currentParticipants ?? 1;
  battle.winnerId = overrides.winnerId ?? null;
  battle.startTime = overrides.startTime ?? null;
  battle.endTime = overrides.endTime ?? null;
  battle.version = overrides.version ?? 0;
  battle.createdAt = overrides.createdAt ?? new Date();
  battle.updatedAt = overrides.updatedAt ?? new Date();
  return battle;
}

async function makeService(overrides: Partial<{
  managerOverrides: Record<string, any>;
  battleRepo: Record<string, any>;
  redisClient: Record<string, any>;
  eventEmitter: Record<string, any>;
}> = {}): Promise<{ service: AccountDeletionServiceType; manager: Record<string, any> }> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('src/domain/user/service/account-deletion.service');
  const { AccountDeletionService } = mod;

  const userRepo = { findActiveById: jest.fn().mockResolvedValue(null), save: jest.fn() };
  const positionRepo = { findOpenNonBattleByUserId: jest.fn().mockResolvedValue([]), save: jest.fn() };

  const battleRepo = {
    findWaitingByHostUserId: jest.fn().mockResolvedValue([]),
    findWaitingByParticipantId: jest.fn().mockResolvedValue([]),
    findInProgressByParticipantId: jest.fn().mockResolvedValue([]),
    save: jest.fn().mockImplementation((b: any) => Promise.resolve(b)),
    delete: jest.fn().mockResolvedValue(undefined),
    ...overrides.battleRepo,
  };

  const sessionRepo = { deleteByBattleId: jest.fn(), deleteByParticipantIdAndBattleId: jest.fn() };

  const redisClient = {
    zrem: jest.fn().mockResolvedValue(1),
    del: jest.fn().mockResolvedValue(1),
    ...overrides.redisClient,
  };
  const redisService = { client: redisClient };

  const eventEmitter = {
    emit: jest.fn(),
    ...overrides.eventEmitter,
  };

  const manager = {
    findOne: jest.fn().mockResolvedValue(null),
    find: jest.fn().mockResolvedValue([]),
    save: jest.fn().mockImplementation((entity: any) => Promise.resolve(entity)),
    delete: jest.fn().mockResolvedValue(undefined),
    ...overrides.managerOverrides,
  };

  const dataSource = {
    transaction: jest.fn().mockImplementation((cb: (manager: any) => Promise<any>) => cb(manager)),
  };

  const service = new AccountDeletionService(
    userRepo as any,
    positionRepo as any,
    battleRepo as any,
    sessionRepo as any,
    redisService as any,
    eventEmitter as any,
    dataSource as any,
  );

  return { service, manager };
}

describe('AccountDeletionService', () => {
  describe('withdraw() — 유저 조회 검증', () => {
    it('존재하지_않는_userId로_호출시_USER_NOT_FOUND_예외_발생', async () => {
      const { service } = await makeService();

      await expect(service.withdraw(999)).rejects.toThrow(
        new CoinBattleException(ErrorCode.USER_NOT_FOUND),
      );
    });

    it('이미_탈퇴한_사용자_manager_findOne_null_반환시_USER_NOT_FOUND_예외_발생', async () => {
      const { service } = await makeService({
        managerOverrides: { findOne: jest.fn().mockResolvedValue(null) },
      });

      await expect(service.withdraw(1)).rejects.toThrow(
        new CoinBattleException(ErrorCode.USER_NOT_FOUND),
      );
    });
  });

  describe('withdraw() — 비배틀 포지션 강제 청산', () => {
    it('OPEN_비배틀_포지션_CLOSED_상태로_저장', async () => {
      const user = makeUser({ id: 1 });
      const openPosition = makePosition({ id: 10, userId: 1, status: PositionStatus.OPEN, battleId: null });

      const { service, manager } = await makeService({
        managerOverrides: {
          findOne: jest.fn().mockResolvedValue(user),
          find: jest.fn().mockResolvedValue([openPosition]),
        },
      });

      await service.withdraw(1);

      expect(manager.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: PositionStatus.CLOSED }),
      );
    });

    it('비배틀_OPEN_포지션_여러개_모두_CLOSED_처리', async () => {
      const user = makeUser({ id: 1 });
      const positions = [
        makePosition({ id: 10, userId: 1, status: PositionStatus.OPEN, battleId: null }),
        makePosition({ id: 11, userId: 1, ticker: 'KRW-ETH', status: PositionStatus.OPEN, battleId: null }),
      ];

      const { service, manager } = await makeService({
        managerOverrides: {
          findOne: jest.fn().mockResolvedValue(user),
          find: jest.fn().mockResolvedValue(positions),
        },
      });

      await service.withdraw(1);

      const closedCalls = (manager.save as jest.Mock).mock.calls.filter(
        ([entity]: [any]) => entity.status === PositionStatus.CLOSED,
      );
      expect(closedCalls.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('withdraw() — WAITING 배틀 방장 Hard Delete', () => {
    it('방장인_WAITING_배틀_세션_삭제_후_배틀_Hard_Delete', async () => {
      const user = makeUser({ id: 1 });
      const battle = makeBattle({ battleId: 'uuid-host-1', hostUserId: 1, status: BattleStatus.WAITING });

      const { service, manager } = await makeService({
        managerOverrides: { findOne: jest.fn().mockResolvedValue(user) },
        battleRepo: {
          findWaitingByHostUserId: jest.fn().mockResolvedValue([battle]),
          findWaitingByParticipantId: jest.fn().mockResolvedValue([]),
          findInProgressByParticipantId: jest.fn().mockResolvedValue([]),
        },
      });

      await service.withdraw(1);

      expect(manager.delete).toHaveBeenCalledWith(BattleSession, { battleId: 'uuid-host-1' });
      expect(manager.delete).toHaveBeenCalledWith(Battle, { battleId: 'uuid-host-1' });
    });

    it('방장_WAITING_배틀_세션_삭제_먼저_배틀_삭제_순서_보장', async () => {
      const user = makeUser({ id: 1 });
      const battle = makeBattle({ battleId: 'uuid-order-check', hostUserId: 1, status: BattleStatus.WAITING });

      const callOrder: string[] = [];
      const deleteMock = jest.fn().mockImplementation((Entity: any) => {
        if (Entity === BattleSession) callOrder.push('deleteSession');
        if (Entity === Battle) callOrder.push('deleteBattle');
        return Promise.resolve();
      });

      const { service } = await makeService({
        managerOverrides: {
          findOne: jest.fn().mockResolvedValue(user),
          delete: deleteMock,
        },
        battleRepo: {
          findWaitingByHostUserId: jest.fn().mockResolvedValue([battle]),
          findWaitingByParticipantId: jest.fn().mockResolvedValue([]),
          findInProgressByParticipantId: jest.fn().mockResolvedValue([]),
        },
      });

      await service.withdraw(1);

      expect(callOrder).toEqual(['deleteSession', 'deleteBattle']);
    });
  });

  describe('withdraw() — IN_PROGRESS 배틀 VOID 처리', () => {
    it('IN_PROGRESS_배틀_참가자_탈퇴시_battle_status_VOID로_변경_저장', async () => {
      const user = makeUser({ id: 1 });
      const battle = makeBattle({
        battleId: 'uuid-inprogress-1',
        status: BattleStatus.IN_PROGRESS,
        currentParticipants: 2,
        startTime: new Date(Date.now() - 5 * 60 * 1000),
      });

      const { service, manager } = await makeService({
        managerOverrides: { findOne: jest.fn().mockResolvedValue(user) },
        battleRepo: {
          findWaitingByHostUserId: jest.fn().mockResolvedValue([]),
          findWaitingByParticipantId: jest.fn().mockResolvedValue([]),
          findInProgressByParticipantId: jest.fn().mockResolvedValue([battle]),
        },
      });

      await service.withdraw(1);

      expect(manager.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: BattleStatus.VOID }),
      );
    });
  });

  describe('withdraw() — User 익명화', () => {
    it('탈퇴_완료_후_user_익명화_정보로_저장', async () => {
      const user = makeUser({ id: 1, email: 'user@example.com', providerId: 'google-123' });

      const { service, manager } = await makeService({
        managerOverrides: { findOne: jest.fn().mockResolvedValue(user) },
      });

      await service.withdraw(1);

      expect(manager.save).toHaveBeenCalledWith(
        expect.objectContaining({
          email: null,
          providerId: null,
          nickname: '(탈퇴한 사용자)-1',
        }),
      );
    });

    it('탈퇴_완료_후_저장된_user에_deletedAt_설정됨', async () => {
      const user = makeUser({ id: 1 });

      const { service, manager } = await makeService({
        managerOverrides: { findOne: jest.fn().mockResolvedValue(user) },
      });

      await service.withdraw(1);

      const savedUser = (manager.save as jest.Mock).mock.calls
        .map(([entity]: [any]) => entity)
        .find((e: any) => e.deletedAt !== undefined && e.deletedAt !== null);
      expect(savedUser).toBeDefined();
      expect(savedUser.deletedAt).not.toBeNull();
    });
  });

  describe('withdraw() — Redis 랭킹 데이터 제거', () => {
    it('탈퇴_후_leaderboard_season에서_userId_제거', async () => {
      const user = makeUser({ id: 42 });
      const zremMock = jest.fn().mockResolvedValue(1);

      const { service } = await makeService({
        managerOverrides: { findOne: jest.fn().mockResolvedValue(user) },
        redisClient: { zrem: zremMock, del: jest.fn().mockResolvedValue(1) },
      });

      await service.withdraw(42);

      expect(zremMock).toHaveBeenCalledWith('leaderboard:season', '42');
    });

    it('탈퇴_후_leaderboard_daily에서_userId_제거', async () => {
      const user = makeUser({ id: 42 });
      const zremMock = jest.fn().mockResolvedValue(1);

      const { service } = await makeService({
        managerOverrides: { findOne: jest.fn().mockResolvedValue(user) },
        redisClient: { zrem: zremMock, del: jest.fn().mockResolvedValue(1) },
      });

      await service.withdraw(42);

      expect(zremMock).toHaveBeenCalledWith('leaderboard:daily', '42');
    });

    it('탈퇴_후_leaderboard_pvp_winrate에서_userId_제거', async () => {
      const user = makeUser({ id: 42 });
      const zremMock = jest.fn().mockResolvedValue(1);

      const { service } = await makeService({
        managerOverrides: { findOne: jest.fn().mockResolvedValue(user) },
        redisClient: { zrem: zremMock, del: jest.fn().mockResolvedValue(1) },
      });

      await service.withdraw(42);

      expect(zremMock).toHaveBeenCalledWith('leaderboard:pvp-winrate', '42');
    });

    it('탈퇴_후_pvp_stats_userId_키_삭제', async () => {
      const user = makeUser({ id: 42 });
      const delMock = jest.fn().mockResolvedValue(1);

      const { service } = await makeService({
        managerOverrides: { findOne: jest.fn().mockResolvedValue(user) },
        redisClient: { zrem: jest.fn().mockResolvedValue(1), del: delMock },
      });

      await service.withdraw(42);

      expect(delMock).toHaveBeenCalledWith('pvp:stats:42');
    });
  });

  describe('withdraw() — 이벤트 발행', () => {
    it('탈퇴_완료_후_user_withdrawn_이벤트_emit', async () => {
      const user = makeUser({ id: 1 });
      const emitMock = jest.fn();

      const { service } = await makeService({
        managerOverrides: { findOne: jest.fn().mockResolvedValue(user) },
        eventEmitter: { emit: emitMock },
      });

      await service.withdraw(1);

      const emittedEventNames = emitMock.mock.calls.map(([eventName]: [string]) => eventName);
      expect(emittedEventNames).toContain('user.withdrawn');
    });

    it('user_withdrawn_이벤트_페이로드에_userId_포함', async () => {
      const user = makeUser({ id: 7 });
      const emitMock = jest.fn();

      const { service } = await makeService({
        managerOverrides: { findOne: jest.fn().mockResolvedValue(user) },
        eventEmitter: { emit: emitMock },
      });

      await service.withdraw(7);

      const withdrawnCall = emitMock.mock.calls.find(
        ([eventName]: [string]) => eventName === 'user.withdrawn',
      );
      expect(withdrawnCall).toBeDefined();
      const payload = withdrawnCall![1];
      expect(payload.userId).toBe(7);
    });
  });
});
