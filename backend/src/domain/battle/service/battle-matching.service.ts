import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { v4 as uuidv4 } from 'uuid';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RedisService } from '../../../common/config/redis.config';
import { BattleRepository } from '../repository/battle.repository';
import { BattleSessionRepository } from '../repository/battle-session.repository';
import { Battle, BattleStatus } from '../entity/battle.entity';
import { BattleSession } from '../entity/battle-session.entity';
import { MatchBattleRequest } from '../dto/battle-request.dto';
import { MatchQueueResponse } from '../dto/battle-response.dto';
import { CoinBattleException } from '../../../common/exception/coin-battle.exception';
import { ErrorCode } from '../../../common/exception/error-code.enum';

const MATCH_QUEUE_KEY = 'battle:match:queue';
const MATCH_QUEUE_TTL = 300;

interface MatchQueueEntry {
  userId: number;
  leverage: number;
  seedMoney: number;
  duration: number;
  maxParticipants: number;
  enqueuedAt: number;
}

@Injectable()
export class BattleMatchingService {
  private readonly logger = new Logger(BattleMatchingService.name);

  constructor(
    private readonly redisService: RedisService,
    private readonly battleRepository: BattleRepository,
    private readonly battleSessionRepository: BattleSessionRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async enqueue(userId: number, request: MatchBattleRequest): Promise<MatchQueueResponse> {
    const entry: MatchQueueEntry = {
      userId,
      leverage: request.leverage,
      seedMoney: request.seedMoney,
      duration: request.duration,
      maxParticipants: request.maxParticipants ?? 2,
      enqueuedAt: Date.now(),
    };

    await this.redisService.client.hset(MATCH_QUEUE_KEY, userId.toString(), JSON.stringify(entry));
    await this.redisService.client.expire(MATCH_QUEUE_KEY, MATCH_QUEUE_TTL);

    return { queued: true, estimatedWaitSeconds: 30 };
  }

  async dequeue(userId: number): Promise<void> {
    const entry = await this.redisService.client.hget(MATCH_QUEUE_KEY, userId.toString());
    if (!entry) throw new CoinBattleException(ErrorCode.NOT_IN_MATCH_QUEUE);
    await this.redisService.client.hdel(MATCH_QUEUE_KEY, userId.toString());
  }

  @Cron('*/5 * * * * *')
  async processMatchQueue(): Promise<void> {
    try {
      const all = await this.redisService.client.hgetall(MATCH_QUEUE_KEY);
      if (!all) return;

      const entries: MatchQueueEntry[] = Object.values(all).map((v) => JSON.parse(v));
      const groups = new Map<string, MatchQueueEntry[]>();

      for (const entry of entries) {
        const key = `${entry.leverage}:${entry.seedMoney}:${entry.duration}:${entry.maxParticipants}`;
        const group = groups.get(key) ?? [];
        group.push(entry);
        groups.set(key, group);
      }

      for (const [, group] of groups) {
        const maxP = group[0].maxParticipants;
        if (maxP >= 2 && group.length >= maxP) {
          const matched = group.slice(0, maxP);
          await this.createMatchedBattle(matched);
          for (const entry of matched) {
            await this.redisService.client.hdel(MATCH_QUEUE_KEY, entry.userId.toString());
          }
        }
      }
    } catch (e) {
      this.logger.error('매칭 큐 처리 실패', e);
    }
  }

  private async createMatchedBattle(entries: MatchQueueEntry[]): Promise<void> {
    const first = entries[0];
    const battle = new Battle();
    battle.battleId = uuidv4();
    battle.hostUserId = first.userId;
    battle.userId = first.userId;
    battle.leverage = first.leverage;
    battle.seedMoney = first.seedMoney;
    battle.duration = first.duration;
    battle.maxParticipants = first.maxParticipants;
    battle.status = BattleStatus.WAITING;
    battle.currentParticipants = entries.length;
    if (battle.canStart()) {
      battle.start();
    }

    await this.battleRepository.save(battle);

    for (const entry of entries) {
      const session = new BattleSession();
      session.id = uuidv4();
      session.battleId = battle.battleId;
      session.participantId = entry.userId;
      await this.battleSessionRepository.save(session);
    }

    this.logger.log(`매칭 완료 battleId=${battle.battleId} participants=${entries.map((e) => e.userId).join(',')}`);

    for (const entry of entries) {
      this.eventEmitter.emit('socket.user.matchFound', { userId: entry.userId, battleId: battle.battleId });
    }
  }
}
