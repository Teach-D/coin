import { Order, OrderDirection, OrderSide, OrderStatus, OrderType } from '../entity/order.entity';
import { Position, PositionStatus } from '../entity/position.entity';

export class OrderResponse {
  orderId: number;
  userId: number;
  ticker: string;
  orderType: OrderType;
  direction: OrderDirection;
  side: OrderSide;
  requestedAmount: number | null;
  executedPrice: number | null;
  executedAmount: number | null;
  executedQuantity: string | null;
  leverage: number;
  closeRatio: string | null;
  realizedPnl: number | null;
  status: OrderStatus;
  createdAt: Date;
  marketPrice?: number;
  slippageRate?: number;

  static from(order: Order): OrderResponse {
    return {
      orderId: order.id,
      userId: order.userId,
      ticker: order.ticker,
      orderType: order.orderType,
      direction: order.direction,
      side: order.side,
      requestedAmount: order.requestedAmount,
      executedPrice: order.executedPrice,
      executedAmount: order.executedAmount,
      executedQuantity: order.executedQuantity,
      leverage: order.leverage,
      closeRatio: order.closeRatio,
      realizedPnl: order.realizedPnl,
      status: order.status,
      createdAt: order.createdAt,
    };
  }
}

export class PositionResponse {
  positionId: number;
  userId: number;
  ticker: string;
  direction: OrderDirection;
  quantity: string;
  averagePrice: number;
  leverage: number;
  margin: number;
  status: PositionStatus;
  currentPrice: number;
  unrealizedPnl: number;
  evaluatedValue: number;
  liquidationPrice: number;
  openedAt: Date;

  static from(position: Position, currentPrice: number): PositionResponse {
    return {
      positionId: position.id,
      userId: position.userId,
      ticker: position.ticker,
      direction: position.direction,
      quantity: position.quantity,
      averagePrice: position.averagePrice,
      leverage: position.leverage,
      margin: position.margin,
      status: position.status,
      currentPrice,
      unrealizedPnl: position.unrealizedPnl(currentPrice),
      evaluatedValue: position.evaluatedValue(currentPrice),
      liquidationPrice: position.liquidationPrice(),
      openedAt: position.openedAt,
    };
  }
}

export class PortfolioResponse {
  userId: number;
  balance: number;
  positions: PositionResponse[];
}

export class OrderHistoryResponse {
  orderId: number;
  ticker: string;
  orderType: OrderType;
  direction: OrderDirection;
  side: OrderSide;
  executedPrice: number | null;
  executedAmount: number | null;
  leverage: number;
  realizedPnl: number | null;
  status: OrderStatus;
  createdAt: Date;

  static from(order: Order): OrderHistoryResponse {
    return {
      orderId: order.id,
      ticker: order.ticker,
      orderType: order.orderType,
      direction: order.direction,
      side: order.side,
      executedPrice: order.executedPrice,
      executedAmount: order.executedAmount,
      leverage: order.leverage,
      realizedPnl: order.realizedPnl,
      status: order.status,
      createdAt: order.createdAt,
    };
  }
}
