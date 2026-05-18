import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as WebSocket from 'ws';
import { TickerRedisRepository } from '../repository/ticker-redis.repository';
import { TickerPubSubPublisher } from '../service/ticker-pubsub.service';
import { ChangeType, TickerResponse } from '../dto/ticker.dto';

@Injectable()
export class BinanceWebSocketClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BinanceWebSocketClient.name);
  private ws: WebSocket | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  private readonly reconnectDelays = [1000, 2000, 4000, 8000, 16000, 30000];
  private attempt = 0;

  constructor(
    private readonly tickerRedisRepository: TickerRedisRepository,
    private readonly tickerPubSubPublisher: TickerPubSubPublisher,
  ) {}

  onModuleInit() {
    this.connect();
  }

  onModuleDestroy() {
    this.destroyed = true;
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    this.ws?.close();
  }

  private connect() {
    this.ws = new WebSocket('wss://stream.binance.com:9443/ws/!miniTicker@arr');

    this.ws.on('open', () => {
      this.attempt = 0;
      this.logger.log('바이낸스 WebSocket 연결');
    });

    this.ws.on('message', (data: Buffer) => {
      this.handleMessage(data.toString('utf8'));
    });

    this.ws.on('error', (err) => {
      this.logger.warn(`바이낸스 WebSocket 오류: ${err.message}`);
    });

    this.ws.on('close', () => {
      if (!this.destroyed) {
        this.logger.warn('바이낸스 WebSocket 종료 — 재연결 예약');
        this.scheduleReconnect();
      }
    });
  }

  private scheduleReconnect() {
    const delay = this.reconnectDelays[Math.min(this.attempt, this.reconnectDelays.length - 1)];
    this.attempt++;
    this.reconnectTimeout = setTimeout(() => this.connect(), delay);
  }

  private handleMessage(raw: string) {
    try {
      const items = JSON.parse(raw) as any[];
      for (const item of items) {
        const market = `${item['s']}`;
        const price = parseFloat(item['c']);
        if (!market || isNaN(price)) continue;

        const ticker: TickerResponse = {
          market,
          tradePrice: price,
          changeRate: parseFloat(item['P']) / 100,
          changePrice: parseFloat(item['p']),
          change: ChangeType.EVEN,
          accTradeVolume24h: parseFloat(item['v']),
          accTradePrice24h: parseFloat(item['q']),
          highPrice: parseFloat(item['h']),
          lowPrice: parseFloat(item['l']),
          timestamp: item['E'] ?? null,
        };

        this.tickerRedisRepository.save(ticker);
        this.tickerPubSubPublisher.publish(ticker);
      }
    } catch {
      this.logger.debug('바이낸스 메시지 파싱 실패');
    }
  }
}
