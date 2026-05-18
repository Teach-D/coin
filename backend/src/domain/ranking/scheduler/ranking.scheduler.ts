import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { RankingService } from '../service/ranking.service';

@Injectable()
export class RankingScheduler {
  private readonly logger = new Logger(RankingScheduler.name);

  constructor(private readonly rankingService: RankingService) {}

  @Cron('0 0 * * *', { timeZone: 'Asia/Seoul' })
  async resetDailyRanking(): Promise<void> {
    try {
      await this.rankingService.resetDailyRanking();
      this.logger.log('데일리 랭킹 초기화 완료');
    } catch (e) {
      this.logger.error('데일리 랭킹 초기화 실패', e);
    }
  }
}
