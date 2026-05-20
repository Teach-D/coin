jest.mock('@nestjs/passport', () => ({
  PassportStrategy: (_strategy: any, _name?: string) => {
    return class {
      constructor(..._args: any[]) {}
    };
  },
}));

import { AuthProvider, User } from 'src/domain/user/entity/user.entity';
import { UserService } from 'src/domain/user/service/user.service';
import { GoogleStrategy } from 'src/domain/user/service/google.strategy';
import { ConfigService } from '@nestjs/config';

interface GoogleProfile {
  id: string | number;
  displayName: string;
  emails?: Array<{ value: string }>;
  photos?: Array<{ value: string }>;
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
    GOOGLE_CLIENT_ID: 'mock-google-client-id',
    GOOGLE_CLIENT_SECRET: 'mock-google-client-secret',
    GOOGLE_CALLBACK_URL: 'http://localhost:3000/oauth2/callback/google',
  };
  return {
    get: jest.fn().mockImplementation((key: string) => config[key] ?? ''),
    getOrThrow: jest.fn().mockImplementation((key: string) => {
      if (config[key] === undefined) throw new Error(`Config key "${key}" not found`);
      return config[key];
    }),
  } as any;
}

function makeGoogleProfile(overrides: Partial<GoogleProfile> = {}): GoogleProfile {
  return {
    id: 'google-sub-123456',
    displayName: 'Test User',
    emails: [{ value: 'testuser@gmail.com' }],
    photos: [{ value: 'https://lh3.googleusercontent.com/photo.jpg' }],
    ...overrides,
  };
}

function makeUser(overrides: Partial<User> = {}): User {
  const user = new User();
  user.id = 1;
  user.email = 'encrypted-email';
  user.nickname = 'Test User';
  user.provider = AuthProvider.GOOGLE;
  user.providerId = 'google-sub-123456';
  user.balance = 10_000_000;
  return Object.assign(user, overrides);
}

describe('GoogleStrategy', () => {
  describe('validate()', () => {
    it('신규_유저_findOrCreateSocialUser_호출_후_User_반환', async () => {
      const newUser = makeUser();
      const userService = makeUserServiceMock({
        findOrCreateSocialUser: jest.fn().mockResolvedValue(newUser),
      });
      const configService = makeConfigServiceMock();

      const strategy = new GoogleStrategy(userService as any, configService);
      const profile = makeGoogleProfile();
      const done = jest.fn();

      await strategy.validate('access-token', 'refresh-token', profile, done);

      expect(userService.findOrCreateSocialUser).toHaveBeenCalledTimes(1);
      expect(userService.findOrCreateSocialUser).toHaveBeenCalledWith(
        'testuser@gmail.com',
        'Test User',
        'https://lh3.googleusercontent.com/photo.jpg',
        AuthProvider.GOOGLE,
        'google-sub-123456',
      );
      expect(done).toHaveBeenCalledWith(null, newUser);
    });

    it('기존_유저_findOrCreateSocialUser_재사용하여_기존_User_반환', async () => {
      const existingUser = makeUser({ id: 42, nickname: 'ExistingUser' });
      const userService = makeUserServiceMock({
        findOrCreateSocialUser: jest.fn().mockResolvedValue(existingUser),
      });
      const configService = makeConfigServiceMock();

      const strategy = new GoogleStrategy(userService as any, configService);
      const profile = makeGoogleProfile({ id: 'google-sub-123456' });
      const done = jest.fn();

      await strategy.validate('access-token', 'refresh-token', profile, done);

      expect(userService.findOrCreateSocialUser).toHaveBeenCalledTimes(1);
      expect(done).toHaveBeenCalledWith(null, existingUser);
      expect((done.mock.calls[0][1] as User).id).toBe(42);
    });

    it('profile에서_email_displayName_id_올바르게_추출', async () => {
      const user = makeUser({ id: 7 });
      const userService = makeUserServiceMock({
        findOrCreateSocialUser: jest.fn().mockResolvedValue(user),
      });
      const configService = makeConfigServiceMock();

      const strategy = new GoogleStrategy(userService as any, configService);
      const profile = makeGoogleProfile({
        id: 'sub-unique-999',
        displayName: '홍길동',
        emails: [{ value: 'hong@gmail.com' }],
        photos: [{ value: 'https://photo.example.com/hong.jpg' }],
      });
      const done = jest.fn();

      await strategy.validate('access-token', 'refresh-token', profile, done);

      expect(userService.findOrCreateSocialUser).toHaveBeenCalledWith(
        'hong@gmail.com',
        '홍길동',
        'https://photo.example.com/hong.jpg',
        AuthProvider.GOOGLE,
        'sub-unique-999',
      );
    });

    it('photos_없는_profile_profileImageUrl_null로_처리', async () => {
      const user = makeUser();
      const userService = makeUserServiceMock({
        findOrCreateSocialUser: jest.fn().mockResolvedValue(user),
      });
      const configService = makeConfigServiceMock();

      const strategy = new GoogleStrategy(userService as any, configService);
      const profile = makeGoogleProfile({ photos: [] });
      const done = jest.fn();

      await strategy.validate('access-token', 'refresh-token', profile, done);

      expect(userService.findOrCreateSocialUser).toHaveBeenCalledWith(
        'testuser@gmail.com',
        'Test User',
        null,
        AuthProvider.GOOGLE,
        'google-sub-123456',
      );
    });

    it('findOrCreateSocialUser_예외_발생시_done에_에러_전달', async () => {
      const serviceError = new Error('DB 연결 실패');
      const userService = makeUserServiceMock({
        findOrCreateSocialUser: jest.fn().mockRejectedValue(serviceError),
      });
      const configService = makeConfigServiceMock();

      const strategy = new GoogleStrategy(userService as any, configService);
      const profile = makeGoogleProfile();
      const done = jest.fn();

      await strategy.validate('access-token', 'refresh-token', profile, done);

      expect(done).toHaveBeenCalledWith(serviceError);
      expect(done.mock.calls[0][1]).toBeUndefined();
    });
  });
});
