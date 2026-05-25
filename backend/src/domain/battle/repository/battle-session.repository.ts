import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { BattleSession } from '../entity/battle-session.entity';
import { BattleStatus } from '../entity/battle.entity';


@Injectable()
export class BattleSessionRepository {
  constructor(
    @InjectRepository(BattleSession)
    private readonly repo: Repository<BattleSession>,
  ) {}

  async findByBattleId(battleId: string): Promise<BattleSession[]> {
    return this.repo.find({ where: { battleId } });
  }

  async existsByParticipantIdAndBattleId(participantId: number, battleId: string): Promise<boolean> {
    return this.repo.exists({ where: { participantId, battleId } });
  }

  async existsActiveByParticipantId(participantId: number, activeStatuses: BattleStatus[]): Promise<boolean> {
    const sessions = await this.repo.find({ where: { participantId } });
    if (sessions.length === 0) return false;

    const battleIds = sessions.map((s) => s.battleId);

    const { Battle } = await import('../entity/battle.entity');
    const battleRepo = this.repo.manager.getRepository(Battle);
    const activeBattles = await battleRepo.find({
      where: {
        battleId: In(battleIds),
        status: In(activeStatuses),
      },
    });
    return activeBattles.length > 0;
  }

  async findParticipantIdsByBattleId(battleId: string): Promise<number[]> {
    const sessions = await this.repo.find({ where: { battleId } });
    return sessions.map((s) => s.participantId);
  }

  async findByParticipantAndBattle(userId: number, battleId: string): Promise<BattleSession | null> {
    return this.repo.findOne({ where: { participantId: userId, battleId } });
  }

  async deleteByBattleId(battleId: string): Promise<void> {
    await this.repo.delete({ battleId });
  }

  async deleteByBattleIds(battleIds: string[]): Promise<void> {
    if (battleIds.length === 0) return;
    await this.repo.delete({ battleId: In(battleIds) });
  }

  async deleteByParticipantIdAndBattleId(participantId: number, battleId: string): Promise<void> {
    await this.repo.delete({ participantId, battleId });
  }

  async save(session: BattleSession): Promise<BattleSession> {
    return this.repo.save(session);
  }

  async countWins(userId: number): Promise<number> {
    const sessions = await this.repo.find({ where: { participantId: userId, rank: 1 } });
    return sessions.length;
  }

  async countLosses(userId: number): Promise<number> {
    const sessions = await this.repo.find({ where: { participantId: userId } });
    const withRank = sessions.filter((s) => s.rank !== null);
    return withRank.filter((s) => s.rank! > 1).length;
  }

  async countDraws(userId: number): Promise<number> {
    return 0;
  }

  async findBestReturnRate(userId: number): Promise<number | null> {
    const sessions = await this.repo.find({ where: { participantId: userId } });
    const withValuation = sessions.filter((s) => s.finalValuation !== null);
    if (withValuation.length === 0) return null;

    const battleIds = withValuation.map((s) => s.battleId);
    const { Battle } = await import('../entity/battle.entity');
    const battleRepo = this.repo.manager.getRepository(Battle);
    const battles = await battleRepo.find({ where: { battleId: In(battleIds) } });
    const battleMap = new Map(battles.map((b) => [b.battleId, b]));

    let best: number | null = null;
    for (const session of withValuation) {
      const battle = battleMap.get(session.battleId);
      if (!battle || !battle.seedMoney) continue;
      const rate = ((session.finalValuation! - battle.seedMoney) / battle.seedMoney) * 100;
      if (best === null || rate > best) best = rate;
    }
    return best;
  }
}
