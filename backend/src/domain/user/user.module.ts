import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { User } from './entity/user.entity';
import { UserRepository } from './repository/user.repository';
import { UserService } from './service/user.service';
import { AccountDeletionService } from './service/account-deletion.service';
import { AccountPurgeScheduler } from './service/account-purge.scheduler';
import { UserWithdrawnListener } from './listener/user-withdrawn.listener';
import { JwtStrategy } from './service/jwt.strategy';
import { GoogleStrategy } from './service/google.strategy';
import { KakaoStrategy } from './service/kakao.strategy';
import { AuthController } from './controller/auth.controller';
import { OAuth2Controller } from './controller/oauth2.controller';
import { JwtProvider } from '../../common/util/jwt-provider';
import { AesEncryptor } from '../../common/util/aes-encryptor';
import { BattleModule } from '../battle/battle.module';
import { OrderModule } from '../order/order.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    PassportModule,
    ConfigModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: Buffer.from(configService.get<string>('JWT_SECRET', ''), 'base64'),
        signOptions: {
          expiresIn: Math.floor(
            configService.get<number>('JWT_ACCESS_EXPIRATION_MS', 3600000) / 1000,
          ),
        },
      }),
    }),
    forwardRef(() => BattleModule),
    forwardRef(() => OrderModule),
  ],
  providers: [
    UserRepository,
    UserService,
    AccountDeletionService,
    AccountPurgeScheduler,
    UserWithdrawnListener,
    JwtStrategy,
    GoogleStrategy,
    KakaoStrategy,
    JwtProvider,
    AesEncryptor,
  ],
  controllers: [AuthController, OAuth2Controller],
  exports: [UserRepository, UserService, JwtProvider, AesEncryptor, JwtModule, PassportModule],
})
export class UserModule {}
