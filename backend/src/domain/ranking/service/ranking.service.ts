import { Injectable } from '@nestjs/common';
import { CoinBattleException } from '../../../common/exception/coin-battle.exception';
import { ErrorCode } from '../../../common/exception/error-code.enum';
import { RedisService } from '../../../common/config/redis.config';
import { UserRepository } from '../../user/repository/user.repository';
import { PositionRepository } from '../../order/repository/position.repository';
import { PositionStatus } from '../../order/entity/position.entity';
import { TickerRedisRepository } from '../../market/repository/ticker-redis.repository';
import {
  MyRankingResponse,
  PvpRankingEntryResponse,
  RankingEntryResponse,
} from '../dto/ranking-response.dto';

const DAILY_KEY = 'leaderboard:daily';
const PVP_WINRATE_KEY = 'leaderboard:pvp-winrate';
const PVP_STATS_KEY_PREFIX = 'pvp:stats:';
const MAX_LIMIT = 100;

@Injectable()
export class RankingService {
  constructor(
    private readonly redisService: RedisService,
    private readonly userRepository: UserRepository,
    private readonly positionRepository: PositionRepository,
    private readonly tickerRedisRepository: TickerRedisRepository,
  ) {}

  async updateRanking(userId: number, evaluatedValue: number): Promise<void> {
    await this.redisService.client.zadd(DAILY_KEY, evaluatedValue, userId.toString());
  }

  private async buildAllUserAssets(): Promise<Array<{ userId: number; nickname: string; totalAsset: number }>> {
    const users = await this.userRepository.findAll();
    const allOpenPositions = await this.positionRepository.findAllByStatusExcludingBattle(PositionStatus.OPEN);

    const positionsByUser = new Map<number, typeof allOpenPositions>();
    for (const pos of allOpenPositions) {
      const list = positionsByUser.get(pos.userId) ?? [];
      list.push(pos);
      positionsByUser.set(pos.userId, list);
    }

    const uniqueTickers = [...new Set(allOpenPositions.map((p) => p.ticker))];
    const tickerPrices = new Map<string, number>();
    await Promise.all(
      uniqueTickers.map(async (ticker) => {
        const data = await this.tickerRedisRepository.findByMarket(ticker);
        tickerPrices.set(ticker, data?.tradePrice ? Math.floor(data.tradePrice) : 0);
      }),
    );

    return users.map((user) => {
      const positions = positionsByUser.get(user.id) ?? [];
      let totalMargin = 0;
      let totalPnl = 0;
      for (const pos of positions) {
        const price = tickerPrices.get(pos.ticker) ?? pos.averagePrice;
        totalMargin += pos.margin;
        totalPnl += pos.unrealizedPnl(price);
      }
      return {
        userId: user.id,
        nickname: user.nickname,
        totalAsset: user.balance + totalMargin + totalPnl,
      };
    });
  }

  async getSeasonRankings(limit: number): Promise<RankingEntryResponse[]> {
    const effectiveLimit = Math.min(Math.max(limit, 1), MAX_LIMIT);
    const entries = await this.buildAllUserAssets();
    entries.sort((a, b) => b.totalAsset - a.totalAsset);
    return entries.slice(0, effectiveLimit).map((entry, index) => ({
      rank: index + 1,
      userId: entry.userId,
      nickname: entry.nickname,
      evaluatedValue: Math.floor(entry.totalAsset),
    }));
  }

  async getMyRanking(userId: number): Promise<MyRankingResponse> {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new CoinBattleException(ErrorCode.USER_NOT_FOUND);

    const entries = await this.buildAllUserAssets();
    entries.sort((a, b) => b.totalAsset - a.totalAsset);

    const myIndex = entries.findIndex((e) => e.userId === userId);
    const myEntry = entries[myIndex];

    return {
      userId,
      nickname: user.nickname,
      season: {
        rank: myIndex >= 0 ? myIndex + 1 : null,
        evaluatedValue: myEntry ? Math.floor(myEntry.totalAsset) : 0,
      },
      daily: { rank: null, evaluatedValue: 0 },
    };
  }

  async updatePvpWinRate(userId: number, isWin: boolean): Promise<void> {
    const statsKey = `${PVP_STATS_KEY_PREFIX}${userId}`;
    await this.redisService.client.hincrby(statsKey, 'total', 1);
    if (isWin) {
      await this.redisService.client.hincrby(statsKey, 'wins', 1);
    }
    const winsStr = await this.redisService.client.hget(statsKey, 'wins');
    const totalStr = await this.redisService.client.hget(statsKey, 'total');
    const wins = parseInt(winsStr ?? '0', 10);
    const total = parseInt(totalStr ?? '0', 10);
    if (total === 0) return;
    const score = (wins / total) * 100;
    await this.redisService.client.zadd(PVP_WINRATE_KEY, score, userId.toString());
  }

  async getTopPvpRankings(limit: number): Promise<PvpRankingEntryResponse[]> {
    const effectiveLimit = Math.min(Math.max(limit, 1), MAX_LIMIT);
    const result = await this.redisService.client.zrevrangebyscore(
      PVP_WINRATE_KEY,
      '+inf',
      '-inf',
      'WITHSCORES',
      'LIMIT',
      0,
      effectiveLimit,
    );

    const entries: { member: string; score: number }[] = [];
    for (let i = 0; i < result.length; i += 2) {
      entries.push({ member: result[i], score: parseFloat(result[i + 1]) });
    }

    const userIds = entries.map((e) => parseInt(e.member, 10)).filter((id) => !isNaN(id));
    const users = await this.userRepository.findAllByIds(userIds);
    const userMap = new Map(users.map((u) => [u.id, u]));

    return entries
      .map((entry, index) => {
        const uid = parseInt(entry.member, 10);
        const user = userMap.get(uid);
        if (!user) return null;
        return {
          rank: index + 1,
          userId: uid,
          nickname: user.nickname,
          winRatePct: entry.score,
        };
      })
      .filter((e): e is PvpRankingEntryResponse => e !== null);
  }

  async resetDailyRanking(): Promise<void> {
    await this.redisService.client.del(DAILY_KEY);
  }
}
