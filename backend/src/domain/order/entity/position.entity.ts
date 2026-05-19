import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  VersionColumn,
} from 'typeorm';
import { OrderDirection } from './order.entity';

export enum PositionStatus {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
}

@Entity('positions')
export class Position {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: number;

  @Column({ type: 'bigint', name: 'user_id', nullable: false })
  userId: number;

  @Column({ type: 'varchar', length: 30, nullable: false })
  ticker: string;

  @Column({ type: 'varchar', length: 10, nullable: false })
  direction: OrderDirection;

  @Column({ type: 'decimal', precision: 30, scale: 10, nullable: false })
  quantity: string;

  @Column({ type: 'bigint', name: 'average_price', nullable: false })
  averagePrice: number;

  @Column({ type: 'int', nullable: false, default: 1 })
  leverage: number;

  @Column({ type: 'bigint', nullable: false })
  margin: number;

  @Column({ type: 'varchar', length: 20, nullable: false, default: PositionStatus.OPEN })
  status: PositionStatus;

  @VersionColumn({ default: 0 })
  version: number;

  @CreateDateColumn({ name: 'opened_at' })
  openedAt: Date;

  @Column({ type: 'timestamptz', name: 'closed_at', nullable: true })
  closedAt: Date | null;

  liquidationPrice(): number {
    const threshold = (1 / this.leverage) * 0.9;
    if (this.direction === OrderDirection.LONG) {
      return Math.floor(this.averagePrice * (1 - threshold));
    }
    return Math.floor(this.averagePrice * (1 + threshold));
  }

  unrealizedPnl(currentPrice: number): number {
    const qty = parseFloat(this.quantity);
    const positionValue = qty * currentPrice;
    const entryValue = qty * this.averagePrice;
    if (this.direction === OrderDirection.LONG) {
      return Math.floor((positionValue - entryValue) * this.leverage);
    }
    return Math.floor((entryValue - positionValue) * this.leverage);
  }

  evaluatedValue(currentPrice: number): number {
    return this.margin + this.unrealizedPnl(currentPrice);
  }

  close(): void {
    this.status = PositionStatus.CLOSED;
    this.closedAt = new Date();
  }
}
