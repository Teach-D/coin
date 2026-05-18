import { Injectable } from '@nestjs/common';
import { CoinBattleException } from '../../../common/exception/coin-battle.exception';
import { ErrorCode } from '../../../common/exception/error-code.enum';
import { TickerRedisRepository } from '../repository/ticker-redis.repository';
import { TickerListResponse, TickerResponse } from '../dto/ticker.dto';

@Injectable()
export class MarketService {
  constructor(private readonly tickerRedisRepository: TickerRedisRepository) {}

  async getTickers(markets?: string[]): Promise<TickerListResponse> {
    const tickers =
      !markets || markets.length === 0
        ? await this.tickerRedisRepository.findAll()
        : await this.tickerRedisRepository.findByMarkets(markets);
    return { tickers };
  }

  async getTicker(market: string): Promise<TickerResponse> {
    const ticker = await this.tickerRedisRepository.findByMarket(market);
    if (!ticker) throw new CoinBattleException(ErrorCode.TICKER_NOT_FOUND);
    return ticker;
  }
}
