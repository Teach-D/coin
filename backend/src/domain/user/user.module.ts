import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { User } from './entity/user.entity';
import { UserRepository } from './repository/user.repository';
import { UserService } from './service/user.service';
import { JwtStrategy } from './service/jwt.strategy';
import { AuthController } from './controller/auth.controller';
import { JwtProvider } from '../../common/util/jwt-provider';
import { AesEncryptor } from '../../common/util/aes-encryptor';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    PassportModule,
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
  ],
  providers: [UserRepository, UserService, JwtStrategy, JwtProvider, AesEncryptor],
  controllers: [AuthController],
  exports: [UserRepository, UserService, JwtProvider, AesEncryptor, JwtModule, PassportModule],
})
export class UserModule {}
