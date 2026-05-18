import { IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { OrderDirection, OrderType } from '../entity/order.entity';

export class BuyOrderRequest {
  @IsNotEmpty()
  @IsString()
  idempotencyKey: string;

  @IsNotEmpty()
  @IsString()
  ticker: string;

  @IsEnum(OrderType)
  orderType: OrderType;

  @IsEnum(OrderDirection)
  direction: OrderDirection;

  @IsInt()
  @Min(1000)
  amount: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  limitPrice?: number;

  @IsInt()
  @Min(1)
  @Max(10)
  leverage: number;
}

export class SellOrderRequest {
  @IsNotEmpty()
  @IsString()
  idempotencyKey: string;

  @IsInt()
  positionId: number;

  @IsNumber()
  @Min(0.0001)
  @Max(1)
  closeRatio: number;
}
