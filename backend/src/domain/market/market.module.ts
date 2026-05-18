import { Module } from '@nestjs/common';
import { TickerRedisRepository } from './repository/ticker-redis.repository';
import { MarketService } from './service/market.service';
import { TickerPubSubPublisher, TickerPubSubSubscriber } from './service/ticker-pubsub.service';
import { UpbitWebSocketClient } from './client/upbit-websocket.client';
import { BinanceWebSocketClient } from './client/binance-websocket.client';
import { MarketController } from './controller/market.controller';
import { MarketGateway } from './gateway/market.gateway';

@Module({
  providers: [
    TickerRedisRepository,
    MarketService,
    TickerPubSubPublisher,
    TickerPubSubSubscriber,
    UpbitWebSocketClient,
    BinanceWebSocketClient,
    MarketGateway,
  ],
  controllers: [MarketController],
  exports: [TickerRedisRepository, MarketService],
})
export class MarketModule {}
