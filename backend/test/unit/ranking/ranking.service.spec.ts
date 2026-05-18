import { RankingService } from 'src/domain/ranking/service/ranking.service';
import { RedisService } from 'src/common/config/redis.config';
import { UserRepository } from 'src/domain/user/repository/user.repository';

function makeRankingService(overrides: Partial<{
  redisClient: any;
  userRepo: Partial<UserRepository>;
}> = {}): RankingService {
  const redisClient = {
    zadd: jest.fn().mockResolvedValue(1),
    zrevrangebyscore: jest.fn().mockResolvedValue([]),
    zscore: jest.fn().mockResolvedValue(null),
    zrevrank: jest.fn().mockResolvedValue(null),
    hincrby: jest.fn().mockResolvedValue(1),
    hget: jest.fn().mockResolvedValue('1'),
    del: jest.fn().mockResolvedValue(1),
    ...overrides.redisClient,
  };
  const redisService = { client: redisClient } as any as RedisService;
  const userRepo = {
    findById: jest.fn(),
    findAllByIds: jest.fn().mockResolvedValue([]),
    ...overrides.userRepo,
  } as any as UserRepository;

  return new RankingService(redisService, userRepo);
}

describe('RankingService', () => {
  describe('updateRanking', () => {
    it('시즌_및_데일리_랭킹에_점수_저장', async () => {
      const zaddMock = jest.fn().mockResolvedValue(1);
      const service = makeRankingService({ redisClient: { zadd: zaddMock } });

      await service.updateRanking(42, 10_500_000);

      expect(zaddMock).toHaveBeenCalledWith('leaderboard:season', 10_500_000, '42');
      expect(zaddMock).toHaveBeenCalledWith('leaderboard:daily', 10_500_000, '42');
    });
  });

  describe('getTopRankings', () => {
    it('순위_100개_이상_요청시_최대_100개_반환', async () => {
      const service = makeRankingService({
        redisClient: { zrevrangebyscore: jest.fn().mockResolvedValue([]) },
      });

      const result = await service.getTopRankings('leaderboard:season', 200);
      expect(result).toEqual([]);
    });

    it('순위_데이터_있을때_닉네임_포함_반환', async () => {
      const zrevrangebyscore = jest.fn().mockResolvedValue(['42', '10500000', '7', '9800000']);
      const userRepo = {
        findAllByIds: jest.fn().mockResolvedValue([
          { id: 42, nickname: 'Alice' },
          { id: 7, nickname: 'Bob' },
        ]),
      };
      const service = makeRankingService({ redisClient: { zrevrangebyscore }, userRepo });

      const result = await service.getTopRankings('leaderboard:season', 10);
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ rank: 1, userId: 42, nickname: 'Alice', evaluatedValue: 10500000 });
      expect(result[1]).toMatchObject({ rank: 2, userId: 7, nickname: 'Bob', evaluatedValue: 9800000 });
    });
  });

  describe('updatePvpWinRate', () => {
    it('승리시_wins와_total_모두_증가', async () => {
      const hincrbyMock = jest.fn().mockResolvedValue(1);
      const hgetMock = jest.fn()
        .mockResolvedValueOnce('1')
        .mockResolvedValueOnce('1');
      const zaddMock = jest.fn().mockResolvedValue(1);
      const service = makeRankingService({
        redisClient: { hincrby: hincrbyMock, hget: hgetMock, zadd: zaddMock },
      });

      await service.updatePvpWinRate(42, true);

      expect(hincrbyMock).toHaveBeenCalledWith('pvp:stats:42', 'total', 1);
      expect(hincrbyMock).toHaveBeenCalledWith('pvp:stats:42', 'wins', 1);
      expect(zaddMock).toHaveBeenCalledWith('leaderboard:pvp-winrate', 100, '42');
    });

    it('패배시_total만_증가', async () => {
      const hincrbyMock = jest.fn().mockResolvedValue(1);
      const hgetMock = jest.fn()
        .mockResolvedValueOnce('0')
        .mockResolvedValueOnce('2');
      const zaddMock = jest.fn().mockResolvedValue(1);
      const service = makeRankingService({
        redisClient: { hincrby: hincrbyMock, hget: hgetMock, zadd: zaddMock },
      });

      await service.updatePvpWinRate(42, false);

      expect(hincrbyMock).toHaveBeenCalledWith('pvp:stats:42', 'total', 1);
      expect(hincrbyMock).not.toHaveBeenCalledWith('pvp:stats:42', 'wins', 1);
    });
  });
});
