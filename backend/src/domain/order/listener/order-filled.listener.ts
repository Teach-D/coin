import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { OrderFilledEvent } from '../event/order-filled.event';
import { RankingService } from '../../ranking/service/ranking.service';

@Injectable()
export class OrderFilledListener {
  private readonly logger = new Logger(OrderFilledListener.name);

  constructor(private readonly rankingService: RankingService) {}

  @OnEvent('order.filled')
  async handle(event: OrderFilledEvent): Promise<void> {
    try {
      await this.rankingService.updateRanking(event.userId, event.evaluatedValue);
    } catch (e) {
      this.logger.error(`랭킹 갱신 실패 userId=${event.userId}`, e);
    }
  }
}
