import { TickerRedisRepository } from 'src/domain/market/repository/ticker-redis.repository';
import { OrderDirection } from 'src/domain/order/entity/order.entity';

function makeRedisClient(overrides: Partial<{
  zadd: jest.Mock;
  zrem: jest.Mock;
  zrangebyscore: jest.Mock;
}> = {}) {
  return {
    set: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
    rpush: jest.fn(),
    lrange: jest.fn().mockResolvedValue([]),
    zadd: overrides.zadd ?? jest.fn().mockResolvedValue(1),
    zrem: overrides.zrem ?? jest.fn().mockResolvedValue(1),
    zrangebyscore: overrides.zrangebyscore ?? jest.fn().mockResolvedValue([]),
  };
}

function makeRepo(redisClientOverrides?: Parameters<typeof makeRedisClient>[0]): {
  repo: any;
  client: ReturnType<typeof makeRedisClient>;
} {
  const client = makeRedisClient(redisClientOverrides);
  const redisService = { client } as any;
  const repo = new TickerRedisRepository(redisService) as any;
  return { repo, client };
}

describe('TickerRedisRepository — 청산 인덱스 메서드', () => {
  describe('addLiquidationIndex', () => {
    it('올바른_키와_score_member로_ZADD_호출', async () => {
      const { repo, client } = makeRepo();

      await repo.addLiquidationIndex(42, 'KRW-BTC', OrderDirection.LONG, 45000000);

      expect(client.zadd).toHaveBeenCalledWith(
        'liq:KRW-BTC:LONG',
        45000000,
        '42',
      );
    });

    it('SHORT_방향_올바른_키로_ZADD_호출', async () => {
      const { repo, client } = makeRepo();

      await repo.addLiquidationIndex(77, 'KRW-ETH', OrderDirection.SHORT, 3200000);

      expect(client.zadd).toHaveBeenCalledWith(
        'liq:KRW-ETH:SHORT',
        3200000,
        '77',
      );
    });

    it('동일_positionId_재호출시_ZADD로_score_갱신', async () => {
      const { repo, client } = makeRepo();

      await repo.addLiquidationIndex(10, 'KRW-BTC', OrderDirection.LONG, 45000000);
      await repo.addLiquidationIndex(10, 'KRW-BTC', OrderDirection.LONG, 44000000);

      expect(client.zadd).toHaveBeenCalledTimes(2);
      expect(client.zadd).toHaveBeenNthCalledWith(1, 'liq:KRW-BTC:LONG', 45000000, '10');
      expect(client.zadd).toHaveBeenNthCalledWith(2, 'liq:KRW-BTC:LONG', 44000000, '10');
    });
  });

  describe('removeLiquidationIndex', () => {
    it('올바른_키와_member로_ZREM_호출', async () => {
      const { repo, client } = makeRepo();

      await repo.removeLiquidationIndex(55, 'KRW-BTC', OrderDirection.LONG);

      expect(client.zrem).toHaveBeenCalledWith('liq:KRW-BTC:LONG', '55');
    });

    it('SHORT_방향_올바른_키로_ZREM_호출', async () => {
      const { repo, client } = makeRepo();

      await repo.removeLiquidationIndex(88, 'KRW-SOL', OrderDirection.SHORT);

      expect(client.zrem).toHaveBeenCalledWith('liq:KRW-SOL:SHORT', '88');
    });
  });

  describe('getLiquidationCandidates', () => {
    it('LONG_방향_currentPrice_이상_score_positionId_반환', async () => {
      const zrangebyscore = jest.fn().mockResolvedValue(['1', '2', '3']);
      const { repo } = makeRepo({ zrangebyscore });

      const result = await repo.getLiquidationCandidates('KRW-BTC', OrderDirection.LONG, 50000000);

      expect(zrangebyscore).toHaveBeenCalledWith('liq:KRW-BTC:LONG', 50000000, '+inf');
      expect(result).toEqual([1, 2, 3]);
    });

    it('SHORT_방향_currentPrice_이하_score_positionId_반환', async () => {
      const zrangebyscore = jest.fn().mockResolvedValue(['5', '9']);
      const { repo } = makeRepo({ zrangebyscore });

      const result = await repo.getLiquidationCandidates('KRW-ETH', OrderDirection.SHORT, 3000000);

      expect(zrangebyscore).toHaveBeenCalledWith('liq:KRW-ETH:SHORT', 0, 3000000);
      expect(result).toEqual([5, 9]);
    });

    it('청산_대상_없을때_빈_배열_반환', async () => {
      const zrangebyscore = jest.fn().mockResolvedValue([]);
      const { repo } = makeRepo({ zrangebyscore });

      const result = await repo.getLiquidationCandidates('KRW-BTC', OrderDirection.LONG, 50000000);

      expect(result).toEqual([]);
    });
  });
});
