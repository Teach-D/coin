import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Semaphore } from '../../../common/util/semaphore';
import { CoinBattleException } from '../../../common/exception/coin-battle.exception';
import { ErrorCode } from '../../../common/exception/error-code.enum';
import { UserRepository } from '../../user/repository/user.repository';
import { BattleRepository } from '../repository/battle.repository';
import { BattleSessionRepository } from '../repository/battle-session.repository';
import { TickerRedisRepository } from '../../market/repository/ticker-redis.repository';
import { PositionRepository } from '../../order/repository/position.repository';
import { PositionStatus } from '../../order/entity/position.entity';
import { User } from '../../user/entity/user.entity';
import { Battle, BattleStatus } from '../entity/battle.entity';
import { BattleSession } from '../entity/battle-session.entity';
import {
  BattleRankEntry,
  BattleResultResponse,
  ParticipantResultResponse,
} from '../dto/battle-response.dto';
import { BattleFinishedEvent } from '../event/battle.event';

interface SessionValuation {
  session: BattleSession;
  finalValuation: number;
}

@Injectable()
export class BattleEndService {
  private readonly logger = new Logger(BattleEndService.name);
  private readonly finishValuationSemaphore = new Semaphore(5);
  private readonly rankingValuationSemaphore = new Semaphore(3);

