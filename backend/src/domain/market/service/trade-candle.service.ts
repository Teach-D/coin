import { Injectable } from '@nestjs/common';
import { MarketGateway } from '../gateway/market.gateway';

export interface CandleState {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  candleStartMs: number;
}

@Injectable()
export class TradeCandleService {
  private readonly candleMap = new Map<string, Map<number, CandleState>>();
  private readonly lastEmitMs = new Map<string, number>();
  private static readonly MAX_MARKETS = 300;

  private static readonly THROTTLE_MS = 250;

  constructor(private readonly gateway: MarketGateway) {}

  onTrade(market: string, unit: number, price: number, volume: number, timestamp: number): void {
    const bucketMs = unit * 60_000;
    const candleStartMs = Math.floor(timestamp / bucketMs) * bucketMs;

    if (!this.candleMap.has(market)) {
      if (this.candleMap.size >= TradeCandleService.MAX_MARKETS) return;
      this.candleMap.set(market, new Map());
    }
    const unitMap = this.candleMap.get(market)!;

    const existing = unitMap.get(unit);

    if (!existing) {
      const newState: CandleState = {
        open: price,
        high: price,
        low: price,
        close: price,
        volume: 0,
        candleStartMs,
      };
      unitMap.set(unit, newState);
      this.emit(market, unit, newState);
      return;
    }

    const currentBucket = Math.floor(existing.candleStartMs / bucketMs);
    const incomingBucket = Math.floor(candleStartMs / bucketMs);

    if (incomingBucket !== currentBucket) {
      this.emitImmediate(market, unit, existing);

      const newState: CandleState = {
        open: price,
        high: price,
        low: price,
        close: price,
        volume: 0,
        candleStartMs,
      };
      unitMap.set(unit, newState);
      this.emitImmediate(market, unit, newState);
      return;
    }

    existing.high = Math.max(existing.high, price);
    existing.low = Math.min(existing.low, price);
    existing.close = price;
    existing.volume += volume;

    this.emit(market, unit, existing);
  }

  private emit(market: string, unit: number, state: CandleState): void {
    const now = Date.now();
    const throttleKey = `${market}:${unit}`;
    const last = this.lastEmitMs.get(throttleKey) ?? 0;

    if (now - last < TradeCandleService.THROTTLE_MS) {
      return;
    }

    this.lastEmitMs.set(throttleKey, now);
    this.gateway.emitCandleUpdate(market, unit, state);
  }

  private emitImmediate(market: string, unit: number, state: CandleState): void {
    this.lastEmitMs.set(`${market}:${unit}`, Date.now());
    this.gateway.emitCandleUpdate(market, unit, state);
  }
}
