import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiResponse } from '../../../common/dto/api-response.dto';
import { MarketService } from '../service/market.service';

@Controller('api/market')
export class MarketController {
  constructor(private readonly marketService: MarketService) {}

  @Get('tickers')
  async getTickers(@Query('markets') markets?: string) {
    const marketList = markets ? markets.split(',').map((m) => m.trim()) : undefined;
    const result = await this.marketService.getTickers(marketList);
    return ApiResponse.ok(result);
  }

  @Get('tickers/:market')
  async getTicker(@Param('market') market: string) {
    const result = await this.marketService.getTicker(market);
    return ApiResponse.ok(result);
  }
}
