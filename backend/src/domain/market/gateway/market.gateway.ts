import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { TickerPubSubSubscriber } from '../service/ticker-pubsub.service';
import { TickerResponse } from '../dto/ticker.dto';

@WebSocketGateway({
  cors: {
    origin: process.env.NODE_ENV === 'production'
      ? (process.env.ALLOWED_ORIGINS?.split(',') ?? [])
      : '*',
    credentials: true,
  },
})
export class MarketGateway implements OnGatewayInit, OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly tickerSubscriber: TickerPubSubSubscriber,
    private readonly jwtService: JwtService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  afterInit() {
    this.tickerSubscriber.onMessage((ticker: TickerResponse) => {
      this.server.to(`ticker:${ticker.market}`).emit('ticker', ticker);
    });
  }

  handleConnection(client: Socket) {
    const token = client.handshake.auth?.token as string | undefined;
    if (!token) return;
    try {
      const payload = this.jwtService.verify(token);
      const userId = payload.sub;
      if (userId) client.join(`user:${userId}`);
    } catch {
    }
  }

  emitToUser<T>(userId: number, event: string, data: T): void {
    this.server.to(`user:${userId}`).emit(event, data);
  }

  @OnEvent('socket.user.matchFound')
  handleMatchFound(payload: { userId: number; battleId: string }) {
    this.emitToUser(payload.userId, 'matchFound', { battleId: payload.battleId });
  }

  @OnEvent('socket.user.liquidation')
  handleLiquidation(payload: { userId: number; ticker: string; direction: string }) {
    this.emitToUser(payload.userId, 'notification', {
      type: 'LIQUIDATION',
      ticker: payload.ticker,
      positionType: payload.direction,
      liquidatedAt: new Date().toISOString(),
    });
  }

  @SubscribeMessage('subscribeToTickers')
  handleSubscribeToTickers(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { markets: string[] },
  ) {
    for (const market of data.markets) {
      client.join(`ticker:${market}`);
    }
  }

  @SubscribeMessage('subscribeToTicker')
  handleSubscribeToTicker(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { market: string },
  ) {
    client.join(`ticker:${data.market}`);
  }

  @SubscribeMessage('unsubscribeFromTicker')
  handleUnsubscribeFromTicker(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { market: string },
  ) {
    client.leave(`ticker:${data.market}`);
  }
}
