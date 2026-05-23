import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../../../common/guard/jwt-auth.guard';
import { ApiResponse } from '../../../common/dto/api-response.dto';
import { OrderService } from '../service/order.service';
import { BuyOrderRequest, SellOrderRequest } from '../dto/order-request.dto';
import { AuthenticatedUser } from '../../user/service/jwt.strategy';

@Controller('api/orders')
@UseGuards(JwtAuthGuard)
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Post('buy')
  async buy(@Req() req: Request, @Body() body: BuyOrderRequest) {
    const user = req.user as AuthenticatedUser;
    const result = await this.orderService.buy(user.userId, body);
    return ApiResponse.ok(result);
  }

  @Post('sell')
  async sell(@Req() req: Request, @Body() body: SellOrderRequest) {
    const user = req.user as AuthenticatedUser;
    const result = await this.orderService.sell(user.userId, body);
    return ApiResponse.ok(result);
  }

  @Get('portfolio')
  async getPortfolio(@Req() req: Request, @Query('includeHistory') includeHistory?: string) {
    const user = req.user as AuthenticatedUser;
    const result = await this.orderService.getPortfolio(user.userId, includeHistory === 'true');
    return ApiResponse.ok(result);
  }

  @Get('history')
  async getOrderHistory(@Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    const result = await this.orderService.getOrderHistory(user.userId);
    return ApiResponse.ok(result);
  }
}
