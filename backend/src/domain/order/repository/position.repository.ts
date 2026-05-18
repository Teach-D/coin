import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
  ): Promise<Position | null> {
    return this.repo.findOne({ where: { userId, ticker, direction, status } });
  }

  async save(position: Position): Promise<Position> {
    return this.repo.save(position);
  }
}
