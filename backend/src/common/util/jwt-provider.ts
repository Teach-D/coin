import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { CoinBattleException } from '../exception/coin-battle.exception';
import { ErrorCode } from '../exception/error-code.enum';

@Injectable()
export class JwtProvider {
  private readonly accessExpirationMs: number;
  private readonly refreshExpirationMs: number;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.accessExpirationMs = configService.get<number>('JWT_ACCESS_EXPIRATION_MS', 3600000);
    this.refreshExpirationMs = configService.get<number>('JWT_REFRESH_EXPIRATION_MS', 604800000);
  }

  generateAccessToken(userId: number, role: string): string {
    return this.jwtService.sign(
      { sub: userId.toString(), role, type: 'access' },
      { expiresIn: Math.floor(this.accessExpirationMs / 1000) },
    );
  }

  generateRefreshToken(userId: number): string {
    return this.jwtService.sign(
      { sub: userId.toString(), type: 'refresh' },
      { expiresIn: Math.floor(this.refreshExpirationMs / 1000) },
    );
  }

  getUserId(token: string): number {
    const payload = this.getClaims(token);
    return parseInt(payload.sub, 10);
  }

  validate(token: string): boolean {
    try {
      this.getClaims(token);
      return true;
    } catch (e: any) {
      if (e.name === 'TokenExpiredError') {
        throw new CoinBattleException(ErrorCode.EXPIRED_TOKEN);
      }
      throw new CoinBattleException(ErrorCode.INVALID_TOKEN);
    }
  }

  getClaims(token: string): any {
    try {
      return this.jwtService.verify(token);
    } catch (e: any) {
      if (e.name === 'TokenExpiredError') {
        throw new CoinBattleException(ErrorCode.EXPIRED_TOKEN);
      }
      throw new CoinBattleException(ErrorCode.INVALID_TOKEN);
    }
  }
}
