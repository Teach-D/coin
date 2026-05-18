import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PositionRepository } from '../repository/position.repository';
import { PositionStatus } from '../entity/position.entity';

const FUNDING_RATE = 0.0001;

@Injectable()
export class FundingRateService {
  private readonly logger = new Logger(FundingRateService.name);

  constructor(private readonly positionRepository: PositionRepository) {}

  @Cron('0 0 0,8,16 * * *', { timeZone: 'UTC' })
  async settle(): Promise<void> {
    const openPositions = await this.positionRepository.findAllByStatus(PositionStatus.OPEN);
    for (const position of openPositions) {
      try {
        const fundingFee = Math.floor(position.margin * FUNDING_RATE);
        position.margin = Math.max(position.margin - fundingFee, 0);
        await this.positionRepository.save(position);
      } catch (e) {
        this.logger.error(`펀딩비 정산 실패 positionId=${position.id}`, e);
      }
    }
  }
}
