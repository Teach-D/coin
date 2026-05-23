import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Position, PositionStatus } from '../entity/position.entity';
import { OrderDirection } from '../entity/order.entity';

@Injectable()
export class PositionRepository {
  constructor(
    @InjectRepository(Position)
    private readonly repo: Repository<Position>,
  ) {}

  async findById(id: number): Promise<Position | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findByUserIdAndStatus(userId: number, status: PositionStatus): Promise<Position[]> {
    return this.repo.find({ where: { userId, status } });
  }

  async findAllByStatus(status: PositionStatus): Promise<Position[]> {
    return this.repo.find({ where: { status } });
  }

  async findByUserIdAndTickerAndDirectionAndStatus(
    userId: number,
    ticker: string,
    direction: OrderDirection,
    status: PositionStatus,
    battleId: string | null = null,
  ): Promise<Position | null> {
    return this.repo.findOne({
      where: { userId, ticker, direction, status, battleId: battleId ?? IsNull() },
    });
  }

  async findOpenByUserIdAndBattleId(userId: number, battleId: string): Promise<Position[]> {
    return this.repo.find({ where: { userId, battleId, status: PositionStatus.OPEN } });
  }

  async findOpenByBattleId(battleId: string): Promise<Position[]> {
    return this.repo.find({ where: { battleId, status: PositionStatus.OPEN } });
  }

  async save(position: Position): Promise<Position> {
    return this.repo.save(position);
  }
}