  constructor(
    private readonly battleRepository: BattleRepository,
    private readonly battleSessionRepository: BattleSessionRepository,
    private readonly userRepository: UserRepository,
    private readonly positionRepository: PositionRepository,
    private readonly tickerRedisRepository: TickerRedisRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async processExpiredBattles(): Promise<void> {
    const now = new Date();
    const minDurationExpiredBefore = new Date(now.getTime() - 10 * 60 * 1000);
    const expiredBattles = await this.battleRepository.findExpiredBattles(
      BattleStatus.IN_PROGRESS,
      minDurationExpiredBefore,
    );

    for (const battle of expiredBattles) {
      try {
        await this.finishBattleInTransaction(battle, now);
      } catch (e) {
        this.logger.error(`배틀 종료 처리 실패 battleId=${battle.battleId}`, e);
      }
    }
  }

  async finishBattleInTransaction(battle: Battle, now: Date): Promise<void> {
    const expiredBeforeMs = now.getTime() - battle.duration * 60 * 1000;
    const startTime = battle.startTime;
    if (!startTime || startTime.getTime() > expiredBeforeMs) return;

    const sessions = await this.battleSessionRepository.findByBattleId(battle.battleId);
    const participantIds = sessions.map((s) => s.participantId);
    const users = await this.userRepository.findAllByIds(participantIds);
    const userMap = new Map(users.map((u) => [u.id, u]));

    const valuations: SessionValuation[] = await Promise.all(
      sessions.map((session) =>
        this.finishValuationSemaphore.run(async () => {
          const user = userMap.get(session.participantId);
          if (!user) return { session, finalValuation: 0 };
          const finalValuation = await this.calculateFinalValuation(user);
          return { session, finalValuation };
        }),
      ),
    );

    const ranked = [...valuations].sort((a, b) => b.finalValuation - a.finalValuation);

    for (let i = 0; i < ranked.length; i++) {
      ranked[i].session.finalValuation = ranked[i].finalValuation;
      ranked[i].session.rank = i + 1;
      await this.battleSessionRepository.save(ranked[i].session);
    }

    const winnerId = ranked[0]?.session.participantId ?? null;
    battle.finish(winnerId);
    await this.battleRepository.save(battle);

    const rankings = this.buildRankings(battle, ranked, userMap);
    const participantResults: ParticipantResultResponse[] = ranked.map((sv, index) => {
      const user = userMap.get(sv.session.participantId);
      const profitAmount = sv.finalValuation - battle.seedMoney;
      const profitRate = battle.seedMoney > 0 ? (profitAmount / battle.seedMoney) * 100 : 0;
      return {
        userId: sv.session.participantId,
        nickname: user?.nickname ?? '',
        rank: index + 1,
        isWinner: sv.session.participantId === battle.winnerId,
        initialSeed: battle.seedMoney,
        finalValuation: sv.finalValuation,
        profitAmount,
        profitRate,
      };
    });

    const battleResult: BattleResultResponse = {
      battleId: battle.battleId,
      status: battle.status,
      durationMinutes: battle.duration,
      endedAt: battle.endTime?.toISOString() ?? null,
      participants: participantResults,
      myResult: null,
    };

    this.eventEmitter.emit(
      'battle.finished',
      new BattleFinishedEvent(battle.battleId, battle.winnerId, rankings, battleResult),
    );

    this.eventEmitter.emit('socket.battle.finished', { battleId: battle.battleId });
  }

  async getBattleResult(battleId: string, currentUserId: number): Promise<BattleResultResponse> {
    const battle = await this.battleRepository.findById(battleId);
    if (!battle) throw new CoinBattleException(ErrorCode.BATTLE_NOT_FOUND);

    if (battle.status !== BattleStatus.FINISHED) {
      throw new CoinBattleException(ErrorCode.BATTLE_NOT_FINISHED);
    }

    const sessions = await this.battleSessionRepository.findByBattleId(battleId);
    const participantIds = sessions.map((s) => s.participantId);

    if (!participantIds.includes(currentUserId)) {
      throw new CoinBattleException(ErrorCode.BATTLE_ACCESS_DENIED);
    }

    const users = await this.userRepository.findAllByIds(participantIds);
    const userMap = new Map(users.map((u) => [u.id, u]));

    const participants: ParticipantResultResponse[] = sessions
      .map((session) => {
        const user = userMap.get(session.participantId);
        const finalValuation = session.finalValuation ?? 0;
        const profitAmount = finalValuation - battle.seedMoney;
        const profitRate = battle.seedMoney > 0 ? (profitAmount / battle.seedMoney) * 100 : 0;
        return {
          userId: session.participantId,
          nickname: user?.nickname ?? '',
          rank: session.rank ?? 0,
          isWinner: session.participantId === battle.winnerId,
          initialSeed: battle.seedMoney,
          finalValuation,
          profitAmount,
          profitRate,
        };
      })
      .sort((a, b) => a.rank - b.rank);

    const myResult = participants.find((p) => p.userId === currentUserId) ?? null;

    return {
      battleId: battleId,
      status: battle.status,
      durationMinutes: battle.duration,
      endedAt: battle.endTime?.toISOString() ?? null,
      participants,
      myResult,
    };
  }

  async calculateLiveRankings(battle: Battle): Promise<{ userId: number; currentValuation: number; rank: number }[]> {
    const sessions = await this.battleSessionRepository.findByBattleId(battle.battleId);
    const participantIds = sessions.map((s) => s.participantId);
    const users = await this.userRepository.findAllByIds(participantIds);
    const userMap = new Map(users.map((u) => [u.id, u]));

    const valuations = await Promise.all(
      sessions.map((session) =>
        this.rankingValuationSemaphore.run(async () => {
          const user = userMap.get(session.participantId);
          if (!user) return { userId: session.participantId, currentValuation: 0 };
          const currentValuation = await this.calculateFinalValuation(user);
          return { userId: session.participantId, currentValuation };
        }),
      ),
    );

    const ranked = [...valuations].sort((a, b) => b.currentValuation - a.currentValuation);
    return ranked.map((entry, index) => ({ ...entry, rank: index + 1 }));
  }

  private async calculateFinalValuation(user: User): Promise<number> {
    const openPositions = await this.positionRepository.findByUserIdAndStatus(user.id, PositionStatus.OPEN);
    const positionValue = await openPositions.reduce(async (accPromise, position) => {
      const acc = await accPromise;
      const ticker = await this.tickerRedisRepository.findByMarket(position.ticker);
      const currentPrice = ticker?.tradePrice ? Math.floor(ticker.tradePrice) : position.averagePrice;
      return acc + position.evaluatedValue(currentPrice);
    }, Promise.resolve(0));
    return user.balance + positionValue;
  }

  private buildRankings(
    battle: Battle,
    ranked: SessionValuation[],
    userMap: Map<number, User>,
  ): BattleRankEntry[] {
    return ranked.map((sv, index) => {
      const user = userMap.get(sv.session.participantId);
      const returnRate =
        battle.seedMoney > 0 ? ((sv.finalValuation - battle.seedMoney) / battle.seedMoney) * 100 : 0;
      return {
        rank: index + 1,
        userId: sv.session.participantId,
        nickname: user?.nickname ?? '',
        returnRate,
        currentValuation: sv.finalValuation,
      };
    });
  }
}
