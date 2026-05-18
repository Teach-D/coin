import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { RedisService } from '../../../common/config/redis.config';
import { TickerResponse } from '../dto/ticker.dto';
import Redis from 'ioredis';

const TICKER_CHANNEL = 'coin:ticker:broadcast';

@Injectable()
export class TickerPubSubPublisher {
  constructor(private readonly redisService: RedisService) {}

  async publish(ticker: TickerResponse): Promise<void> {
    await this.redisService.client.publish(TICKER_CHANNEL, JSON.stringify(ticker));
  }
}

@Injectable()
export class TickerPubSubSubscriber implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TickerPubSubSubscriber.name);
  private subscriber: Redis;
  private readonly messageHandlers: ((ticker: TickerResponse) => void)[] = [];

  constructor(private readonly redisService: RedisService) {}

  onModuleInit() {
    this.subscriber = this.redisService.client.duplicate();
    this.subscriber.subscribe(TICKER_CHANNEL, (err) => {
      if (err) this.logger.error('Redis subscribe failed', err);
    });
    this.subscriber.on('message', (_channel, message) => {
      try {
        const ticker = JSON.parse(message) as TickerResponse;
        this.messageHandlers.forEach((handler) => handler(ticker));
      } catch (e) {
        this.logger.debug('ticker message parse error');
      }
    });
  }

  onModuleDestroy() {
    this.subscriber.disconnect();
  }

  onMessage(handler: (ticker: TickerResponse) => void): void {
    this.messageHandlers.push(handler);
  }
}
