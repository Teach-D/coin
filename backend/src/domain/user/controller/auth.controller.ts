import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { JwtAuthGuard } from '../../../common/guard/jwt-auth.guard';
import { ApiResponse } from '../../../common/dto/api-response.dto';
import { UserService } from '../service/user.service';
import { AccountDeletionService } from '../service/account-deletion.service';
import { UpdateProfileRequest, RefreshTokenRequest } from '../dto/update-profile-request.dto';
import { AuthenticatedUser } from '../service/jwt.strategy';

@Controller('api')
export class AuthController {
  constructor(
    private readonly userService: UserService,
    private readonly accountDeletionService: AccountDeletionService,
  ) {}

  @Post('auth/refresh')
  async refreshToken(@Body() body: RefreshTokenRequest) {
    const result = await this.userService.refreshAccessToken(body.refreshToken);
    return ApiResponse.ok(result);
  }

  @Get('users/me')
  @UseGuards(JwtAuthGuard)
  async getProfile(@Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    const result = await this.userService.getProfile(user.userId);
    return ApiResponse.ok(result);
  }

  @Patch('users/me/nickname')
  @UseGuards(JwtAuthGuard)
  async updateNickname(@Req() req: Request, @Body() body: UpdateProfileRequest) {
    const user = req.user as AuthenticatedUser;
    const result = await this.userService.updateNickname(user.userId, body.nickname);
    return ApiResponse.ok(result);
  }

  @Get('users/me/stats')
  @UseGuards(JwtAuthGuard)
  async getUserStats(@Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    const result = await this.userService.getUserStats(user.userId);
    return ApiResponse.ok(result);
  }

  @Delete('users/me')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  async withdraw(@Req() req: Request): Promise<void> {
    const user = req.user as AuthenticatedUser;
    await this.accountDeletionService.withdraw(user.userId);
  }
}
