import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from '../entity/order.entity';

@Injectable()
export class OrderRepository {
  constructor(
    @InjectRepository(Order)
    private readonly repo: Repository<Order>,
  ) {}

  async findByIdempotencyKey(key: string): Promise<Order | null> {
    return this.repo.findOne({ where: { idempotencyKey: key } });
  }

  async existsByIdempotencyKey(key: string): Promise<boolean> {
    return this.repo.exists({ where: { idempotencyKey: key } });
  }

  async findByUserIdOrderByCreatedAtDesc(userId: number): Promise<Order[]> {
    return this.repo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async save(order: Order): Promise<Order> {
    return this.repo.save(order);
  }
}
