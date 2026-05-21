import { IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { OrderDirection, OrderType } from '../entity/order.entity';

export class BuyOrderRequest {
  @IsNotEmpty()
  @IsString()
  @MaxLength(64)
  idempotencyKey: string;

  @IsNotEmpty()
  @IsString()
  @Matches(/^[A-Z]{2,10}-[A-Z]{2,10}$/)
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
  @MaxLength(64)
  idempotencyKey: string;

  @IsInt()
  positionId: number;

  @IsNumber()
  @Min(0.0001)
  @Max(1)
  closeRatio: number;
}
