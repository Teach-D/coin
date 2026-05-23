jest.mock('@nestjs/passport', () => ({
  PassportStrategy: (_strategy: any, _name?: string) => {
    return class {
      constructor(..._args: any[]) {}
    };
  },
}));

import { AuthProvider, User } from 'src/domain/user/entity/user.entity';
import { UserService } from 'src/domain/user/service/user.service';
import { KakaoStrategy } from 'src/domain/user/service/kakao.strategy';
import { ConfigService } from '@nestjs/config';

interface KakaoProfile {
  id: string | number;
  displayName?: string;
  _json?: {
    kakao_account?: {
      email?: string;
    };
    properties?: {
      nickname?: string;
      profile_image?: string;
    };
  };
}

function makeUserServiceMock(overrides: Partial<{
  findOrCreateSocialUser: jest.Mock;
}> = {}): jest.Mocked<Pick<UserService, 'findOrCreateSocialUser' | 'issueTokens'>> {
  return {
    findOrCreateSocialUser: jest.fn(),
    issueTokens: jest.fn(),
    ...overrides,
  } as any;
}

function makeConfigServiceMock(): jest.Mocked<ConfigService> {
  const config: Record<string, string> = {
    KAKAO_CLIENT_ID: 'mock-kakao-client-id',
    KAKAO_CLIENT_SECRET: 'mock-kakao-client-secret',
    KAKAO_CALLBACK_URL: 'http://localhost:3000/oauth2/callback/kakao',
  };
  return {
    get: jest.fn().mockImplementation((key: string) => config[key] ?? ''),
    getOrThrow: jest.fn().mockImplementation((key: string) => {
      if (config[key] === undefined) throw new Error(`Config key "${key}" not found`);
      return config[key];
    }),
  } as any;
}

function makeKakaoProfile(overrides: Partial<KakaoProfile> = {}): KakaoProfile {
  return {
    id: '987654321',
    displayName: '카카오유저',
    _json: {
      kakao_account: {
        email: 'kakaouser@kakao.com',
      },
      properties: {
        nickname: '카카오유저',
        profile_image: 'https://k.kakaocdn.net/profile.jpg',
      },
    },
    ...overrides,
  };
}

function makeUser(overrides: Partial<User> = {}): User {
  const user = new User();
  user.id = 1;
  user.email = 'encrypted-email';
  user.nickname = '카카오유저';
  user.provider = AuthProvider.KAKAO;
  user.providerId = '987654321';
  user.balance = 10_000_000;
  return Object.assign(user, overrides);
}

