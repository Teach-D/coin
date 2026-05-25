import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Battle, BattleStatus } from '../entity/battle.entity';

@Injectable()
export class BattleRepository {
  constructor(
    @InjectRepository(Battle)
    private readonly repo: Repository<Battle>,
  ) {}

  async findById(battleId: string): Promise<Battle | null> {
    return this.repo.findOne({ where: { battleId } });
  }

  async findByStatus(
    status: BattleStatus,
    page: number,
    size: number,
  ): Promise<{ content: Battle[]; total: number }> {
    const [content, total] = await this.repo.findAndCount({
      where: { status },
      order: { createdAt: 'DESC' },
      skip: page * size,
      take: size,
    });
    return { content, total };
  }

  async findExpiredBattles(status: BattleStatus, startTimeBefore: Date): Promise<Battle[]> {
    return this.repo.find({
      where: { status, startTime: LessThan(startTimeBefore) },
    });
  }

  async delete(battleId: string): Promise<void> {
    await this.repo.delete({ battleId });
  }

  async findWaitingByHostUserId(hostUserId: number): Promise<Battle[]> {
    return this.repo.find({ where: { hostUserId, status: BattleStatus.WAITING } });
  }

  async findWaitingByParticipantId(userId: number): Promise<Battle[]> {
    return this.repo
      .createQueryBuilder('b')
      .innerJoin('battle_sessions', 'bs', 'bs.battle_id = b.battle_id')
      .where('bs.participant_id = :userId', { userId })
      .andWhere('b.status = :status', { status: BattleStatus.WAITING })
      .andWhere('b.host_user_id != :userId', { userId })
      .getMany();
  }

  async findInProgressByParticipantId(userId: number): Promise<Battle[]> {
    return this.repo
      .createQueryBuilder('b')
      .innerJoin('battle_sessions', 'bs', 'bs.battle_id = b.battle_id')
      .where('bs.participant_id = :userId', { userId })
      .andWhere('b.status = :status', { status: BattleStatus.IN_PROGRESS })
      .getMany();
  }

  async save(battle: Battle): Promise<Battle> {
    return this.repo.save(battle);
  }
}
