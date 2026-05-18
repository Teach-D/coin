import { Injectable, Logger } from '@nestjs/common';
import { BattleCardImageService } from './battle-card-image.service';
import { BattleResultResponse } from '../dto/battle-response.dto';

@Injectable()
export class BattleCardPipelineService {
  private readonly logger = new Logger(BattleCardPipelineService.name);

  constructor(private readonly battleCardImageService: BattleCardImageService) {}

  async generateAndBroadcastCard(result: BattleResultResponse): Promise<void> {
    try {
      const imageBytes = this.battleCardImageService.generateCardImage(result);
      this.logger.log(`결과 카드 생성 battleId=${result.battleId} bytes=${imageBytes.length}`);
    } catch (e) {
      this.logger.error(`결과 카드 생성 실패 battleId=${result.battleId}`, e);
    }
  }

  async generateAndBroadcastLiquidationCard(
    userId: number,
    ticker: string,
    lossAmount: number,
    leverage: number,
  ): Promise<void> {
    try {
      const imageBytes = this.battleCardImageService.generateLiquidationCard(ticker, lossAmount, leverage);
      this.logger.log(`청산 카드 생성 userId=${userId} ticker=${ticker} bytes=${imageBytes.length}`);
    } catch (e) {
      this.logger.error(`청산 카드 생성 실패 userId=${userId} ticker=${ticker}`, e);
    }
  }
}
