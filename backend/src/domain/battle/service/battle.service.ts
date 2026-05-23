import { Injectable, Optional } from '@nestjs/common';
import Redlock from 'redlock';
import { v4 as uuidv4 } from 'uuid';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CoinBattleException } from '../../../common/exception/coin-battle.exception';
import { ErrorCode } from '../../../common/exception/error-code.enum';
import { RedisService } from '../../../common/config/redis.config';
import { UserRepository } from '../../user/repository/user.repository';
import { BattleRepository } from '../repository/battle.repository';
import { BattleSessionRepository } from '../repository/battle-session.repository';
import { Battle, BattleStatus } from '../entity/battle.entity';
import { BattleSession } from '../entity/battle-session.entity';
import { CreateBattleRequest } from '../dto/battle-request.dto';
import {
  BattleListResponse,
  BattleResponse,
  BattleSummary,
  JoinBattleResponse,
  ParticipantInfo,
} from '../dto/battle-response.dto';

@Injectable()
export class BattleService {
  private readonly redlock: Redlock;
  private readonly allowedDurations = new Set([10, 30, 60]);
  private readonly allowedMaxParticipants = new Set([2, 3, 5]);

  constructor(
    private readonly battleRepository: BattleRepository,
    private readonly battleSessionRepository: BattleSessionRepository,
    private readonly userRepository: UserRepository,
    private readonly redisService: RedisService,
    @Optional() private readonly eventEmitter?: EventEmitter2,
  ) {
    this.redlock = new Redlock([this.redisService.client], { retryCount: 0 });
  }

  async createBattle(userId: number, request: CreateBattleRequest): Promise<BattleResponse> {
    this.validateCreateRequest(request);

    const activeStatuses = [BattleStatus.WAITING, BattleStatus.IN_PROGRESS];
    if (await this.battleSessionRepository.existsActiveByParticipantId(userId, activeStatuses)) {
      throw new CoinBattleException(ErrorCode.ALREADY_IN_BATTLE);
    }

    const battle = new Battle();
    battle.battleId = uuidv4();
    battle.hostUserId = userId;
    battle.userId = userId;
    battle.seedMoney = request.seedMoney;
    battle.duration = request.duration;
    battle.maxParticipants = request.maxParticipants;
    battle.currentParticipants = 1;
    battle.status = BattleStatus.WAITING;

    await this.battleRepository.save(battle);

    const session = new BattleSession();
    session.id = uuidv4();
    session.battleId = battle.battleId;
    session.participantId = userId;
    session.battleBalance = battle.seedMoney;
    await this.battleSessionRepository.save(session);

    return BattleResponse.from(battle);
  }

  async joinBattle(userId: number, battleId: string): Promise<JoinBattleResponse> {
    let lock: any;
    try {
      lock = await this.redlock.acquire([`battle:${battleId}:join`], 3000);
    } catch {
      throw new CoinBattleException(ErrorCode.BATTLE_LOCK_TIMEOUT);
    }

    try {
      return await this.executeJoinBattle(userId, battleId);
    } finally {
      await lock.release().catch(() => {});
    }
  }

  private async executeJoinBattle(userId: number, battleId: string): Promise<JoinBattleResponse> {
    const alreadyInThisBattle = await this.battleSessionRepository.existsByParticipantIdAndBattleId(userId, battleId);
    const activeStatuses = [BattleStatus.WAITING, BattleStatus.IN_PROGRESS];

    if (!alreadyInThisBattle && (await this.battleSessionRepository.existsActiveByParticipantId(userId, activeStatuses))) {
      throw new CoinBattleException(ErrorCode.ALREADY_IN_BATTLE);
    }

    const battle = await this.battleRepository.findById(battleId);
    if (!battle) throw new CoinBattleException(ErrorCode.BATTLE_NOT_FOUND);

    if (battle.status === BattleStatus.IN_PROGRESS || battle.status === BattleStatus.FINISHED) {
      throw new CoinBattleException(ErrorCode.BATTLE_ALREADY_STARTED);
    }

    if (!battle.canAddParticipant() && !alreadyInThisBattle) {
      throw new CoinBattleException(ErrorCode.BATTLE_FULL);
    }

    if (!alreadyInThisBattle) {
      battle.addParticipant();
      const session = new BattleSession();
      session.id = uuidv4();
      session.battleId = battleId;
      session.participantId = userId;
      session.battleBalance = battle.seedMoney;
      await this.battleSessionRepository.save(session);
      this.eventEmitter?.emit('socket.battle.participantJoined', {
        battleId,
        currentParticipants: battle.currentParticipants,
      });
    }

    if (battle.canStart()) {
      battle.start();
      this.eventEmitter?.emit('socket.battle.started', {
        battleId,
        startTime: battle.startTime,
      });
    }

    await this.battleRepository.save(battle);
    return JoinBattleResponse.from(battle);
  }

  async getBattle(battleId: string): Promise<BattleResponse> {
    const battle = await this.battleRepository.findById(battleId);
    if (!battle) throw new CoinBattleException(ErrorCode.BATTLE_NOT_FOUND);

    const participantIds = await this.battleSessionRepository.findParticipantIdsByBattleId(battleId);
    const users = await this.userRepository.findAllByIds(participantIds);
    const userMap = new Map(users.map((u) => [u.id, u]));

    const participants: ParticipantInfo[] = participantIds.map((uid) => {
      const user = userMap.get(uid);
      return {
        userId: uid,
        nickname: user?.nickname ?? '',
        seedPriceSnapshot: null,
        currentValuation: null,
        returnRate: null,
      };
    });

    return BattleResponse.from(battle, participants);
  }

  async getBattleList(status: BattleStatus, page: number, size: number): Promise<BattleListResponse> {
    const { content, total } = await this.battleRepository.findByStatus(status, page, size);
    const totalPages = Math.ceil(total / size);

    return {
      content: content.map((b): BattleSummary => ({
        battleId: b.battleId,
        status: b.status,
        seedMoney: b.seedMoney,
        duration: b.duration,
        maxParticipants: b.maxParticipants,
        currentParticipants: b.currentParticipants,
        createdAt: b.createdAt,
      })),
      totalElements: total,
      totalPages,
      page,
      size,
    };
  }

  private validateCreateRequest(request: CreateBattleRequest): void {
    if (!this.allowedDurations.has(request.duration)) {
      throw new CoinBattleException(ErrorCode.INVALID_DURATION);
    }
    if (!this.allowedMaxParticipants.has(request.maxParticipants)) {
      throw new CoinBattleException(ErrorCode.INVALID_MAX_PARTICIPANTS);
    }
  }
}
