import { BattleRankEntry, BattleResultResponse } from '../dto/battle-response.dto';

export class BattleFinishedEvent {
  constructor(
    public readonly battleId: string,
    public readonly winnerId: number | null,
    public readonly rankings: BattleRankEntry[],
    public readonly battleResult: BattleResultResponse,
  ) {}
}
