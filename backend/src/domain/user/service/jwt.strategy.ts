import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

export interface JwtPayload {
  sub: string;
  role: string;
  type: string;
}

export interface AuthenticatedUser {
  userId: number;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: Buffer.from(configService.get<string>('JWT_SECRET', ''), 'base64'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    return { userId: parseInt(payload.sub, 10), role: payload.role };
  }
}
