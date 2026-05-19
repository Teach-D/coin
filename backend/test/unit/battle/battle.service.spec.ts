import { BattleService } from 'src/domain/battle/service/battle.service';
import { BattleRepository } from 'src/domain/battle/repository/battle.repository';
import { BattleSessionRepository } from 'src/domain/battle/repository/battle-session.repository';
import { UserRepository } from 'src/domain/user/repository/user.repository';
import { RedisService } from 'src/common/config/redis.config';
import { CoinBattleException } from 'src/common/exception/coin-battle.exception';
import { ErrorCode } from 'src/common/exception/error-code.enum';
import { BattleStatus } from 'src/domain/battle/entity/battle.entity';
import { CreateBattleRequest } from 'src/domain/battle/dto/battle-request.dto';

function makeBattleService(overrides: Partial<{
  battleRepo: Partial<BattleRepository>;
  sessionRepo: Partial<BattleSessionRepository>;
  userRepo: Partial<UserRepository>;
}> = {}): BattleService {
  const battleRepo = {
    findById: jest.fn(),
    findByStatus: jest.fn().mockResolvedValue({ content: [], total: 0 }),
    findExpiredBattles: jest.fn().mockResolvedValue([]),
    save: jest.fn().mockImplementation((b) => Promise.resolve(b)),
    ...overrides.battleRepo,
  } as any;

  const sessionRepo = {
    existsActiveByParticipantId: jest.fn().mockResolvedValue(false),
    existsByParticipantIdAndBattleId: jest.fn().mockResolvedValue(false),
    findParticipantIdsByBattleId: jest.fn().mockResolvedValue([]),
    save: jest.fn().mockImplementation((s) => Promise.resolve(s)),
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

  return new BattleService(battleRepo, sessionRepo, userRepo, redisService);
}

describe('BattleService', () => {
  describe('createBattle', () => {
    it('유효한_요청으로_배틀_생성', async () => {
      const service = makeBattleService();
      const request: CreateBattleRequest = {
        leverage: 2,
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
        leverage: 2,
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
        leverage: 2,
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
        leverage: 2,
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
});
