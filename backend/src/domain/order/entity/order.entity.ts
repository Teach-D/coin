import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum OrderType {
  MARKET = 'MARKET',
  LIMIT = 'LIMIT',
}

export enum OrderDirection {
  LONG = 'LONG',
  SHORT = 'SHORT',
}

export enum OrderSide {
  BUY = 'BUY',
  SELL = 'SELL',
}

export enum OrderStatus {
  PENDING = 'PENDING',
  FILLED = 'FILLED',
  PARTIALLY_FILLED = 'PARTIALLY_FILLED',
  CANCELLED = 'CANCELLED',
}

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: number;

  @Column({ type: 'bigint', name: 'user_id', nullable: false })
  userId: number;

  @Column({ type: 'bigint', name: 'position_id', nullable: true })
  positionId: number | null;

  @Column({ type: 'varchar', name: 'idempotency_key', length: 64, nullable: false, unique: true })
  idempotencyKey: string;

  @Column({ type: 'varchar', length: 30, nullable: false })
  ticker: string;

  @Column({ type: 'varchar', name: 'order_type', length: 10, nullable: false })
  orderType: OrderType;

  @Column({ type: 'varchar', length: 10, nullable: false })
  direction: OrderDirection;

  @Column({ type: 'varchar', length: 10, nullable: false })
  side: OrderSide;

  @Column({ type: 'bigint', name: 'requested_amount', nullable: true })
  requestedAmount: number | null;

  @Column({ type: 'bigint', name: 'limit_price', nullable: true })
  limitPrice: number | null;

  @Column({ type: 'bigint', name: 'executed_price', nullable: true })
  executedPrice: number | null;

  @Column({ type: 'bigint', name: 'executed_amount', nullable: true })
  executedAmount: number | null;

  @Column({ type: 'decimal', precision: 30, scale: 10, name: 'executed_quantity', nullable: true })
  executedQuantity: string | null;

  @Column({ type: 'int', nullable: false, default: 1 })
  leverage: number;

  @Column({ type: 'decimal', precision: 5, scale: 4, name: 'close_ratio', nullable: true })
  closeRatio: string | null;

  @Column({ type: 'bigint', name: 'realized_pnl', nullable: true })
  realizedPnl: number | null;

  @Column({ type: 'varchar', length: 20, nullable: false, default: OrderStatus.PENDING })
  status: OrderStatus;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
