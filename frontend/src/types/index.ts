export interface ApiResponse<T> {
  data: T;
  message: string;
}

export interface Position {
  positionId: number;
  ticker: string;
  direction: 'LONG' | 'SHORT';
  quantity: number;
  averagePrice: number;
  leverage: number;
  currentPrice: number;
  evaluatedValue: number;
  unrealizedPnl: number;
  unrealizedPnlRate: number;
  liquidationPrice: number;
  status: 'OPEN' | 'CLOSED';
  openedAt: string;
}

export interface Portfolio {
  userId: number;
  balance: number;
  totalAsset: number;
  totalPnl: number;
  totalPnlRate: number;
}

export interface RecentOrder {
  orderId: number;
  ticker: string;
  side: 'BUY' | 'SELL';
  executedPrice: number;
  amount: number;
  createdAt: string;
}

export interface PortfolioResponse {
  portfolio: Portfolio;
  positions: Position[];
  recentOrders?: RecentOrder[];
}

export interface BuyOrderRequest {
  idempotencyKey: string;
  ticker: string;
  orderType: 'MARKET' | 'LIMIT';
  direction: 'LONG' | 'SHORT';
  amount: number;
  leverage: number;
  limitPrice: number | null;
}

export interface BuyOrderResponse {
  orderId: number;
  ticker: string;
  direction: string;
  orderType: string;
  requestedAmount: number;
  executedPrice: number | null;
  executedAmount: number | null;
  leverage: number;
  status: 'PENDING' | 'FILLED' | 'CANCELLED';
  createdAt: string;
}

export interface SellOrderRequest {
  idempotencyKey: string;
  positionId: number;
  closeRatio: number;
}

export interface SellOrderResponse {
  orderId: number;
  positionId: number;
  ticker: string;
  direction: string;
  closedQuantity: number;
  executedPrice: number;
  realizedPnl: number;
  remainingQuantity: number;
  status: 'FILLED' | 'PARTIALLY_FILLED';
  createdAt: string;
}

export interface CandleRaw {
  market: string;
  candleDateTimeUtc: string;
  candleDateTimeKst: string;
  openingPrice: number;
  highPrice: number;
  lowPrice: number;
  tradePrice: number;
  candleAccTradeVolume: number;
  timestamp: number;
}

export interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export type CandleUnit = 1 | 3 | 5 | 10 | 15 | 30 | 60 | 240;

export interface CandleResponse {
  market: string;
  unit: number;
  candles: CandleRaw[];
  totalCount: number;
}

export interface RankingEntry {
  rank: number;
  userId: number;
  nickname: string;
  evaluatedValue: number;
}

export interface PvpRankingEntry {
  rank: number;
  userId: number;
  nickname: string;
  winRatePct: number;
}

export interface MyRankingSlot {
  rank: number | null;
  evaluatedValue: number;
}

export interface MyRanking {
  userId: number;
  nickname: string;
  season: MyRankingSlot;
  daily: MyRankingSlot;
}

export type BattleStatus = 'WAITING' | 'IN_PROGRESS' | 'FINISHED';

export interface BattleListItem {
  battleId: string;
  status: BattleStatus;
  leverage: number;
  seedMoney: number;
  duration: number;
  maxParticipants: number;
  currentParticipants: number;
  createdAt: string;
}

export interface BattleParticipant {
  userId: number;
  nickname: string;
  seedPriceSnapshot: number | null;
  currentValuation: number;
  returnRate: number;
}

export interface BattleDetail {
  battleId: string;
  status: BattleStatus;
  leverage: number;
  seedMoney: number;
  duration: number;
  maxParticipants: number;
  startTime: string | null;
  endTime: string | null;
  participants: BattleParticipant[];
  winnerId: number | null;
}

export interface BattleListResponse {
  content: BattleListItem[];
  totalElements: number;
  totalPages: number;
  page: number;
  size: number;
}

export interface CreateBattleRequest {
  leverage: number;
  seedMoney: number;
  duration: number;
  maxParticipants: number;
}

export interface CreateBattleResponse {
  battleId: string;
  status: BattleStatus;
  hostUserId: number;
  leverage: number;
  seedMoney: number;
  duration: number;
  maxParticipants: number;
  currentParticipants: number;
  createdAt: string;
}

export interface JoinBattleResponse {
  battleId: string;
  status: BattleStatus;
  currentParticipants: number;
  maxParticipants: number;
  startTime: string;
}

export interface MatchBattleRequest {
  leverage: number;
  seedMoney: number;
  duration: number;
  maxParticipants: number;
}

export interface MatchQueueResponse {
  queueKey: string;
  estimatedWaitSeconds: number;
}

export interface BattleRankingEntry {
  rank: number;
  userId: number;
  nickname: string;
  returnRate: number | null;
  currentValuation: number | null;
}

export interface BattleStompMessage {
  type: 'PARTICIPANT_JOINED' | 'BATTLE_STARTED' | 'RANK_UPDATE' | 'BATTLE_FINISHED' | 'CARD_READY';
  battleId: string;
  data: {
    userId: number | null;
    currentParticipants: number;
    rankings?: BattleRankingEntry[];
    winnerId: number | null;
    cardImageUrl?: string;
  };
  timestamp: string;
}

export interface CardReadyNotification {
  type: 'CARD_READY';
  battleId: string;
  cardImageUrl: string;
  timestamp: string;
}

export interface MatchNotification {
  battleId: string;
  status: BattleStatus;
  participants: Array<{ userId: number; nickname: string }>;
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

export interface BattleResultResponse {
  battleId: string;
  status: string;
  durationMinutes: number;
  endedAt: string | null;
  participants: ParticipantResultResponse[];
  myResult: ParticipantResultResponse | null;
}

export interface UserProfileResponse {
  userId: number;
  nickname: string;
  profileImageUrl: string | null;
  email: string;
}

export interface UserStatsResponse {
  wins: number;
  losses: number;
  draws: number;
  totalGames: number;
  winRate: number | null;
  bestReturnRate: number | null;
}

export interface InviteCodeResponse {
  inviteCode: string;
  inviteUrl: string;
  expiresAt: string;
}

export interface JoinByInviteResponse {
  battleId: string;
  battleRoomUrl: string;
  joinedAt: string;
}

export interface LiquidationCardReadyNotification {
  type: 'LIQUIDATION_CARD_READY';
  ticker: string;
  cardImageUrl: string;
  timestamp: string;
}

export interface BattleBalanceResponse {
  battleBalance: number;
  openPositionValue: number;
  totalValuation: number;
  returnRate: number;
  seedMoney: number;
}

export interface BattlePosition {
  positionId: number;
  ticker: string;
  direction: 'LONG' | 'SHORT';
  quantity: number;
  averagePrice: number;
  leverage: number;
  currentPrice: number;
  evaluatedValue: number;
  unrealizedPnl: number;
  unrealizedPnlRate: number;
  liquidationPrice: number;
  status: 'OPEN' | 'CLOSED';
  openedAt: string;
}

export interface BattlePositionsResponse {
  positions: BattlePosition[];
}
