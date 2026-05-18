import { Injectable } from '@nestjs/common';
import { BattleResultResponse } from '../dto/battle-response.dto';

@Injectable()
export class BattleCardImageService {
  generateCardImage(result: BattleResultResponse): Buffer {
    const json = JSON.stringify({
      battleId: result.battleId,
      winner: result.participants.find((p) => p.isWinner)?.nickname,
      topReturnRate: result.participants[0]?.profitRate?.toFixed(2),
    });
    return Buffer.from(json, 'utf-8');
  }

  generateLiquidationCard(ticker: string, lossAmount: number, leverage: number): Buffer {
    const json = JSON.stringify({ ticker, lossAmount, leverage, type: 'LIQUIDATION' });
    return Buffer.from(json, 'utf-8');
  }
}
