import { Battle, BattleStatus } from '../entity/battle.entity';

export interface ParticipantInfo {
  userId: number;
  nickname: string;
  seedPriceSnapshot: number | null;
  currentValuation: number | null;
  returnRate: number | null;
}

export class BattleResponse {
  battleId: string;
  hostUserId: number;
  status: BattleStatus;
  leverage: number;
  seedMoney: number;
  duration: number;
  maxParticipants: number;
  currentParticipants: number;
  startTime: Date | null;
  endTime: Date | null;
  winnerId: number | null;
  participants?: ParticipantInfo[];
  createdAt: Date;

  static from(battle: Battle, participants?: ParticipantInfo[]): BattleResponse {
    return {
      battleId: battle.battleId,
      hostUserId: battle.hostUserId,
      status: battle.status,
      leverage: battle.leverage,
      seedMoney: battle.seedMoney,
      duration: battle.duration,
      maxParticipants: battle.maxParticipants,
      currentParticipants: battle.currentParticipants,
      startTime: battle.startTime,
      endTime: battle.endTime,
      winnerId: battle.winnerId,
      participants,
      createdAt: battle.createdAt,
    };
  }
}

export interface BattleSummary {
  battleId: string;
  status: BattleStatus;
  leverage: number;
  seedMoney: number;
  duration: number;
  maxParticipants: number;
  currentParticipants: number;
  createdAt: Date;
}

export class BattleListResponse {
  content: BattleSummary[];
  totalElements: number;
  totalPages: number;
  page: number;
  size: number;
}

export class JoinBattleResponse {
  battleId: string;
  status: BattleStatus;
  currentParticipants: number;
  maxParticipants: number;

  static from(battle: Battle): JoinBattleResponse {
    return {
      battleId: battle.battleId,
      status: battle.status,
      currentParticipants: battle.currentParticipants,
      maxParticipants: battle.maxParticipants,
    };
  }
}

export interface ParticipantResultResponse {
  userId: number;
  nickname: string;
  rank: number;
  isWinner: boolean;
  initialSeed: number;
  finalValuation: number;
  profitAmount: number;
  profitRate: number;
}

export class BattleResultResponse {
  battleId: string;
  status: string;
  durationMinutes: number;
  endedAt: string | null;
  participants: ParticipantResultResponse[];
  myResult: ParticipantResultResponse | null;
}

export interface BattleRankEntry {
  rank: number;
  userId: number;
  nickname: string;
  returnRate: number;
  currentValuation: number;
}

export class InviteCodeResponse {
  inviteCode: string;
  inviteUrl: string;
  expiresAt: Date;
}

export class JoinByInviteResponse {
  battleId: string;
  battleRoomUrl: string;
  joinedAt: Date;
}

export class MatchQueueResponse {
  queued: boolean;
  estimatedWaitSeconds: number;
}

export interface BattleWebSocketMessage {
  type: string;
  battleId: string;
  data: Record<string, any>;
}
