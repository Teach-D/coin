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
      orderId: Number(order.id),
      userId: Number(order.userId),
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
  quantity: number;
  averagePrice: number;
  leverage: number;
  margin: number;
  status: PositionStatus;
  currentPrice: number;
  unrealizedPnl: number;
  unrealizedPnlRate: number;
  evaluatedValue: number;
  liquidationPrice: number;
  openedAt: Date;

  static from(position: Position, currentPrice: number): PositionResponse {
    const unrealizedPnl = position.unrealizedPnl(currentPrice);
    const unrealizedPnlRate =
      position.margin > 0
        ? parseFloat(((unrealizedPnl / position.margin) * 100).toFixed(2))
        : 0;
    return {
      positionId: Number(position.id),
      userId: position.userId,
      ticker: position.ticker,
      direction: position.direction,
      quantity: parseFloat(position.quantity),
      averagePrice: position.averagePrice,
      leverage: position.leverage,
      margin: position.margin,
      status: position.status,
      currentPrice,
      unrealizedPnl,
      unrealizedPnlRate,
      evaluatedValue: position.evaluatedValue(currentPrice),
      liquidationPrice: position.liquidationPrice(),
      openedAt: position.openedAt,
    };
  }
}

export class RecentOrderResponse {
  orderId: number;
  ticker: string;
  side: string;
  executedPrice: number | null;
  amount: number | null;
  createdAt: Date;

  static from(order: Order): RecentOrderResponse {
    return {
      orderId: Number(order.id),
      ticker: order.ticker,
      side: order.side,
      executedPrice: order.executedPrice,
      amount: order.executedAmount,
      createdAt: order.createdAt,
    };
  }
}

export class PortfolioResponse {
  portfolio: {
    userId: number;
    balance: number;
    totalAsset: number;
    totalPnl: number;
    totalPnlRate: number;
  };
  positions: PositionResponse[];
  recentOrders?: RecentOrderResponse[];
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
      orderId: Number(order.id),
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
