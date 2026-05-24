import { forwardRef, Module } from '@nestjs/common';
import { RankingService } from './service/ranking.service';
import { RankingScheduler } from './scheduler/ranking.scheduler';
import { RankingController } from './controller/ranking.controller';
import { UserModule } from '../user/user.module';
import { OrderModule } from '../order/order.module';
import { MarketModule } from '../market/market.module';

@Module({
  imports: [
    forwardRef(() => UserModule),
    forwardRef(() => OrderModule),
    MarketModule,
  ],
  providers: [RankingService, RankingScheduler],
  controllers: [RankingController],
  exports: [RankingService],
})
export class RankingModule {}
