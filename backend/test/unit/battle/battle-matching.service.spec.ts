import { BattleMatchingService } from 'src/domain/battle/service/battle-matching.service';
import { BattleRepository } from 'src/domain/battle/repository/battle.repository';
import { BattleSessionRepository } from 'src/domain/battle/repository/battle-session.repository';
import { RedisService } from 'src/common/config/redis.config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MatchBattleRequest } from 'src/domain/battle/dto/battle-request.dto';
import { ErrorCode } from 'src/common/exception/error-code.enum';
import { CoinBattleException } from 'src/common/exception/coin-battle.exception';

interface MatchQueueEntry {
  userId: number;
  leverage: number;
  seedMoney: number;
  duration: number;
  maxParticipants: number;
  enqueuedAt: number;
}

function makeMatchingService(overrides: Partial<{
  battleRepo: Partial<BattleRepository>;
  sessionRepo: Partial<BattleSessionRepository>;
  redisClient: any;
  eventEmitter: Partial<EventEmitter2>;
}> = {}): { service: BattleMatchingService; eventEmitter: jest.Mocked<EventEmitter2> } {
  const eventEmitter = {
    emit: jest.fn(),
    on: jest.fn(),
    ...overrides.eventEmitter,
  } as any as jest.Mocked<EventEmitter2>;

  const battleRepo = {
    save: jest.fn().mockImplementation((b) => Promise.resolve(b)),
    ...overrides.battleRepo,
  } as any;

  const sessionRepo = {
    save: jest.fn().mockImplementation((s) => Promise.resolve(s)),
    ...overrides.sessionRepo,
  } as any;

  const redisClient = {
    hset: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
    hget: jest.fn().mockResolvedValue(null),
    hdel: jest.fn().mockResolvedValue(1),
    hgetall: jest.fn().mockResolvedValue(null),
    ...overrides.redisClient,
  };

  const redisService = { client: redisClient } as any as RedisService;

  const service = new BattleMatchingService(redisService, battleRepo, sessionRepo, eventEmitter);
  return { service, eventEmitter };
}

function makeQueueEntries(count: number, overrides: Partial<MatchQueueEntry> = {}): MatchQueueEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    userId: i + 1,
    leverage: 2,
    seedMoney: 1_000_000,
    duration: 10,
    maxParticipants: count,
    enqueuedAt: Date.now(),
    ...overrides,
  }));
}

