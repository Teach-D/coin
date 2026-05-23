export class UserProfileResponse {
  userId: number;
  nickname: string;
  profileImageUrl: string | null;
  email: string | null;
  nicknameSet: boolean;
}

export class UserStatsResponse {
  wins: number;
  losses: number;
  draws: number;
  totalGames: number;
  winRate: number | null;
  bestReturnRate: number | null;
}
