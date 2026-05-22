import * as https from 'https';
import { Injectable } from '@nestjs/common';
import { CoinBattleException } from '../../../common/exception/coin-battle.exception';
import { ErrorCode } from '../../../common/exception/error-code.enum';
import { TickerRedisRepository } from '../repository/ticker-redis.repository';
import { TickerListResponse, TickerResponse } from '../dto/ticker.dto';

interface UpbitCandle {
  market: string;
  candle_date_time_utc: string;
  candle_date_time_kst: string;
  opening_price: number;
  high_price: number;
  low_price: number;
  trade_price: number;
  candle_acc_trade_volume: number;
  timestamp: number;
}

export interface CandleRaw {
  market: string;
  candleDateTimeUtc: string;
  candleDateTimeKst: string;
  openingPrice: number;
  highPrice: number;
  lowPrice: number;
  tradePrice: number;
  candleAccTradeVolume: number;
  timestamp: number;
}

export interface CandleResponse {
  market: string;
  unit: number;
  candles: CandleRaw[];
  totalCount: number;
}

const MAX_PAGES_BY_UNIT: Record<number, number> = { 1: 20, 3: 15, 5: 10, 15: 8, 60: 10, 240: 10 };
const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

@Injectable()
export class MarketService {
  private readonly pendingCandles = new Map<string, Promise<CandleResponse>>();
  private readonly candleCache = new Map<string, { data: CandleResponse; expiresAt: number }>();

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

  async getCandles(market: string, unit: number, count: number, pages: number): Promise<CandleResponse> {
    const clampedPages = Math.min(pages, MAX_PAGES_BY_UNIT[unit] ?? 10);
    const key = `${market}:${unit}:${count}:${clampedPages}`;

    const cached = this.candleCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.data;

    const existing = this.pendingCandles.get(key);
    if (existing) return existing;

    const promise = this.fetchAllCandles(market, unit, count, clampedPages)
      .then((result) => {
        if (result.totalCount > 0) {
          this.candleCache.set(key, { data: result, expiresAt: Date.now() + unit * 60 * 1000 });
        }
        return result;
      })
      .finally(() => {
        this.pendingCandles.delete(key);
      });
    this.pendingCandles.set(key, promise);
    return promise;
  }

  private async fetchAllCandles(market: string, unit: number, count: number, pages: number): Promise<CandleResponse> {
    const batchSize = Math.min(count, 200);
    const allCandles: UpbitCandle[] = [];
    let to: string | undefined;

    for (let i = 0; i < pages; i++) {
      if (i > 0) await delay(100);
      const batch = await this.fetchCandlesBatch(market, unit, batchSize, to);
      if (batch.length === 0) break;
      allCandles.push(...batch);
      const lastUtc = batch[batch.length - 1].candle_date_time_utc;
      const prevMs = new Date(lastUtc + 'Z').getTime() - unit * 60 * 1000;
      to = new Date(prevMs).toISOString().replace(/\.\d{3}Z$/, '');
    }

    return {
      market,
      unit,
      candles: allCandles.map((c) => ({
        market: c.market,
        candleDateTimeUtc: c.candle_date_time_utc,
        candleDateTimeKst: c.candle_date_time_kst,
        openingPrice: c.opening_price,
        highPrice: c.high_price,
        lowPrice: c.low_price,
        tradePrice: c.trade_price,
        candleAccTradeVolume: c.candle_acc_trade_volume,
        timestamp: c.timestamp,
      })),
      totalCount: allCandles.length,
    };
  }

  private async fetchCandlesBatch(market: string, unit: number, count: number, to?: string): Promise<UpbitCandle[]> {
    const retryDelays = [500, 1000];
    for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
      const result = await this.doFetchOnce(market, unit, count, to);
      if (result !== null) return result;
      if (attempt < retryDelays.length) {
        await delay(retryDelays[attempt]);
      }
    }
    return [];
  }

  private doFetchOnce(market: string, unit: number, count: number, to?: string): Promise<UpbitCandle[] | null> {
    return new Promise((resolve) => {
      let path = `/v1/candles/minutes/${unit}?market=${encodeURIComponent(market)}&count=${count}`;
      if (to) path += `&to=${encodeURIComponent(to)}`;

      https
        .get({ hostname: 'api.upbit.com', path, headers: { Accept: 'application/json' } }, (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              if (!Array.isArray(parsed)) {
                resolve(null);
                return;
              }
              resolve(parsed as UpbitCandle[]);
            } catch {
              resolve(null);
            }
          });
        })
        .on('error', () => resolve([]));
    });
  }
}
