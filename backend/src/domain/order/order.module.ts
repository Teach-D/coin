import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from './entity/order.entity';
import { Position } from './entity/position.entity';
import { OrderRepository } from './repository/order.repository';
import { PositionRepository } from './repository/position.repository';
import { OrderService } from './service/order.service';
import { FundingRateService } from './service/funding-rate.service';
import { LiquidationService } from './service/liquidation.service';
import { OrderFilledListener } from './listener/order-filled.listener';
import { OrderController } from './controller/order.controller';
import { UserModule } from '../user/user.module';
import { MarketModule } from '../market/market.module';
import { RankingModule } from '../ranking/ranking.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, Position]),
    forwardRef(() => UserModule),
    MarketModule,
    RankingModule,
  ],
  providers: [
    OrderRepository,
    PositionRepository,
    OrderService,
    FundingRateService,
    LiquidationService,
    OrderFilledListener,
  ],
  controllers: [OrderController],
  exports: [OrderService, OrderRepository, PositionRepository],
})
export class OrderModule {}
