import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class CreateBattleRequest {
  @IsInt()
  @Min(1)
  @Max(10)
  leverage: number;

  @IsInt()
  @Min(10_000)
  @Max(10_000_000)
  seedMoney: number;

  @IsIn([10, 30, 60])
  duration: number;

  @IsIn([2, 3, 5])
  maxParticipants: number;
}

export class MatchBattleRequest {
  @IsInt()
  @Min(1)
  @Max(10)
  leverage: number;

  @IsInt()
  @Min(10_000)
  @Max(10_000_000)
  seedMoney: number;

  @IsIn([10, 30, 60])
  duration: number;

  @IsIn([2, 3, 5])
  @IsOptional()
  maxParticipants?: number;
}
