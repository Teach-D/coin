import { Controller, Get, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { GoogleAuthGuard } from '../guard/google-auth.guard';
import { KakaoAuthGuard } from '../guard/kakao-auth.guard';
import { UserService } from '../service/user.service';
import { User } from '../entity/user.entity';

@Controller('oauth2')
export class OAuth2Controller {
  constructor(
    private readonly userService: UserService,
    private readonly configService: ConfigService,
  ) {}

  @Get('authorization/google')
  @UseGuards(GoogleAuthGuard)
  googleAuthorize(): void {}

  @Get('authorization/kakao')
  @UseGuards(KakaoAuthGuard)
  kakaoAuthorize(): void {}

  @Get('callback/google')
  @UseGuards(GoogleAuthGuard)
  googleCallback(@Req() req: Request, @Res() res: Response): void {
    if (res.headersSent) return;
    const user = req.user as User | undefined;
    if (!user) {
      res.redirect('http://localhost:5173/login?error=oauth_failed');
      return;
    }
    const tokens = this.userService.issueTokens(user);
    const redirectUri = this.configService.get<string>('OAUTH2_REDIRECT_URI', 'http://localhost:5173/login');
    res.redirect(`${redirectUri}?accessToken=${tokens.accessToken}&refreshToken=${tokens.refreshToken}`);
  }

  @Get('callback/kakao')
  @UseGuards(KakaoAuthGuard)
  kakaoCallback(@Req() req: Request, @Res() res: Response): void {
    if (res.headersSent) return;
    const user = req.user as User | undefined;
    if (!user) {
      res.redirect('http://localhost:5173/login?error=oauth_failed');
      return;
    }
    const tokens = this.userService.issueTokens(user);
    const redirectUri = this.configService.get<string>('OAUTH2_REDIRECT_URI', 'http://localhost:5173/login');
    res.redirect(`${redirectUri}?accessToken=${tokens.accessToken}&refreshToken=${tokens.refreshToken}`);
  }

  private isAllowedRedirectUri(uri: string): boolean {
    const allowed = [
      this.configService.get<string>('OAUTH2_REDIRECT_URI'),
      'http://localhost:5173/oauth2/callback',
      'http://localhost:3000/oauth2/callback',
    ].filter(Boolean) as string[];
    return allowed.some(
      (origin) => uri === origin || uri.startsWith(origin + '?') || uri.startsWith(origin + '#'),
    );
  }
}
