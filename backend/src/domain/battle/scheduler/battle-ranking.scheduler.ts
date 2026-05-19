import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BattleEndService } from '../service/battle-end.service';
import { BattleRepository } from '../repository/battle.repository';
import { BattleStatus } from '../entity/battle.entity';

@Injectable()
export class BattleRankingScheduler {
  private readonly logger = new Logger(BattleRankingScheduler.name);

  constructor(
    private readonly battleEndService: BattleEndService,
    private readonly battleRepository: BattleRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Interval(30_000)
  async processExpiredBattles(): Promise<void> {
    try {
      await this.battleEndService.processExpiredBattles();
    } catch (e) {
      this.logger.error('만료 배틀 처리 실패', e);
    }
  }

  @Interval(5_000)
  async broadcastLiveRankings(): Promise<void> {
    try {
      const { content: battles } = await this.battleRepository.findByStatus(BattleStatus.IN_PROGRESS, 0, 100);
      for (const battle of battles) {
        try {
          const rankings = await this.battleEndService.calculateLiveRankings(battle);
          this.eventEmitter.emit('socket.battle.rankUpdate', { battleId: battle.battleId, rankings });
        } catch (e) {
          this.logger.error(`라이브 랭킹 계산 실패 battleId=${battle.battleId}`, e);
        }
      }
    } catch (e) {
      this.logger.error('라이브 랭킹 브로드캐스트 실패', e);
    }
  }
}
