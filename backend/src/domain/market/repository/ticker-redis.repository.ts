import { Injectable } from '@nestjs/common';
import { RedisService } from '../../../common/config/redis.config';
import { TickerResponse } from '../dto/ticker.dto';

const TICKER_TTL_SECONDS = 3;
const MARKETS_KEY = 'coin:markets';

@Injectable()
export class TickerRedisRepository {
  constructor(private readonly redisService: RedisService) {}

  private tickerKey(market: string): string {
    return `coin:price:${market}`;
  }

  async save(ticker: TickerResponse): Promise<void> {
    await this.redisService.client.set(
      this.tickerKey(ticker.market),
      JSON.stringify(ticker),
      'EX',
      TICKER_TTL_SECONDS,
    );
  }

  async saveMarkets(markets: string[]): Promise<void> {
    if (markets.length === 0) return;
    await this.redisService.client.del(MARKETS_KEY);
    await this.redisService.client.rpush(MARKETS_KEY, ...markets);
  }

  async findByMarket(market: string): Promise<TickerResponse | null> {
    const raw = await this.redisService.client.get(this.tickerKey(market));
    if (!raw) return null;
    return JSON.parse(raw) as TickerResponse;
  }

  async findByMarkets(markets: string[]): Promise<TickerResponse[]> {
    const results: TickerResponse[] = [];
    for (const market of markets) {
      const ticker = await this.findByMarket(market);
      if (ticker) results.push(ticker);
    }
    return results;
  }

  async findAll(): Promise<TickerResponse[]> {
    const markets = await this.redisService.client.lrange(MARKETS_KEY, 0, -1);
    return this.findByMarkets(markets);
  }
}