describe('KakaoStrategy', () => {
  describe('validate()', () => {
    it('신규_유저_findOrCreateSocialUser_호출_후_User_반환', async () => {
      const newUser = makeUser();
      const userService = makeUserServiceMock({
        findOrCreateSocialUser: jest.fn().mockResolvedValue(newUser),
      });
      const configService = makeConfigServiceMock();

      const strategy = new KakaoStrategy(userService as any, configService);
      const profile = makeKakaoProfile();

      const result = await strategy.validate('access-token', 'refresh-token', profile);

      expect(userService.findOrCreateSocialUser).toHaveBeenCalledTimes(1);
      expect(userService.findOrCreateSocialUser).toHaveBeenCalledWith(
        'kakaouser@kakao.com',
        '카카오유저',
        'https://k.kakaocdn.net/profile.jpg',
        AuthProvider.KAKAO,
        '987654321',
      );
      expect(result).toBe(newUser);
    });

    it('기존_유저_findOrCreateSocialUser_재사용하여_기존_User_반환', async () => {
      const existingUser = makeUser({ id: 55, nickname: '기존카카오유저' });
      const userService = makeUserServiceMock({
        findOrCreateSocialUser: jest.fn().mockResolvedValue(existingUser),
      });
      const configService = makeConfigServiceMock();

      const strategy = new KakaoStrategy(userService as any, configService);
      const profile = makeKakaoProfile({ id: '987654321' });

      const result = await strategy.validate('access-token', 'refresh-token', profile);

      expect(userService.findOrCreateSocialUser).toHaveBeenCalledTimes(1);
      expect((result as User).id).toBe(55);
    });

    it('Kakao_profile_구조에서_id_email_nickname_올바르게_파싱', async () => {
      const user = makeUser({ id: 3 });
      const userService = makeUserServiceMock({
        findOrCreateSocialUser: jest.fn().mockResolvedValue(user),
      });
      const configService = makeConfigServiceMock();

      const strategy = new KakaoStrategy(userService as any, configService);
      const profile = makeKakaoProfile({
        id: '111222333',
        _json: {
          kakao_account: { email: 'specific@kakao.com' },
          properties: {
            nickname: '특정닉네임',
            profile_image: 'https://k.kakaocdn.net/specific.jpg',
          },
        },
      });

      await strategy.validate('access-token', 'refresh-token', profile);

      expect(userService.findOrCreateSocialUser).toHaveBeenCalledWith(
        'specific@kakao.com',
        '특정닉네임',
        'https://k.kakaocdn.net/specific.jpg',
        AuthProvider.KAKAO,
        '111222333',
      );
    });

    it('kakao_account_email_없는_경우_null로_처리', async () => {
      const user = makeUser();
      const userService = makeUserServiceMock({
        findOrCreateSocialUser: jest.fn().mockResolvedValue(user),
      });
      const configService = makeConfigServiceMock();

      const strategy = new KakaoStrategy(userService as any, configService);
      const profile = makeKakaoProfile({
        _json: {
          kakao_account: {},
          properties: {
            nickname: '이메일없는유저',
            profile_image: 'https://k.kakaocdn.net/noemail.jpg',
          },
        },
      });

      await strategy.validate('access-token', 'refresh-token', profile);

      const calledEmail = (userService.findOrCreateSocialUser as jest.Mock).mock.calls[0][0];
      expect(calledEmail === '' || calledEmail === null || calledEmail === undefined).toBe(true);
    });

    it('properties_profile_image_없는_경우_profileImageUrl_null로_처리', async () => {
      const user = makeUser();
      const userService = makeUserServiceMock({
        findOrCreateSocialUser: jest.fn().mockResolvedValue(user),
      });
      const configService = makeConfigServiceMock();

      const strategy = new KakaoStrategy(userService as any, configService);
      const profile = makeKakaoProfile({
        _json: {
          kakao_account: { email: 'nophoto@kakao.com' },
          properties: { nickname: '사진없는유저' },
        },
      });

      await strategy.validate('access-token', 'refresh-token', profile);

      expect(userService.findOrCreateSocialUser).toHaveBeenCalledWith(
        'nophoto@kakao.com',
        '사진없는유저',
        null,
        AuthProvider.KAKAO,
        '987654321',
      );
    });

    it('profile_id가_숫자_타입인_경우_문자열로_변환하여_처리', async () => {
      const user = makeUser();
      const userService = makeUserServiceMock({
        findOrCreateSocialUser: jest.fn().mockResolvedValue(user),
      });
      const configService = makeConfigServiceMock();

      const strategy = new KakaoStrategy(userService as any, configService);
      const profile = makeKakaoProfile({ id: 777888999 });

      await strategy.validate('access-token', 'refresh-token', profile);

      const calledProviderId = (userService.findOrCreateSocialUser as jest.Mock).mock.calls[0][4];
      expect(typeof calledProviderId).toBe('string');
      expect(calledProviderId).toBe('777888999');
    });

    it('findOrCreateSocialUser_예외_발생시_Promise_reject', async () => {
      const serviceError = new Error('DB 저장 실패');
      const userService = makeUserServiceMock({
        findOrCreateSocialUser: jest.fn().mockRejectedValue(serviceError),
      });
      const configService = makeConfigServiceMock();

      const strategy = new KakaoStrategy(userService as any, configService);
      const profile = makeKakaoProfile();

      await expect(strategy.validate('access-token', 'refresh-token', profile)).rejects.toThrow('DB 저장 실패');
    });
  });
});
