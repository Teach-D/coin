import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { BattleEndService } from '../service/battle-end.service';

@Injectable()
export class BattleRankingScheduler {
  private readonly logger = new Logger(BattleRankingScheduler.name);

  constructor(private readonly battleEndService: BattleEndService) {}

  @Interval(30_000)
  async processExpiredBattles(): Promise<void> {
    try {
      await this.battleEndService.processExpiredBattles();
    } catch (e) {
      this.logger.error('만료 배틀 처리 실패', e);
    }
  }
}
