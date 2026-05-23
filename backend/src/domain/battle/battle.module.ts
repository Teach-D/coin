import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Battle } from './entity/battle.entity';
import { BattleSession } from './entity/battle-session.entity';
import { BattleRepository } from './repository/battle.repository';
import { BattleSessionRepository } from './repository/battle-session.repository';
import { InviteCodeRedisRepository } from './repository/invite-code-redis.repository';
import { BattleService } from './service/battle.service';
import { BattleEndService } from './service/battle-end.service';
import { BattleOrderService } from './service/battle-order.service';
import { InviteService } from './service/invite.service';
import { BattleMatchingService } from './service/battle-matching.service';
import { BattleCardImageService } from './service/battle-card-image.service';
import { BattleCardPipelineService } from './service/battle-card-pipeline.service';
import { BattleFinishedListener } from './listener/battle-finished.listener';
import { BattleRankingScheduler } from './scheduler/battle-ranking.scheduler';
import { BattleController } from './controller/battle.controller';
import { BattleGateway } from './gateway/battle.gateway';
import { UserModule } from '../user/user.module';
import { MarketModule } from '../market/market.module';
import { OrderModule } from '../order/order.module';
import { RankingModule } from '../ranking/ranking.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Battle, BattleSession]),
    forwardRef(() => UserModule),
    MarketModule,
    OrderModule,
    RankingModule,
  ],
  providers: [
    BattleRepository,
    BattleSessionRepository,
    InviteCodeRedisRepository,
    BattleService,
    BattleEndService,
    BattleOrderService,
    InviteService,
    BattleMatchingService,
    BattleCardImageService,
    BattleCardPipelineService,
    BattleFinishedListener,
    BattleRankingScheduler,
    BattleGateway,
  ],
  controllers: [BattleController],
  exports: [BattleSessionRepository, BattleEndService, BattleOrderService],
})
export class BattleModule {}
