import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { UserModule } from './domain/user/user.module';
import { MarketModule } from './domain/market/market.module';
import { OrderModule } from './domain/order/order.module';
import { BattleModule } from './domain/battle/battle.module';
import { RankingModule } from './domain/ranking/ranking.module';
import { RedisService } from './common/config/redis.config';
import { User } from './domain/user/entity/user.entity';
import { Order } from './domain/order/entity/order.entity';
import { Position } from './domain/order/entity/position.entity';
import { Battle } from './domain/battle/entity/battle.entity';
import { BattleSession } from './domain/battle/entity/battle-session.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('DB_HOST', 'localhost'),
        port: configService.get<number>('DB_PORT', 5432),
        username: configService.get('DB_USERNAME', 'coinbattle'),
        password: configService.get('DB_PASSWORD', 'coinbattle'),
        database: configService.get('DB_NAME', 'coinbattle'),
        entities: [User, Order, Position, Battle, BattleSession],
        synchronize: false,
        logging: configService.get('NODE_ENV') === 'local',
      }),
    }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    UserModule,
    MarketModule,
    OrderModule,
    BattleModule,
    RankingModule,
  ],
  providers: [RedisService],
  exports: [RedisService],
})
export class AppModule {}
