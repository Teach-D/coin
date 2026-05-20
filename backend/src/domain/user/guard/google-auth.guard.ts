import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express';

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  handleRequest<TUser>(err: Error | null, user: TUser, _info: unknown, context: ExecutionContext): TUser {
    if (err || !user) {
      const res = context.switchToHttp().getResponse<Response>();
      res.redirect('http://localhost:5173/login?error=oauth_failed');
      return null as TUser;
    }
    return user;
  }
}
