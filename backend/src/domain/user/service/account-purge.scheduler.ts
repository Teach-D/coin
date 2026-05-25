import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { UserRepository } from '../repository/user.repository';
import { PositionRepository } from '../../order/repository/position.repository';
import { OrderRepository } from '../../order/repository/order.repository';

@Injectable()
export class AccountPurgeScheduler {
  private readonly logger = new Logger(AccountPurgeScheduler.name);

  constructor(
    private readonly userRepository: UserRepository,
    private readonly positionRepository: PositionRepository,
    private readonly orderRepository: OrderRepository,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Cron('0 2 * * *')
  async purgeWithdrawnUsers(): Promise<void> {
    try {
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const users = await this.userRepository.findWithdrawnBefore(cutoff);
      if (users.length === 0) return;

      const userIds = users.map((u) => u.id);
      await this.dataSource.transaction(async () => {
        await this.orderRepository.deleteByUserIds(userIds);
        await this.positionRepository.deleteByUserIds(userIds);
        await this.userRepository.deleteByIds(userIds);
      });
    } catch (error) {
      this.logger.error('Failed to purge withdrawn users', error);
    }
  }
}
