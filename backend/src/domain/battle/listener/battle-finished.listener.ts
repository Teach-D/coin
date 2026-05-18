import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { BattleFinishedEvent } from '../event/battle.event';
import { RankingService } from '../../ranking/service/ranking.service';
import { BattleCardPipelineService } from '../service/battle-card-pipeline.service';

@Injectable()
export class BattleFinishedListener {
  private readonly logger = new Logger(BattleFinishedListener.name);

  constructor(
    private readonly rankingService: RankingService,
    private readonly battleCardPipelineService: BattleCardPipelineService,
  ) {}

  @OnEvent('battle.finished')
  async handle(event: BattleFinishedEvent): Promise<void> {
    try {
      await this.battleCardPipelineService.generateAndBroadcastCard(event.battleResult);

      if (event.winnerId !== null) {
        for (const participant of event.battleResult.participants) {
          try {
            await this.rankingService.updatePvpWinRate(participant.userId, participant.isWinner);
          } catch (e) {
            this.logger.error(`PVP 승률 갱신 실패 userId=${participant.userId}`, e);
          }
        }
      }
    } catch (e) {
      this.logger.error(`배틀 종료 후처리 실패 battleId=${event.battleId}`, e);
    }
  }
}
