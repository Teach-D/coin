import { Injectable } from '@nestjs/common';
import { CoinBattleException } from '../../../common/exception/coin-battle.exception';
import { ErrorCode } from '../../../common/exception/error-code.enum';
import { JwtProvider } from '../../../common/util/jwt-provider';
import { AesEncryptor } from '../../../common/util/aes-encryptor';
import { UserRepository } from '../repository/user.repository';
import { BattleSessionRepository } from '../../battle/repository/battle-session.repository';
import { AuthProvider, User, UserRole } from '../entity/user.entity';
import { TokenResponse, AccessTokenResponse } from '../dto/token-response.dto';
import { UserProfileResponse, UserStatsResponse } from '../dto/user-profile-response.dto';

@Injectable()
export class UserService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly battleSessionRepository: BattleSessionRepository,
    private readonly jwtProvider: JwtProvider,
    private readonly aesEncryptor: AesEncryptor,
  ) {}

  async findOrCreateSocialUser(
    email: string,
    nickname: string,
    profileImageUrl: string | null,
    provider: AuthProvider,
    providerId: string,
  ): Promise<User> {
    const existing = await this.userRepository.findByProviderAndProviderId(provider, providerId);
    if (existing) return existing;

    const user = new User();
    user.email = this.aesEncryptor.encrypt(email);
    user.nickname = await this.generateUniqueNickname(nickname);
    user.profileImageUrl = profileImageUrl;
    user.provider = provider;
    user.providerId = providerId;
    user.role = UserRole.ROLE_USER;
    user.balance = 10_000_000;

    return this.userRepository.save(user);
  }

  issueTokens(user: User): TokenResponse {
    return {
      accessToken: this.jwtProvider.generateAccessToken(user.id, user.role),
      refreshToken: this.jwtProvider.generateRefreshToken(user.id),
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<AccessTokenResponse> {
    this.jwtProvider.validate(refreshToken);
    const userId = this.jwtProvider.getUserId(refreshToken);
    const user = await this.userRepository.findById(userId);
    if (!user) throw new CoinBattleException(ErrorCode.USER_NOT_FOUND);
    return { accessToken: this.jwtProvider.generateAccessToken(user.id, user.role) };
  }

  async getProfile(userId: number): Promise<UserProfileResponse> {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new CoinBattleException(ErrorCode.USER_NOT_FOUND);
    return {
      userId: user.id,
      nickname: user.nickname,
      profileImageUrl: user.profileImageUrl,
      email: this.aesEncryptor.decrypt(user.email),
    };
  }

  async updateNickname(userId: number, nickname: string): Promise<UserProfileResponse> {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new CoinBattleException(ErrorCode.USER_NOT_FOUND);

    if (user.nickname !== nickname && (await this.userRepository.existsByNickname(nickname))) {
      throw new CoinBattleException(ErrorCode.DUPLICATE_NICKNAME);
    }
    user.nickname = nickname;
    await this.userRepository.save(user);
    return {
      userId: user.id,
      nickname: user.nickname,
      profileImageUrl: user.profileImageUrl,
      email: this.aesEncryptor.decrypt(user.email),
    };
  }

  async getUserStats(userId: number): Promise<UserStatsResponse> {
    const wins = await this.battleSessionRepository.countWins(userId);
    const losses = await this.battleSessionRepository.countLosses(userId);
    const draws = await this.battleSessionRepository.countDraws(userId);
    const total = wins + losses + draws;
    const bestReturnRate = await this.battleSessionRepository.findBestReturnRate(userId);
    return {
      wins,
      losses,
      draws,
      totalGames: total,
      winRate: total > 0 ? (wins / total) * 100 : null,
      bestReturnRate: bestReturnRate ?? null,
    };
  }

  private async generateUniqueNickname(base: string): Promise<string> {
    let nickname = base;
    let suffix = 1;
    while (await this.userRepository.existsByNickname(nickname)) {
      nickname = `${base}_${suffix++}`;
    }
    return nickname;
  }
}
