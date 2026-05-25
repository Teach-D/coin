import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UserRepository } from '../repository/user.repository';

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
  constructor(
    configService: ConfigService,
    private readonly userRepository: UserRepository,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: Buffer.from(configService.get<string>('JWT_SECRET', ''), 'base64'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const userId = parseInt(payload.sub, 10);
    const user = await this.userRepository.findActiveById(userId);
    if (!user) throw new UnauthorizedException();
    return { userId, role: payload.role };
  }
}
