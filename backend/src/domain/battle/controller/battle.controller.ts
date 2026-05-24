import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../../../common/guard/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../../../common/guard/optional-jwt-auth.guard';
import { ApiResponse } from '../../../common/dto/api-response.dto';
import { BattleService } from '../service/battle.service';
import { BattleEndService } from '../service/battle-end.service';
import { InviteService } from '../service/invite.service';
import { BattleMatchingService } from '../service/battle-matching.service';
import { BattleOrderService } from '../service/battle-order.service';
import { CreateBattleRequest, MatchBattleRequest } from '../dto/battle-request.dto';
import { BuyOrderRequest, SellOrderRequest } from '../../order/dto/order-request.dto';
import { BattleStatus } from '../entity/battle.entity';
import { AuthenticatedUser } from '../../user/service/jwt.strategy';

@Controller('api/battles')
export class BattleController {
  constructor(
    private readonly battleService: BattleService,
    private readonly battleEndService: BattleEndService,
    private readonly inviteService: InviteService,
    private readonly battleMatchingService: BattleMatchingService,
    private readonly battleOrderService: BattleOrderService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async createBattle(@Req() req: Request, @Body() body: CreateBattleRequest) {
    const user = req.user as AuthenticatedUser;
    const result = await this.battleService.createBattle(user.userId, body);
    return ApiResponse.ok(result);
  }

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  async getBattleList(
    @Req() req: Request,
    @Query('status') status: string = 'WAITING',
    @Query('page') page: string = '0',
    @Query('size') size: string = '20',
  ) {
    const user = req.user as AuthenticatedUser | null;
    const battleStatus = (BattleStatus as any)[status] ?? BattleStatus.WAITING;
    const result = await this.battleService.getBattleList(
      battleStatus,
      parseInt(page, 10),
      parseInt(size, 10),
      user?.userId,
    );
    return ApiResponse.ok(result);
  }

  @Get(':battleId')
  @UseGuards(JwtAuthGuard)
  async getBattle(@Req() req: Request, @Param('battleId') battleId: string) {
    const user = req.user as AuthenticatedUser;
    const result = await this.battleService.getBattle(battleId, user.userId);
    return ApiResponse.ok(result);
  }

  @Delete(':battleId')
  @UseGuards(JwtAuthGuard)
  async deleteBattle(@Req() req: Request, @Param('battleId') battleId: string) {
    const user = req.user as AuthenticatedUser;
    await this.battleService.deleteBattle(user.userId, battleId);
    return ApiResponse.ok(null);
  }

  @Post(':battleId/join')
  @UseGuards(JwtAuthGuard)
  async joinBattle(@Req() req: Request, @Param('battleId') battleId: string) {
    const user = req.user as AuthenticatedUser;
    const result = await this.battleService.joinBattle(user.userId, battleId);
    return ApiResponse.ok(result);
  }

  @Get(':battleId/result')
  @UseGuards(JwtAuthGuard)
  async getBattleResult(@Req() req: Request, @Param('battleId') battleId: string) {
    const user = req.user as AuthenticatedUser;
    const result = await this.battleEndService.getBattleResult(battleId, user.userId);
    return ApiResponse.ok(result);
  }

  @Post(':battleId/invite')
  @UseGuards(JwtAuthGuard)
  async generateInviteCode(@Req() req: Request, @Param('battleId') battleId: string) {
    const user = req.user as AuthenticatedUser;
    const result = await this.inviteService.generateInviteCode(battleId, user.userId);
    return ApiResponse.ok(result);
  }

  @Post('invite/:code/join')
  @UseGuards(JwtAuthGuard)
  async joinByInvite(@Req() req: Request, @Param('code') code: string) {
    const user = req.user as AuthenticatedUser;
    const result = await this.inviteService.joinByInvite(code, user.userId);
    return ApiResponse.ok(result);
  }

  @Post(':battleId/buy')
  @UseGuards(JwtAuthGuard)
  async battleBuy(
    @Req() req: Request,
    @Param('battleId') battleId: string,
    @Body() body: BuyOrderRequest,
  ) {
    const user = req.user as AuthenticatedUser;
    const result = await this.battleOrderService.battleBuy(user.userId, battleId, body);
    return ApiResponse.ok(result);
  }

  @Post(':battleId/sell')
  @UseGuards(JwtAuthGuard)
  async battleSell(
    @Req() req: Request,
    @Param('battleId') battleId: string,
    @Body() body: SellOrderRequest,
  ) {
    const user = req.user as AuthenticatedUser;
    const result = await this.battleOrderService.battleSell(user.userId, battleId, body);
    return ApiResponse.ok(result);
  }

  @Get(':battleId/my-balance')
  @UseGuards(JwtAuthGuard)
  async getMyBalance(@Req() req: Request, @Param('battleId') battleId: string) {
    const user = req.user as AuthenticatedUser;
    const result = await this.battleOrderService.getMyBalance(user.userId, battleId);
    return ApiResponse.ok(result);
  }

  @Get(':battleId/positions')
  @UseGuards(JwtAuthGuard)
  async getBattlePositions(@Req() req: Request, @Param('battleId') battleId: string) {
    const user = req.user as AuthenticatedUser;
    const result = await this.battleOrderService.getBattlePositions(user.userId, battleId);
    return ApiResponse.ok(result);
  }

  @Post('match/enqueue')
  @UseGuards(JwtAuthGuard)
  async enqueueMatch(@Req() req: Request, @Body() body: MatchBattleRequest) {
    const user = req.user as AuthenticatedUser;
    const result = await this.battleMatchingService.enqueue(user.userId, body);
    return ApiResponse.ok(result);
  }

  @Post('match/dequeue')
  @UseGuards(JwtAuthGuard)
  async dequeueMatch(@Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    await this.battleMatchingService.dequeue(user.userId);
    return ApiResponse.ok({ dequeued: true });
  }
}
