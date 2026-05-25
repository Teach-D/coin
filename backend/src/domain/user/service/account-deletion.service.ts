import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import Redlock from 'redlock';
import { CoinBattleException } from '../../../common/exception/coin-battle.exception';
import { ErrorCode } from '../../../common/exception/error-code.enum';
import { RedisService } from '../../../common/config/redis.config';
import { User } from '../entity/user.entity';
import { Position, PositionStatus } from '../../order/entity/position.entity';
import { Battle } from '../../battle/entity/battle.entity';
import { BattleSession } from '../../battle/entity/battle-session.entity';
import { UserRepository } from '../repository/user.repository';
import { PositionRepository } from '../../order/repository/position.repository';
import { BattleRepository } from '../../battle/repository/battle.repository';
import { BattleSessionRepository } from '../../battle/repository/battle-session.repository';
import { UserWithdrawnEvent } from '../event/user-withdrawn.event';

@Injectable()
export class AccountDeletionService {
  private readonly redlock: Redlock;

  constructor(
    private readonly userRepository: UserRepository,
    private readonly positionRepository: PositionRepository,
    private readonly battleRepository: BattleRepository,
    private readonly battleSessionRepository: BattleSessionRepository,
    private readonly redisService: RedisService,
    private readonly eventEmitter: EventEmitter2,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {
    this.redlock = new Redlock([this.redisService.client], { retryCount: 0 });
  }

  async withdraw(userId: number): Promise<void> {
    let lock: any;
    try {
      lock = await this.redlock.acquire([`user:${userId}:order`], 10000);
    } catch {
      throw new CoinBattleException(ErrorCode.ORDER_LOCK_TIMEOUT);
    }

    const voidedBattleIds: string[] = [];
    const deletedBattleIds: string[] = [];

    try {
      await this.dataSource.transaction(async (manager: EntityManager) => {
        const user = await manager.findOne(User, { where: { id: userId, deletedAt: IsNull() } });
        if (!user) throw new CoinBattleException(ErrorCode.USER_NOT_FOUND);

        const openPositions = await manager.find(Position, {
          where: { userId, status: PositionStatus.OPEN, battleId: IsNull() },
        });
        for (const position of openPositions) {
          position.close();
          await manager.save(position);
        }

        const hostWaitingBattles = await this.battleRepository.findWaitingByHostUserId(userId);
        for (const battle of hostWaitingBattles) {
          await manager.delete(BattleSession, { battleId: battle.battleId });
          await manager.delete(Battle, { battleId: battle.battleId });
          deletedBattleIds.push(battle.battleId);
        }

        const participantWaitingBattles = await this.battleRepository.findWaitingByParticipantId(userId);
        for (const battle of participantWaitingBattles) {
          await manager.delete(BattleSession, { participantId: userId, battleId: battle.battleId });
          battle.removeParticipant();
          await manager.save(battle);
        }

        const inProgressBattles = await this.battleRepository.findInProgressByParticipantId(userId);
        for (const battle of inProgressBattles) {
          battle.void();
          await manager.save(battle);
          voidedBattleIds.push(battle.battleId);
        }

        user.withdraw();
        await manager.save(user);
      });

      await this.redisService.client.zrem('leaderboard:season', String(userId));
      await this.redisService.client.zrem('leaderboard:daily', String(userId));
      await this.redisService.client.zrem('leaderboard:pvp-winrate', String(userId));
      await this.redisService.client.del(`pvp:stats:${userId}`);

      this.eventEmitter.emit('user.withdrawn', new UserWithdrawnEvent(userId, voidedBattleIds, deletedBattleIds));
    } finally {
      await lock.release().catch(() => {});
    }
  }
}
