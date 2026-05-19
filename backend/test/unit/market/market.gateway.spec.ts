import { MarketGateway } from 'src/domain/market/gateway/market.gateway';
import { JwtService } from '@nestjs/jwt';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Socket } from 'socket.io';

function makeSocket(token?: string): jest.Mocked<Pick<Socket, 'handshake' | 'join' | 'disconnect'>> {
  return {
    handshake: {
      auth: token ? { token } : {},
    } as any,
    join: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn(),
  };
}

function makeServerMock() {
  const emitMock = jest.fn();
  const toMock = jest.fn().mockReturnValue({ emit: emitMock });
  return { to: toMock, emit: emitMock };
}

function makeMarketGateway(overrides: Partial<{
  jwtVerify: (token: string) => any;
  eventEmitter: Partial<EventEmitter2>;
}> = {}): { gateway: MarketGateway; serverMock: ReturnType<typeof makeServerMock> } {
  const jwtService = {
    verify: overrides.jwtVerify ?? jest.fn().mockReturnValue({ sub: 1 }),
  } as any as JwtService;

  const tickerSubscriber = {
    onMessage: jest.fn(),
  } as any;

  const eventEmitter = {
    emit: jest.fn(),
    on: jest.fn(),
    ...overrides.eventEmitter,
  } as any as EventEmitter2;

  const gateway = new MarketGateway(tickerSubscriber, jwtService, eventEmitter);
  const serverMock = makeServerMock();
  gateway.server = serverMock as any;
  return { gateway, serverMock };
}

describe('MarketGateway', () => {
  describe('handleConnection', () => {
    it('JWT_유효할때_user_room에_join_호출', () => {
      const { gateway } = makeMarketGateway({
        jwtVerify: jest.fn().mockReturnValue({ sub: 42 }),
      });
      const client = makeSocket('valid-token');

      gateway.handleConnection(client as any);

      expect(client.join).toHaveBeenCalledWith('user:42');
    });

    it('JWT_없을때_room_join_스킵_연결_유지', () => {
      const { gateway } = makeMarketGateway();
      const client = makeSocket();

      gateway.handleConnection(client as any);

      expect(client.join).not.toHaveBeenCalled();
      expect(client.disconnect).not.toHaveBeenCalled();
    });

    it('JWT_만료시_room_join_스킵_연결_유지', () => {
      const { gateway } = makeMarketGateway({
        jwtVerify: jest.fn().mockImplementation(() => {
          throw new Error('jwt expired');
        }),
      });
      const client = makeSocket('expired-token');

      gateway.handleConnection(client as any);

      expect(client.join).not.toHaveBeenCalled();
      expect(client.disconnect).not.toHaveBeenCalled();
    });

    it('JWT_payload에_sub_없을때_room_join_스킵', () => {
      const { gateway } = makeMarketGateway({
        jwtVerify: jest.fn().mockReturnValue({ sub: undefined }),
      });
      const client = makeSocket('no-sub-token');

      gateway.handleConnection(client as any);

      expect(client.join).not.toHaveBeenCalled();
    });
  });

  describe('emitToUser', () => {
    it('emitToUser_호출시_해당_user_room에_emit', () => {
      const { gateway, serverMock } = makeMarketGateway();

      gateway.emitToUser(7, 'matchFound', { battleId: 'battle-uuid-1' });

      expect(serverMock.to).toHaveBeenCalledWith('user:7');
      expect(serverMock.emit).toHaveBeenCalledWith('matchFound', { battleId: 'battle-uuid-1' });
    });

    it('emitToUser_서로_다른_userId에_각각_독립적으로_emit', () => {
      const { gateway, serverMock } = makeMarketGateway();

      gateway.emitToUser(1, 'matchFound', { battleId: 'uuid-a' });
      gateway.emitToUser(2, 'matchFound', { battleId: 'uuid-a' });

      expect(serverMock.to).toHaveBeenCalledWith('user:1');
      expect(serverMock.to).toHaveBeenCalledWith('user:2');
      expect(serverMock.to).toHaveBeenCalledTimes(2);
    });
  });

  describe('handleMatchFound 이벤트 리스너', () => {
    it('socket_user_matchFound_이벤트_수신시_해당_유저_room에_matchFound_emit', () => {
      const { gateway, serverMock } = makeMarketGateway();

      gateway.handleMatchFound({ userId: 99, battleId: 'battle-xyz' });

      expect(serverMock.to).toHaveBeenCalledWith('user:99');
      expect(serverMock.emit).toHaveBeenCalledWith('matchFound', { battleId: 'battle-xyz' });
    });

    it('handleMatchFound_battleId가_payload에_그대로_전달됨', () => {
      const { gateway, serverMock } = makeMarketGateway();
      const expectedBattleId = 'specific-battle-id-123';

      gateway.handleMatchFound({ userId: 5, battleId: expectedBattleId });

      expect(serverMock.emit).toHaveBeenCalledWith('matchFound', { battleId: expectedBattleId });
    });
  });
});
