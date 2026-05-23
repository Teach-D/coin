// BATTLE_NOT_HOST 에러코드는 error-code.enum.ts에 아직 없음 — 구현 시 추가 필요
// BattleService.deleteBattle() 메서드는 아직 구현되지 않음 — 관련 테스트는 Red 상태입니다
// BattleSummary.isHost 필드는 아직 없음 — 구현 시 추가 필요
import { BattleService } from 'src/domain/battle/service/battle.service';

// 구현 예정 에러코드 상수 (ErrorCode enum에 추가 필요)
const BATTLE_NOT_HOST = 'BATTLE_NOT_HOST' as unknown as ErrorCode;
import { BattleRepository } from 'src/domain/battle/repository/battle.repository';
import { BattleSessionRepository } from 'src/domain/battle/repository/battle-session.repository';
import { UserRepository } from 'src/domain/user/repository/user.repository';
import { RedisService } from 'src/common/config/redis.config';
import { CoinBattleException } from 'src/common/exception/coin-battle.exception';
import { ErrorCode } from 'src/common/exception/error-code.enum';
import { Battle, BattleStatus } from 'src/domain/battle/entity/battle.entity';
import { CreateBattleRequest } from 'src/domain/battle/dto/battle-request.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';

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

function makeBattleService(overrides: Partial<{
  battleRepo: Partial<BattleRepository>;
  sessionRepo: Partial<BattleSessionRepository>;
  userRepo: Partial<UserRepository>;
  eventEmitter: Partial<EventEmitter2>;
}> = {}): BattleService {
  const battleRepo = {
    findById: jest.fn(),
    findByStatus: jest.fn().mockResolvedValue({ content: [], total: 0 }),
    findExpiredBattles: jest.fn().mockResolvedValue([]),
    save: jest.fn().mockImplementation((b) => Promise.resolve(b)),
    delete: jest.fn().mockResolvedValue(undefined),
    ...overrides.battleRepo,
  } as any;

  const sessionRepo = {
    existsActiveByParticipantId: jest.fn().mockResolvedValue(false),
    existsByParticipantIdAndBattleId: jest.fn().mockResolvedValue(false),
    findParticipantIdsByBattleId: jest.fn().mockResolvedValue([]),
    save: jest.fn().mockImplementation((s) => Promise.resolve(s)),
    deleteByBattleId: jest.fn().mockResolvedValue(undefined),
    ...overrides.sessionRepo,
  } as any;

  const userRepo = {
    findAllByIds: jest.fn().mockResolvedValue([]),
    ...overrides.userRepo,
  } as any;

  const redisService = {
    client: {
      hset: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1),
      hget: jest.fn().mockResolvedValue(null),
      hdel: jest.fn().mockResolvedValue(1),
    },
  } as any;

  const eventEmitter = {
    emit: jest.fn(),
    ...overrides.eventEmitter,
  } as any;

  return new BattleService(battleRepo, sessionRepo, userRepo, redisService, eventEmitter);
}

