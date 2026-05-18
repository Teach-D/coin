export class UserProfileResponse {
  userId: number;
  nickname: string;
  profileImageUrl: string | null;
  email: string;
}

export class UserStatsResponse {
  wins: number;
  losses: number;
  draws: number;
  totalGames: number;
  winRate: number | null;
  bestReturnRate: number | null;
}
