import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../../../common/guard/jwt-auth.guard';
import { ApiResponse } from '../../../common/dto/api-response.dto';
import { RankingService } from '../service/ranking.service';
import { AuthenticatedUser } from '../../user/service/jwt.strategy';


@Controller('api/rankings')
export class RankingController {
  constructor(private readonly rankingService: RankingService) {}

  @Get('season')
  async getSeasonRanking(@Query('limit') limit: string = '100') {
    const result = await this.rankingService.getSeasonRankings(parseInt(limit, 10));
    return ApiResponse.ok(result);
  }

  @Get('pvp')
  async getPvpRanking(@Query('limit') limit: string = '100') {
    const result = await this.rankingService.getTopPvpRankings(parseInt(limit, 10));
    return ApiResponse.ok(result);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMyRanking(@Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    const result = await this.rankingService.getMyRanking(user.userId);
    return ApiResponse.ok(result);
  }
}
