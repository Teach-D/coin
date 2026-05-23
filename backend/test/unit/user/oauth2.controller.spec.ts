// OAuth2Controller.googleCallback: redirect URL에 nickname 쿼리 파라미터 포함 검증
// 현재 구현에는 nickname 파라미터가 없으므로 이 테스트는 Red(실패) 상태입니다
import { OAuth2Controller } from 'src/domain/user/controller/oauth2.controller';
import { UserService } from 'src/domain/user/service/user.service';
import { ConfigService } from '@nestjs/config';
import { AuthProvider, User, UserRole } from 'src/domain/user/entity/user.entity';
import { Request, Response } from 'express';

function makeUser(overrides: Partial<User> = {}): User {
  const user = new User();
  user.id = overrides.id ?? 1;
  user.nickname = overrides.nickname ?? '홍길동';
  user.email = overrides.email ?? 'test@gmail.com';
  user.provider = overrides.provider ?? AuthProvider.GOOGLE;
  user.providerId = overrides.providerId ?? 'google-sub-123';
  user.role = overrides.role ?? UserRole.ROLE_USER;
  user.balance = overrides.balance ?? 10_000_000;
  return user;
}

function makeUserServiceMock(overrides: Partial<{
  issueTokens: jest.Mock;
}> = {}): jest.Mocked<Pick<UserService, 'issueTokens'>> {
  return {
    issueTokens: jest.fn().mockReturnValue({
      accessToken: 'mock-access-token',
      refreshToken: 'mock-refresh-token',
    }),
    ...overrides,
  } as any;
}

function makeConfigServiceMock(redirectUri = 'http://localhost:5173/oauth2/callback'): jest.Mocked<ConfigService> {
  return {
    get: jest.fn().mockImplementation((key: string, defaultValue?: string) => {
      if (key === 'OAUTH2_REDIRECT_URI') return redirectUri;
      return defaultValue ?? '';
    }),
  } as any;
}

function makeRequest(user: User | undefined): Request {
  return { user } as any;
}

function makeResponse(): { redirect: jest.Mock } & Response {
  const res = {
    headersSent: false,
    redirect: jest.fn(),
  };
  return res as any;
}

describe('OAuth2Controller', () => {
  describe('googleCallback()', () => {
    it('성공_시_redirect_URL에_nickname_쿼리_파라미터가_포함되어야_함', () => {
      const user = makeUser({ nickname: 'testUser' });
      const userService = makeUserServiceMock();
      const configService = makeConfigServiceMock();

      const controller = new OAuth2Controller(userService as any, configService);
      const req = makeRequest(user);
      const res = makeResponse();

      controller.googleCallback(req, res as Response);

      expect(res.redirect).toHaveBeenCalledTimes(1);
      const redirectUrl: string = res.redirect.mock.calls[0][0];
      const url = new URL(redirectUrl);
      expect(url.searchParams.has('nickname')).toBe(true);
    });

    it('nickname이_URL_인코딩되어_포함되어야_함_한글_닉네임_케이스', () => {
      const koreanNickname = '홍길동';
      const user = makeUser({ nickname: koreanNickname });
      const userService = makeUserServiceMock();
      const configService = makeConfigServiceMock();

      const controller = new OAuth2Controller(userService as any, configService);
      const req = makeRequest(user);
      const res = makeResponse();

      controller.googleCallback(req, res as Response);

      expect(res.redirect).toHaveBeenCalledTimes(1);
      const redirectUrl: string = res.redirect.mock.calls[0][0];
      const url = new URL(redirectUrl);
      expect(url.searchParams.get('nickname')).toBe(koreanNickname);
    });

    it('user가_없으면_error_oauth_failed_포함한_URL로_redirect', () => {
      const userService = makeUserServiceMock();
      const configService = makeConfigServiceMock();

      const controller = new OAuth2Controller(userService as any, configService);
      const req = makeRequest(undefined);
      const res = makeResponse();

      controller.googleCallback(req, res as Response);

      expect(res.redirect).toHaveBeenCalledTimes(1);
      const redirectUrl: string = res.redirect.mock.calls[0][0];
      expect(redirectUrl).toContain('error=oauth_failed');
    });

    it('성공_시_accessToken과_refreshToken도_redirect_URL에_포함되어야_함', () => {
      const user = makeUser();
      const userService = makeUserServiceMock({
        issueTokens: jest.fn().mockReturnValue({
          accessToken: 'expected-access-token',
          refreshToken: 'expected-refresh-token',
        }),
      });
      const configService = makeConfigServiceMock();

      const controller = new OAuth2Controller(userService as any, configService);
      const req = makeRequest(user);
      const res = makeResponse();

      controller.googleCallback(req, res as Response);

      const redirectUrl: string = res.redirect.mock.calls[0][0];
      const url = new URL(redirectUrl);
      expect(url.searchParams.get('accessToken')).toBe('expected-access-token');
      expect(url.searchParams.get('refreshToken')).toBe('expected-refresh-token');
    });
  });
});
