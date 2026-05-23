import { Injectable } from '@nestjs/common';
import Redlock from 'redlock';
import { v4 as uuidv4 } from 'uuid';
import { ConfigService } from '@nestjs/config';
import { CoinBattleException } from '../../../common/exception/coin-battle.exception';
import { ErrorCode } from '../../../common/exception/error-code.enum';
import { RedisService } from '../../../common/config/redis.config';
import { BattleRepository } from '../repository/battle.repository';
import { BattleSessionRepository } from '../repository/battle-session.repository';
import { InviteCodeRedisRepository } from '../repository/invite-code-redis.repository';
import { BattleStatus } from '../entity/battle.entity';
import { BattleSession } from '../entity/battle-session.entity';
import { InviteCodeResponse, JoinByInviteResponse } from '../dto/battle-response.dto';

@Injectable()
export class InviteService {
  private readonly redlock: Redlock;
  private readonly appBaseUrl: string;

  constructor(
    private readonly battleRepository: BattleRepository,
    private readonly battleSessionRepository: BattleSessionRepository,
    private readonly inviteCodeRedisRepository: InviteCodeRedisRepository,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {
    this.redlock = new Redlock([this.redisService.client], { retryCount: 0 });
    this.appBaseUrl = configService.get<string>('APP_BASE_URL', 'http://localhost:5173');
  }

  async generateInviteCode(battleId: string, requesterId: number): Promise<InviteCodeResponse> {
    const battle = await this.battleRepository.findById(battleId);
    if (!battle) throw new CoinBattleException(ErrorCode.BATTLE_NOT_FOUND);

    if (!(await this.battleSessionRepository.existsByParticipantIdAndBattleId(requesterId, battleId))) {
      throw new CoinBattleException(ErrorCode.BATTLE_ACCESS_DENIED);
    }

    if (!battle.canGenerateInvite()) {
      throw new CoinBattleException(ErrorCode.BATTLE_NOT_IN_PROGRESS);
    }

    const inviteCode = uuidv4();
    await this.inviteCodeRedisRepository.save(inviteCode, battleId);

    return {
      inviteCode,
      inviteUrl: `${this.appBaseUrl}/join/${inviteCode}`,
      expiresAt: new Date(Date.now() + 600_000),
    };
  }

  async joinByInvite(inviteCode: string, inviteeId: number): Promise<JoinByInviteResponse> {
    const battleIdStr = await this.inviteCodeRedisRepository.findBattleId(inviteCode);
    if (!battleIdStr) throw new CoinBattleException(ErrorCode.INVITE_CODE_NOT_FOUND);

    let lock: any;
    try {
      lock = await this.redlock.acquire([`battle:${battleIdStr}:join`], 3000);
    } catch {
      throw new CoinBattleException(ErrorCode.BATTLE_LOCK_TIMEOUT);
    }

    try {
      return await this.executeJoinByInvite(battleIdStr, inviteeId);
    } finally {
      await lock.release().catch(() => {});
    }
  }

  async executeJoinByInvite(battleId: string, inviteeId: number): Promise<JoinByInviteResponse> {
    const battle = await this.battleRepository.findById(battleId);
    if (!battle) throw new CoinBattleException(ErrorCode.BATTLE_NOT_FOUND);

    if (battle.status === BattleStatus.FINISHED) {
      throw new CoinBattleException(ErrorCode.BATTLE_ALREADY_FINISHED);
    }

    if (await this.battleSessionRepository.existsByParticipantIdAndBattleId(inviteeId, battleId)) {
      throw new CoinBattleException(ErrorCode.ALREADY_JOINED_BATTLE);
    }

    battle.addLateParticipant();
    await this.battleRepository.save(battle);

    const session = new BattleSession();
    session.id = uuidv4();
    session.battleId = battleId;
    session.participantId = inviteeId;
    session.battleBalance = battle.seedMoney;
    await this.battleSessionRepository.save(session);

    return {
      battleId,
      battleRoomUrl: `/battles/${battleId}`,
      joinedAt: new Date(),
    };
  }
}
