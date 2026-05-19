import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Strategy as GooglePassportStrategy } from 'passport-google-oauth20';
import { UserService } from './user.service';
import { AuthProvider } from '../entity/user.entity';

@Injectable()
export class GoogleStrategy extends PassportStrategy(GooglePassportStrategy, 'google') {
  constructor(
    private readonly userService: UserService,
    private readonly configService: ConfigService,
  ) {
    super({
      clientID: configService.getOrThrow<string>('GOOGLE_CLIENT_ID'),
      clientSecret: configService.getOrThrow<string>('GOOGLE_CLIENT_SECRET'),
      callbackURL: configService.getOrThrow<string>('GOOGLE_CALLBACK_URL'),
      scope: ['email', 'profile'],
    });
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: any,
    done: (err: Error | null, user?: any) => void,
  ): Promise<void> {
    try {
      const email: string | null = profile.emails?.[0]?.value ?? null;
      const nickname: string = profile.displayName ?? '';
      const profileImageUrl: string | null = profile.photos?.[0]?.value ?? null;
      const providerId: string = String(profile.id);

      const user = await this.userService.findOrCreateSocialUser(
        email,
        nickname,
        profileImageUrl,
        AuthProvider.GOOGLE,
        providerId,
      );
      done(null, user);
    } catch (err) {
      done(err as Error);
    }
  }
}
