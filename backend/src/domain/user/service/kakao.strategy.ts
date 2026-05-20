import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Strategy as KakaoPassportStrategy } from 'passport-kakao';
import { UserService } from './user.service';
import { AuthProvider, User } from '../entity/user.entity';

@Injectable()
export class KakaoStrategy extends PassportStrategy(KakaoPassportStrategy, 'kakao') {
  constructor(
    private readonly userService: UserService,
    private readonly configService: ConfigService,
  ) {
    super({
      clientID: configService.getOrThrow<string>('KAKAO_CLIENT_ID'),
      clientSecret: configService.get<string>('KAKAO_CLIENT_SECRET'),
      callbackURL: configService.getOrThrow<string>('KAKAO_CALLBACK_URL'),
    });
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: any,
  ): Promise<User> {
    const kakaoAccount = profile._json?.kakao_account ?? {};
    const properties = profile._json?.properties ?? {};
    const email: string | null = kakaoAccount.email ?? null;
    const nickname: string = properties.nickname ?? profile.displayName ?? '';
    const profileImageUrl: string | null = properties.profile_image ?? null;
    const providerId: string = String(profile.id);
    return this.userService.findOrCreateSocialUser(email, nickname, profileImageUrl, AuthProvider.KAKAO, providerId);
  }
}
