import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express';

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  handleRequest<TUser>(err: Error | null, user: TUser, _info: unknown, context: ExecutionContext): TUser {
    if (err || !user) {
      const res = context.switchToHttp().getResponse<Response>();
      res.redirect('/login?error=oauth_failed');
      throw new UnauthorizedException('OAuth authentication failed');
    }
    return user;
  }
}
