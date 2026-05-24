import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { OnEvent } from '@nestjs/event-emitter';
import { BattleSessionRepository } from '../repository/battle-session.repository';
import { BattleDeletedEvent } from '../event/battle.event';

@WebSocketGateway({
  cors: {
    origin: process.env.NODE_ENV === 'production'
      ? (process.env.ALLOWED_ORIGINS?.split(',') ?? [])
      : '*',
    credentials: true,
  },
})
export class BattleGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly battleSessionRepository: BattleSessionRepository,
  ) {}

  async handleConnection(client: Socket) {
    const battleId = client.handshake.query.battleId as string | undefined;
    if (!battleId) return;

    const token = client.handshake.auth?.token as string | undefined;
    if (!token) {
      client.disconnect(true);
      return;
    }

    try {
      const payload = this.jwtService.verify(token);
      const userId = Number(payload.sub);
      const isParticipant = await this.battleSessionRepository.existsByParticipantIdAndBattleId(userId, battleId);
      if (!isParticipant) {
        client.disconnect(true);
        return;
      }
      client.join(`battle:${battleId}`);
    } catch {
      client.disconnect(true);
    }
  }

  @SubscribeMessage('joinBattleRoom')
  async handleJoinRoom(@ConnectedSocket() client: Socket, @MessageBody() data: { battleId: string }) {
    const token = client.handshake.auth?.token as string | undefined;
    if (!token) return;

    try {
      const payload = this.jwtService.verify(token);
      const userId = Number(payload.sub);
      const isParticipant = await this.battleSessionRepository.existsByParticipantIdAndBattleId(userId, data.battleId);
      if (isParticipant) {
        client.join(`battle:${data.battleId}`);
      }
    } catch {
    }
  }

  broadcastToBattle(battleId: string, event: string, data: any) {
    this.server.to(`battle:${battleId}`).emit(event, data);
  }

  @OnEvent('socket.battle.rankUpdate')
  handleRankUpdate(data: { battleId: string; rankings: any[] }) {
    this.broadcastToBattle(data.battleId, 'rankUpdate', { rankings: data.rankings });
  }

  @OnEvent('socket.battle.started')
  handleBattleStarted(data: { battleId: string; startTime: Date }) {
    this.broadcastToBattle(data.battleId, 'battleStarted', data);
  }

  @OnEvent('socket.battle.finished')
  handleBattleFinished(data: { battleId: string }) {
    this.broadcastToBattle(data.battleId, 'battleFinished', data);
  }

  @OnEvent('socket.battle.voided')
  handleBattleVoided(data: { battleId: string }) {
    this.broadcastToBattle(data.battleId, 'battleVoided', {
      ...data,
      message: '모든 참가자가 거래를 하지 않아 배틀이 무효 처리되었습니다.',
    });
  }

  @OnEvent('socket.battle.participantJoined')
  handleParticipantJoined(data: { battleId: string; currentParticipants: number }) {
    this.broadcastToBattle(data.battleId, 'participantJoined', data);
  }

  @OnEvent('battle.deleted')
  handleBattleDeleted(event: BattleDeletedEvent) {
    this.broadcastToBattle(event.battleId, 'battle.deleted', { battleId: event.battleId });
  }
}
