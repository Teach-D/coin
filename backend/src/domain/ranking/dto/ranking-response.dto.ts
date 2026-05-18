export class RankingEntryResponse {
  rank: number;
  userId: number;
  nickname: string;
  evaluatedValue: number;
}

export class PvpRankingEntryResponse {
  rank: number;
  userId: number;
  nickname: string;
  winRatePct: number;
}

export class MyRankingResponse {
  userId: number;
  nickname: string;
  season: RankingSlot;
  daily: RankingSlot;
}

export class RankingSlot {
  rank: number | null;
  evaluatedValue: number;
}
