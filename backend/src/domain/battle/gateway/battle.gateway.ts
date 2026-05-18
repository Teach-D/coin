import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({ cors: { origin: '*' } })
export class BattleGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    const battleId = client.handshake.query.battleId as string;
    if (battleId) {
      client.join(`battle:${battleId}`);
    }
  }

  @SubscribeMessage('joinBattleRoom')
  handleJoinRoom(@ConnectedSocket() client: Socket, @MessageBody() data: { battleId: string }) {
    client.join(`battle:${data.battleId}`);
  }

  broadcastToBattle(battleId: string, event: string, data: any) {
    this.server.to(`battle:${battleId}`).emit(event, data);
  }
}
