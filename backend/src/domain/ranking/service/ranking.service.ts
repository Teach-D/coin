import { Injectable } from '@nestjs/common';
import { CoinBattleException } from '../../../common/exception/coin-battle.exception';
import { ErrorCode } from '../../../common/exception/error-code.enum';
import { RedisService } from '../../../common/config/redis.config';
import { UserRepository } from '../../user/repository/user.repository';
import {
  MyRankingResponse,
  PvpRankingEntryResponse,
  RankingEntryResponse,
} from '../dto/ranking-response.dto';

const SEASON_KEY = 'leaderboard:season';
const DAILY_KEY = 'leaderboard:daily';
const PVP_WINRATE_KEY = 'leaderboard:pvp-winrate';
const PVP_STATS_KEY_PREFIX = 'pvp:stats:';
const MAX_LIMIT = 100;

@Injectable()
export class RankingService {
  constructor(
    private readonly redisService: RedisService,
    private readonly userRepository: UserRepository,
  ) {}

  async updateRanking(userId: number, evaluatedValue: number): Promise<void> {
    const score = evaluatedValue;
    await this.redisService.client.zadd(SEASON_KEY, score, userId.toString());
    await this.redisService.client.zadd(DAILY_KEY, score, userId.toString());
  }

  async getTopRankings(key: string, limit: number): Promise<RankingEntryResponse[]> {
    const effectiveLimit = Math.min(Math.max(limit, 1), MAX_LIMIT);
    const result = await this.redisService.client.zrevrangebyscore(
      key,
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
        const userId = parseInt(entry.member, 10);
        const user = userMap.get(userId);
        if (!user) return null;
        return {
          rank: index + 1,
          userId,
          nickname: user.nickname,
          evaluatedValue: Math.floor(entry.score),
        };
      })
      .filter((e): e is RankingEntryResponse => e !== null);
  }

  async getMyRanking(userId: number): Promise<MyRankingResponse> {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new CoinBattleException(ErrorCode.USER_NOT_FOUND);

    const userIdStr = userId.toString();

    const seasonScore = await this.redisService.client.zscore(SEASON_KEY, userIdStr);
    const seasonRankRaw = seasonScore !== null
      ? await this.redisService.client.zrevrank(SEASON_KEY, userIdStr)
      : null;
    const seasonRank = seasonRankRaw !== null ? seasonRankRaw + 1 : null;

    const dailyScore = await this.redisService.client.zscore(DAILY_KEY, userIdStr);
    const dailyRankRaw = dailyScore !== null
      ? await this.redisService.client.zrevrank(DAILY_KEY, userIdStr)
      : null;
    const dailyRank = dailyRankRaw !== null ? dailyRankRaw + 1 : null;

    return {
      userId,
      nickname: user.nickname,
      season: { rank: seasonRank, evaluatedValue: seasonScore ? Math.floor(parseFloat(seasonScore)) : 0 },
      daily: { rank: dailyRank, evaluatedValue: dailyScore ? Math.floor(parseFloat(dailyScore)) : 0 },
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