describe('BattleMatchingService', () => {
  describe('enqueue', () => {
    it('유효한_요청으로_큐_등록_성공', async () => {
      const { service } = makeMatchingService();
      const request: MatchBattleRequest = {
        leverage: 2,
        seedMoney: 1_000_000,
        duration: 10,
        maxParticipants: 2,
      };

      const result = await service.enqueue(1, request);

      expect(result.queued).toBe(true);
      expect(result.estimatedWaitSeconds).toBe(30);
    });

    it('큐_등록시_hset과_expire_호출', async () => {
      const hsetMock = jest.fn().mockResolvedValue(1);
      const expireMock = jest.fn().mockResolvedValue(1);
      const { service } = makeMatchingService({
        redisClient: { hset: hsetMock, expire: expireMock },
      });

      await service.enqueue(5, {
        leverage: 3,
        seedMoney: 2_000_000,
        duration: 30,
        maxParticipants: 2,
      });

      expect(hsetMock).toHaveBeenCalledWith(
        'battle:match:queue',
        '5',
        expect.stringContaining('"userId":5'),
      );
      expect(expireMock).toHaveBeenCalledWith('battle:match:queue', 300);
    });
  });

  describe('dequeue', () => {
    it('큐에_없는_유저_dequeue시_예외_발생', async () => {
      const { service } = makeMatchingService({
        redisClient: { hget: jest.fn().mockResolvedValue(null) },
      });

      await expect(service.dequeue(999)).rejects.toThrow(
        new CoinBattleException(ErrorCode.NOT_IN_MATCH_QUEUE),
      );
    });

    it('큐에_있는_유저_dequeue시_hdel_호출', async () => {
      const hdelMock = jest.fn().mockResolvedValue(1);
      const { service } = makeMatchingService({
        redisClient: {
          hget: jest.fn().mockResolvedValue(JSON.stringify(makeQueueEntries(1)[0])),
          hdel: hdelMock,
        },
      });

      await service.dequeue(1);

      expect(hdelMock).toHaveBeenCalledWith('battle:match:queue', '1');
    });
  });

  describe('createMatchedBattle', () => {
    it('2인_매칭_완료시_socket_user_matchFound_이벤트_2회_emit', async () => {
      const entries = makeQueueEntries(2);
      const queueMap = Object.fromEntries(
        entries.map((e) => [e.userId.toString(), JSON.stringify(e)]),
      );

      const { service, eventEmitter } = makeMatchingService({
        redisClient: { hgetall: jest.fn().mockResolvedValue(queueMap) },
      });

      await service.processMatchQueue();

      expect(eventEmitter.emit).toHaveBeenCalledTimes(2);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'socket.user.matchFound',
        expect.objectContaining({ userId: 1, battleId: expect.any(String) }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'socket.user.matchFound',
        expect.objectContaining({ userId: 2, battleId: expect.any(String) }),
      );
    });

    it('3인_매칭_완료시_socket_user_matchFound_이벤트_3회_emit', async () => {
      const entries = makeQueueEntries(3);
      const queueMap = Object.fromEntries(
        entries.map((e) => [e.userId.toString(), JSON.stringify(e)]),
      );

      const { service, eventEmitter } = makeMatchingService({
        redisClient: { hgetall: jest.fn().mockResolvedValue(queueMap) },
      });

      await service.processMatchQueue();

      expect(eventEmitter.emit).toHaveBeenCalledTimes(3);
    });

    it('매칭_완료시_emit_페이로드에_battleId_포함', async () => {
      const entries = makeQueueEntries(2);
      const queueMap = Object.fromEntries(
        entries.map((e) => [e.userId.toString(), JSON.stringify(e)]),
      );

      const { service, eventEmitter } = makeMatchingService({
        redisClient: { hgetall: jest.fn().mockResolvedValue(queueMap) },
      });

      await service.processMatchQueue();

      const firstCallPayload = (eventEmitter.emit as jest.Mock).mock.calls[0][1];
      const secondCallPayload = (eventEmitter.emit as jest.Mock).mock.calls[1][1];

      expect(firstCallPayload.battleId).toBeDefined();
      expect(typeof firstCallPayload.battleId).toBe('string');
      expect(firstCallPayload.battleId).toBe(secondCallPayload.battleId);
    });

    it('매칭_완료시_참가자별_각자_userId_포함한_이벤트_emit', async () => {
      const entries = makeQueueEntries(2);
      const queueMap = Object.fromEntries(
        entries.map((e) => [e.userId.toString(), JSON.stringify(e)]),
      );

      const { service, eventEmitter } = makeMatchingService({
        redisClient: { hgetall: jest.fn().mockResolvedValue(queueMap) },
      });

      await service.processMatchQueue();

      const emittedUserIds = (eventEmitter.emit as jest.Mock).mock.calls.map(
        ([, payload]) => payload.userId,
      );
      expect(emittedUserIds).toContain(1);
      expect(emittedUserIds).toContain(2);
    });

    it('매칭_조건_미충족시_이벤트_emit_없음', async () => {
      const entries = makeQueueEntries(1);
      const queueMap = Object.fromEntries(
        entries.map((e) => [e.userId.toString(), JSON.stringify(e)]),
      );

      const { service, eventEmitter } = makeMatchingService({
        redisClient: { hgetall: jest.fn().mockResolvedValue(queueMap) },
      });

      await service.processMatchQueue();

      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('큐가_비어있을때_이벤트_emit_없음', async () => {
      const { service, eventEmitter } = makeMatchingService({
        redisClient: { hgetall: jest.fn().mockResolvedValue(null) },
      });

      await service.processMatchQueue();

      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('옵션이_다른_유저들은_매칭되지_않음', async () => {
      const entry1: MatchQueueEntry = {
        userId: 1,
        leverage: 2,
        seedMoney: 1_000_000,
        duration: 10,
        maxParticipants: 2,
        enqueuedAt: Date.now(),
      };
      const entry2: MatchQueueEntry = {
        userId: 2,
        leverage: 5,
        seedMoney: 1_000_000,
        duration: 10,
        maxParticipants: 2,
        enqueuedAt: Date.now(),
      };
      const queueMap = {
        '1': JSON.stringify(entry1),
        '2': JSON.stringify(entry2),
      };

      const { service, eventEmitter } = makeMatchingService({
        redisClient: { hgetall: jest.fn().mockResolvedValue(queueMap) },
      });

      await service.processMatchQueue();

      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('매칭_완료시_battleRepository_save_호출', async () => {
      const saveMock = jest.fn().mockImplementation((b) => Promise.resolve(b));
      const entries = makeQueueEntries(2);
      const queueMap = Object.fromEntries(
        entries.map((e) => [e.userId.toString(), JSON.stringify(e)]),
      );

      const { service } = makeMatchingService({
        battleRepo: { save: saveMock },
        redisClient: { hgetall: jest.fn().mockResolvedValue(queueMap) },
      });

      await service.processMatchQueue();

      expect(saveMock).toHaveBeenCalledTimes(1);
    });

    it('매칭_완료시_battleSessionRepository_save_참가인원_수만큼_호출', async () => {
      const sessionSaveMock = jest.fn().mockImplementation((s) => Promise.resolve(s));
      const entries = makeQueueEntries(2);
      const queueMap = Object.fromEntries(
        entries.map((e) => [e.userId.toString(), JSON.stringify(e)]),
      );

      const { service } = makeMatchingService({
        sessionRepo: { save: sessionSaveMock },
        redisClient: { hgetall: jest.fn().mockResolvedValue(queueMap) },
      });

      await service.processMatchQueue();

      expect(sessionSaveMock).toHaveBeenCalledTimes(2);
    });

    it('매칭_완료후_큐에서_참가자들_제거', async () => {
      const hdelMock = jest.fn().mockResolvedValue(1);
      const entries = makeQueueEntries(2);
      const queueMap = Object.fromEntries(
        entries.map((e) => [e.userId.toString(), JSON.stringify(e)]),
      );

      const { service } = makeMatchingService({
        redisClient: {
          hgetall: jest.fn().mockResolvedValue(queueMap),
          hdel: hdelMock,
        },
      });

      await service.processMatchQueue();

      expect(hdelMock).toHaveBeenCalledWith('battle:match:queue', '1');
      expect(hdelMock).toHaveBeenCalledWith('battle:match:queue', '2');
    });
  });
});
