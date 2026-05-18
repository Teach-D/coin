import { Module } from '@nestjs/common';
import { RankingService } from './service/ranking.service';
import { RankingScheduler } from './scheduler/ranking.scheduler';
import { RankingController } from './controller/ranking.controller';
import { UserModule } from '../user/user.module';

@Module({
  imports: [UserModule],
  providers: [RankingService, RankingScheduler],
  controllers: [RankingController],
  exports: [RankingService],
})
export class RankingModule {}