describe('BattleService', () => {
  describe('createBattle', () => {
    it('유효한_요청으로_배틀_생성', async () => {
      const service = makeBattleService();
      const request: CreateBattleRequest = {
        seedMoney: 1_000_000,
        duration: 10,
        maxParticipants: 2,
      };

      const result = await service.createBattle(1, request);
      expect(result.status).toBe(BattleStatus.WAITING);
      expect(result.maxParticipants).toBe(2);
      expect(result.currentParticipants).toBe(1);
    });

    it('이미_배틀_참가중이면_예외_발생', async () => {
      const service = makeBattleService({
        sessionRepo: { existsActiveByParticipantId: jest.fn().mockResolvedValue(true) },
      });
      const request: CreateBattleRequest = {
        seedMoney: 1_000_000,
        duration: 10,
        maxParticipants: 2,
      };

      await expect(service.createBattle(1, request)).rejects.toThrow(
        new CoinBattleException(ErrorCode.ALREADY_IN_BATTLE),
      );
    });

    it('유효하지_않은_배틀_시간이면_예외_발생', async () => {
      const service = makeBattleService();
      const request = {
        seedMoney: 1_000_000,
        duration: 15,
        maxParticipants: 2,
      } as any;

      await expect(service.createBattle(1, request)).rejects.toThrow(
        new CoinBattleException(ErrorCode.INVALID_DURATION),
      );
    });

    it('유효하지_않은_최대_참가자수이면_예외_발생', async () => {
      const service = makeBattleService();
      const request = {
        seedMoney: 1_000_000,
        duration: 10,
        maxParticipants: 4,
      } as any;

      await expect(service.createBattle(1, request)).rejects.toThrow(
        new CoinBattleException(ErrorCode.INVALID_MAX_PARTICIPANTS),
      );
    });
  });

  describe('joinBattle', () => {
    it('배틀_없으면_예외_발생', async () => {
      const service = makeBattleService({
        battleRepo: { findById: jest.fn().mockResolvedValue(null) },
      });

      await expect((service as any).executeJoinBattle(1, 'non-existent-uuid')).rejects.toThrow(
        new CoinBattleException(ErrorCode.BATTLE_NOT_FOUND),
      );
    });

    it('참가자가_가득_찬_배틀에_참가하면_예외_발생', async () => {
      const { Battle } = await import('src/domain/battle/entity/battle.entity');
      const battle = Object.assign(new Battle(), {
        battleId: 'uuid-1',
        status: BattleStatus.WAITING,
        currentParticipants: 2,
        maxParticipants: 2,
      });

      const service = makeBattleService({
        battleRepo: { findById: jest.fn().mockResolvedValue(battle), save: jest.fn().mockResolvedValue(battle) },
        sessionRepo: { existsByParticipantIdAndBattleId: jest.fn().mockResolvedValue(false) },
      });

      await expect((service as any).executeJoinBattle(99, 'uuid-1')).rejects.toThrow(
        new CoinBattleException(ErrorCode.BATTLE_FULL),
      );
    });
  });

  describe('deleteBattle()', () => {
    it('존재하지_않는_battleId로_호출_시_BATTLE_NOT_FOUND_예외_throw', async () => {
      const service = makeBattleService({
        battleRepo: { findById: jest.fn().mockResolvedValue(null) },
      });

      // deleteBattle은 아직 구현되지 않아 TypeError가 발생함 — Red 상태
      await expect((service as any).deleteBattle(1, 'non-existent-uuid')).rejects.toThrow(CoinBattleException);
      await expect((service as any).deleteBattle(1, 'non-existent-uuid')).rejects.toMatchObject({
        errorCode: ErrorCode.BATTLE_NOT_FOUND,
      });
    });

    it('방장이_아닌_userId로_호출_시_BATTLE_NOT_HOST_예외_throw', async () => {
      const hostUserId = 1;
      const nonHostUserId = 2;
      const battle = makeBattle({ hostUserId, status: BattleStatus.WAITING });

      const service = makeBattleService({
        battleRepo: { findById: jest.fn().mockResolvedValue(battle) },
      });

      await expect((service as any).deleteBattle(nonHostUserId, battle.battleId)).rejects.toThrow(CoinBattleException);
      await expect((service as any).deleteBattle(nonHostUserId, battle.battleId)).rejects.toMatchObject({
        errorCode: BATTLE_NOT_HOST,
      });
    });

    it('이미_시작된_배틀에_호출_시_BATTLE_ALREADY_STARTED_예외_throw', async () => {
      const hostUserId = 1;
      const battle = makeBattle({ hostUserId, status: BattleStatus.IN_PROGRESS });

      const service = makeBattleService({
        battleRepo: { findById: jest.fn().mockResolvedValue(battle) },
      });

      await expect((service as any).deleteBattle(hostUserId, battle.battleId)).rejects.toThrow(CoinBattleException);
      await expect((service as any).deleteBattle(hostUserId, battle.battleId)).rejects.toMatchObject({
        errorCode: ErrorCode.BATTLE_ALREADY_STARTED,
      });
    });

    it('정상_호출_시_BattleSessionRepository_deleteByBattleId_먼저_호출_후_BattleRepository_delete_호출', async () => {
      const hostUserId = 1;
      const battleId = 'battle-uuid-1';
      const battle = makeBattle({ hostUserId, battleId, status: BattleStatus.WAITING });

      const callOrder: string[] = [];
      const deleteByBattleIdMock = jest.fn().mockImplementation(() => {
        callOrder.push('deleteByBattleId');
        return Promise.resolve();
      });
      const deleteMock = jest.fn().mockImplementation(() => {
        callOrder.push('delete');
        return Promise.resolve();
      });

      const service = makeBattleService({
        battleRepo: {
          findById: jest.fn().mockResolvedValue(battle),
          delete: deleteMock,
        } as any,
        sessionRepo: {
          deleteByBattleId: deleteByBattleIdMock,
        } as any,
      });

      await (service as any).deleteBattle(hostUserId, battleId);

      expect(deleteByBattleIdMock).toHaveBeenCalledWith(battleId);
      expect(deleteMock).toHaveBeenCalledWith(battleId);
      expect(callOrder).toEqual(['deleteByBattleId', 'delete']);
    });

    it('정상_호출_시_EventEmitter에서_battle_deleted_이벤트_발행', async () => {
      const hostUserId = 1;
      const battleId = 'battle-uuid-1';
      const battle = makeBattle({ hostUserId, battleId, status: BattleStatus.WAITING });
      const emitMock = jest.fn();

      const service = makeBattleService({
        battleRepo: {
          findById: jest.fn().mockResolvedValue(battle),
          delete: jest.fn().mockResolvedValue(undefined),
        } as any,
        sessionRepo: {
          deleteByBattleId: jest.fn().mockResolvedValue(undefined),
        } as any,
        eventEmitter: { emit: emitMock },
      });

      await (service as any).deleteBattle(hostUserId, battleId);

      const emittedEventNames = emitMock.mock.calls.map(([eventName]: [string]) => eventName);
      expect(emittedEventNames).toContain('battle.deleted');
    });
  });

  describe('getBattleList() — isHost 포함 검증', () => {
    it('getBattleList_반환_content_각_item에_isHost_필드가_존재해야_함', async () => {
      const hostUserId = 42;
      const battle = makeBattle({ hostUserId, status: BattleStatus.WAITING });

      const service = makeBattleService({
        battleRepo: {
          findByStatus: jest.fn().mockResolvedValue({ content: [battle], total: 1 }),
        },
      });

      const result = await service.getBattleList(BattleStatus.WAITING, 0, 10, hostUserId);

      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toHaveProperty('isHost');
    });

    it('getBattleList_requestUserId가_hostUserId와_일치하면_isHost가_true', async () => {
      const hostUserId = 42;
      const battle = makeBattle({ hostUserId, status: BattleStatus.WAITING });

      const service = makeBattleService({
        battleRepo: {
          findByStatus: jest.fn().mockResolvedValue({ content: [battle], total: 1 }),
        },
      });

      const result = await service.getBattleList(BattleStatus.WAITING, 0, 10, hostUserId);

      expect(result.content[0].isHost).toBe(true);
    });

    it('getBattleList_requestUserId가_hostUserId와_다르면_isHost가_false', async () => {
      const hostUserId = 42;
      const battle = makeBattle({ hostUserId, status: BattleStatus.WAITING });

      const service = makeBattleService({
        battleRepo: {
          findByStatus: jest.fn().mockResolvedValue({ content: [battle], total: 1 }),
        },
      });

      const result = await service.getBattleList(BattleStatus.WAITING, 0, 10, 99);

      expect(result.content[0].isHost).toBe(false);
    });

    it('getBattleList_requestUserId가_없으면_isHost가_false', async () => {
      const hostUserId = 42;
      const battle = makeBattle({ hostUserId, status: BattleStatus.WAITING });

      const service = makeBattleService({
        battleRepo: {
          findByStatus: jest.fn().mockResolvedValue({ content: [battle], total: 1 }),
        },
      });

      const result = await service.getBattleList(BattleStatus.WAITING, 0, 10);

      expect(result.content[0].isHost).toBe(false);
    });
  });
});
