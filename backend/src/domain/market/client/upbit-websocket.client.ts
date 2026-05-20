import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as https from 'https';
import * as WebSocket from 'ws';
import { TickerRedisRepository } from '../repository/ticker-redis.repository';
import { TickerPubSubPublisher } from '../service/ticker-pubsub.service';
import { ChangeType, TickerResponse } from '../dto/ticker.dto';

@Injectable()
export class UpbitWebSocketClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(UpbitWebSocketClient.name);
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

  private async connect() {
    const markets = await this.fetchKrwMarkets();
    if (markets.length === 0) {
      this.logger.warn('KRW 마켓 목록 조회 실패 — 재연결 예약');
      this.scheduleReconnect();
      return;
    }

    await this.tickerRedisRepository.saveMarkets(markets);
    const payload = this.buildSubscribePayload(markets);

    this.ws = new WebSocket('wss://api.upbit.com/websocket/v1');

    this.ws.on('open', () => {
      this.attempt = 0;
      this.logger.log(`업비트 WebSocket 연결 — 마켓 ${markets.length}개`);
      this.ws!.send(payload);
    });

    this.ws.on('message', (data: Buffer) => {
      this.handleMessage(data.toString('utf8'));
    });

    this.ws.on('error', (err) => {
      this.logger.warn(`업비트 WebSocket 오류: ${err.message}`);
    });

    this.ws.on('close', () => {
      if (!this.destroyed) {
        this.logger.warn('업비트 WebSocket 연결 종료 — 재연결 예약');
        this.scheduleReconnect();
      }
    });
  }

  private scheduleReconnect() {
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    const delay = this.reconnectDelays[Math.min(this.attempt, this.reconnectDelays.length - 1)];
    this.attempt++;
    const jitter = Math.random() * 500;
    this.reconnectTimeout = setTimeout(() => this.connect(), delay + jitter);
  }

  private async fetchKrwMarkets(): Promise<string[]> {
    return new Promise((resolve) => {
      https
        .get('https://api.upbit.com/v1/market/all?isDetails=false', (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data) as { market: string }[];
              resolve(parsed.filter((m) => m.market.startsWith('KRW-')).map((m) => m.market));
            } catch {
              resolve([]);
            }
          });
        })
        .on('error', (err) => {
          this.logger.error(`업비트 마켓 목록 조회 실패: ${err.message}`);
          resolve([]);
        });
    });
  }

  private buildSubscribePayload(markets: string[]): string {
    const codesJson = markets.map((m) => `"${m}"`).join(',');
    return `[{"ticket":"coinbattle-server"},{"type":"ticker","codes":[${codesJson}]}]`;
  }

  private handleMessage(raw: string) {
    try {
      const node = JSON.parse(raw);
      const market = node['code'];
      if (!market) return;

      const changeRaw = node['change'] ?? 'EVEN';
      const change: ChangeType =
        Object.values(ChangeType).includes(changeRaw) ? changeRaw : ChangeType.EVEN;

      const ticker: TickerResponse = {
        market,
        tradePrice: node['trade_price'],
        changeRate: node['signed_change_rate'],
        changePrice: node['signed_change_price'],
        change,
        accTradeVolume24h: node['acc_trade_volume_24h'],
        accTradePrice24h: node['acc_trade_price_24h'],
        highPrice: node['high_price'],
        lowPrice: node['low_price'],
        timestamp: node['timestamp'] ?? null,
      };

      this.tickerRedisRepository.save(ticker);
      this.tickerPubSubPublisher.publish(ticker);
    } catch {
      this.logger.debug('업비트 메시지 파싱 실패');
    }
  }
}
