import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CoinBattleException } from '../exception/coin-battle.exception';
import { ErrorCode } from '../exception/error-code.enum';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(err: any, user: any, info: any) {
    if (err || !user) {
      if (info?.name === 'TokenExpiredError') {
        throw new CoinBattleException(ErrorCode.EXPIRED_TOKEN);
      }
      throw new CoinBattleException(ErrorCode.INVALID_TOKEN);
    }
    return user;
  }
}
