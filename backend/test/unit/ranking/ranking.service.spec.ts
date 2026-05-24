import { RankingService } from 'src/domain/ranking/service/ranking.service';
import { RedisService } from 'src/common/config/redis.config';
import { UserRepository } from 'src/domain/user/repository/user.repository';
import { PositionRepository } from 'src/domain/order/repository/position.repository';
import { TickerRedisRepository } from 'src/domain/market/repository/ticker-redis.repository';

function makeRankingService(overrides: Partial<{
  redisClient: any;
  userRepo: Partial<UserRepository>;
  positionRepo: Partial<PositionRepository>;
  tickerRepo: Partial<TickerRedisRepository>;
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
    findAll: jest.fn().mockResolvedValue([]),
    findAllByIds: jest.fn().mockResolvedValue([]),
    ...overrides.userRepo,
  } as any as UserRepository;
  const positionRepo = {
    findAllByStatus: jest.fn().mockResolvedValue([]),
    ...overrides.positionRepo,
  } as any as PositionRepository;
  const tickerRepo = {
    findByMarket: jest.fn().mockResolvedValue(null),
    ...overrides.tickerRepo,
  } as any as TickerRedisRepository;

  return new RankingService(redisService, userRepo, positionRepo, tickerRepo);
}

describe('RankingService', () => {
  describe('updateRanking', () => {
    it('데일리_랭킹에_점수_저장', async () => {
      const zaddMock = jest.fn().mockResolvedValue(1);
      const service = makeRankingService({ redisClient: { zadd: zaddMock } });

      await service.updateRanking(42, 10_500_000);

      expect(zaddMock).toHaveBeenCalledWith('leaderboard:daily', 10_500_000, '42');
    });
  });

  describe('getSeasonRankings', () => {
    it('유저가_없으면_빈_배열_반환', async () => {
      const service = makeRankingService();
      const result = await service.getSeasonRankings(100);
      expect(result).toEqual([]);
    });

    it('포지션_없는_유저도_초기잔고로_랭킹에_포함', async () => {
      const userRepo = {
        findAll: jest.fn().mockResolvedValue([
          { id: 1, nickname: 'Alice', balance: 10_000_000 },
          { id: 2, nickname: 'Bob', balance: 9_000_000 },
        ]),
      };
      const service = makeRankingService({ userRepo });

      const result = await service.getSeasonRankings(100);
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ rank: 1, userId: 1, nickname: 'Alice', evaluatedValue: 10_000_000 });
      expect(result[1]).toMatchObject({ rank: 2, userId: 2, nickname: 'Bob', evaluatedValue: 9_000_000 });
    });

    it('오픈_포지션_손익이_평가금액에_반영됨', async () => {
      const userRepo = {
        findAll: jest.fn().mockResolvedValue([
          { id: 1, nickname: 'Alice', balance: 8_000_000 },
        ]),
      };
      const positionRepo = {
        findAllByStatus: jest.fn().mockResolvedValue([
          {
            userId: 1,
            ticker: 'KRW-BTC',
            margin: 1_000_000,
            averagePrice: 50_000_000,
            unrealizedPnl: jest.fn().mockReturnValue(500_000),
          },
        ]),
      };
      const tickerRepo = {
        findByMarket: jest.fn().mockResolvedValue({ tradePrice: 55_000_000 }),
      };
      const service = makeRankingService({ userRepo, positionRepo, tickerRepo });

      const result = await service.getSeasonRankings(100);
      expect(result[0].evaluatedValue).toBe(9_500_000); // 8_000_000 + 1_000_000 + 500_000
    });

    it('limit_초과_요청시_최대_100개_반환', async () => {
      const users = Array.from({ length: 150 }, (_, i) => ({ id: i + 1, nickname: `User${i}`, balance: 10_000_000 }));
      const userRepo = { findAll: jest.fn().mockResolvedValue(users) };
      const service = makeRankingService({ userRepo });

      const result = await service.getSeasonRankings(200);
      expect(result).toHaveLength(100);
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
