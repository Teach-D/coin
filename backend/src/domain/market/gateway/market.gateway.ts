import {
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import { TickerPubSubSubscriber } from '../service/ticker-pubsub.service';
import { TickerResponse } from '../dto/ticker.dto';

@WebSocketGateway({ cors: { origin: '*' } })
export class MarketGateway implements OnGatewayInit {
  @WebSocketServer()
  server: Server;

  constructor(private readonly tickerSubscriber: TickerPubSubSubscriber) {}

  afterInit() {
    this.tickerSubscriber.onMessage((ticker: TickerResponse) => {
      this.server.to(`ticker:${ticker.market}`).emit('ticker', ticker);
    });
  }
}
