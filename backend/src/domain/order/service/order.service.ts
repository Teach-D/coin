import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import Redlock from 'redlock';
import { CoinBattleException } from '../../../common/exception/coin-battle.exception';
import { ErrorCode } from '../../../common/exception/error-code.enum';
import { RedisService } from '../../../common/config/redis.config';
import { UserRepository } from '../../user/repository/user.repository';
import { OrderRepository } from '../repository/order.repository';
import { PositionRepository } from '../repository/position.repository';
import { TickerRedisRepository } from '../../market/repository/ticker-redis.repository';
import { Order, OrderDirection, OrderSide, OrderStatus, OrderType } from '../entity/order.entity';
import { Position, PositionStatus } from '../entity/position.entity';
import { BuyOrderRequest, SellOrderRequest } from '../dto/order-request.dto';
import {
  OrderHistoryResponse,
  OrderResponse,
  PortfolioResponse,
  PositionResponse,
  RecentOrderResponse,
} from '../dto/order-response.dto';
import { OrderFilledEvent } from '../event/order-filled.event';

const BD_SCALE = 10;

@Injectable()
export class OrderService {
  private readonly redlock: Redlock;

  constructor(
    private readonly userRepository: UserRepository,
    private readonly orderRepository: OrderRepository,
    private readonly positionRepository: PositionRepository,
    private readonly tickerRedisRepository: TickerRedisRepository,
    private readonly redisService: RedisService,
    private readonly eventEmitter: EventEmitter2,
    private readonly dataSource: DataSource,
  ) {
    this.redlock = new Redlock([this.redisService.client], {
      retryCount: 0,
      retryDelay: 0,
    });
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<OrderResponse | null> {
    const order = await this.orderRepository.findByIdempotencyKey(idempotencyKey);
    if (!order) return null;
    return OrderResponse.from(order);
  }

  async buy(userId: number, request: BuyOrderRequest): Promise<OrderResponse> {
    if (request.orderType === OrderType.LIMIT && !request.limitPrice) {
      throw new CoinBattleException(ErrorCode.LIMIT_PRICE_REQUIRED);
    }

    if (request.orderType === OrderType.LIMIT && request.limitPrice) {
      const tickerData = await this.tickerRedisRepository.findByMarket(request.ticker);
      if (!tickerData) throw new CoinBattleException(ErrorCode.TICKER_NOT_FOUND);
      const marketPrice = Math.floor(tickerData.tradePrice);
      const isLong = request.direction === OrderDirection.LONG;
      if (isLong && request.limitPrice > marketPrice) {
        throw new CoinBattleException(ErrorCode.INVALID_LIMIT_PRICE);
      }
      if (!isLong && request.limitPrice < marketPrice) {
        throw new CoinBattleException(ErrorCode.INVALID_LIMIT_PRICE);
      }
    }

    const existing = await this.orderRepository.findByIdempotencyKey(request.idempotencyKey);
    if (existing) return OrderResponse.from(existing);

    let lock: any;
    try {
      lock = await this.redlock.acquire([`user:${userId}:order`], 3000);
    } catch {
      throw new CoinBattleException(ErrorCode.ORDER_LOCK_TIMEOUT);
    }

    try {
      return await this.executeBuy(userId, request);
    } finally {
      await lock.release().catch(() => {});
    }
  }

  async sell(userId: number, request: SellOrderRequest): Promise<OrderResponse> {
    const existing = await this.orderRepository.findByIdempotencyKey(request.idempotencyKey);
    if (existing) return OrderResponse.from(existing);

    let lock: any;
    try {
      lock = await this.redlock.acquire([`user:${userId}:order`], 3000);
    } catch {
      throw new CoinBattleException(ErrorCode.ORDER_LOCK_TIMEOUT);
    }

    try {
      return await this.executeSell(userId, request);
    } finally {
      await lock.release().catch(() => {});
    }
  }

  async executeBuy(userId: number, request: BuyOrderRequest): Promise<OrderResponse> {
    let savedPosition: Position | null = null as Position | null;

    const result = await this.dataSource.transaction(async (manager) => {
      if (await this.orderRepository.existsByIdempotencyKey(request.idempotencyKey)) {
        throw new CoinBattleException(ErrorCode.DUPLICATE_ORDER);
      }

      const user = await this.userRepository.findById(userId);
      if (!user) throw new CoinBattleException(ErrorCode.USER_NOT_FOUND);

      const currentPrice = await this.resolvePrice(request.ticker, request.orderType, request.limitPrice);
      const slippage = this.applySlippage(currentPrice, request.amount, this.isBuyEntry(request.direction));
      const executedPrice = slippage.executedPrice;
      const margin = request.amount;

      const notionalValue = margin * request.leverage;
      const executedQuantity = (notionalValue / executedPrice).toFixed(BD_SCALE);

      if (!request.battleId) {
        if (user.balance < margin) {
          throw new CoinBattleException(ErrorCode.INSUFFICIENT_BALANCE);
        }
        user.balance -= margin;
        await manager.save(user);
      }

      const position = await this.upsertPosition(
        manager,
        userId,
        request.ticker,
        request.direction,
        executedQuantity,
        executedPrice,
        request.leverage,
        margin,
        request.battleId ?? null,
      );
      savedPosition = position;

      const order = new Order();
      order.userId = userId;
      order.positionId = position.id;
      order.idempotencyKey = request.idempotencyKey;
      order.ticker = request.ticker;
      order.orderType = request.orderType;
      order.direction = request.direction;
      order.side = OrderSide.BUY;
      order.requestedAmount = request.amount;
      order.limitPrice = request.limitPrice ?? null;
      order.executedPrice = executedPrice;
      order.executedAmount = margin;
      order.executedQuantity = executedQuantity;
      order.leverage = request.leverage;
      order.status = OrderStatus.FILLED;
      const saved = await manager.save(order);

      const evaluatedValue = await this.resolvePortfolioEvaluatedValue(userId, user.balance, currentPrice, position);
      this.eventEmitter.emit('order.filled', new OrderFilledEvent(saved.id, userId, request.ticker, evaluatedValue));

      const response = OrderResponse.from(saved);
      response.marketPrice = currentPrice;
      response.slippageRate = slippage.slippageRate;
      return response;
    });

    if (savedPosition) {
      await this.tickerRedisRepository.removeLiquidationIndex(
        savedPosition.id,
        request.ticker,
        request.direction,
      );
      await this.tickerRedisRepository.addLiquidationIndex(
        savedPosition.id,
        request.ticker,
        request.direction,
        savedPosition.liquidationPrice(),
      );
    }

    return result;
  }

  async executeSell(userId: number, request: SellOrderRequest): Promise<OrderResponse> {
    let fullClosedPositionId: number | null = null;
    let fullClosedTicker: string | null = null;
    let fullClosedDirection: OrderDirection | null = null;

    const result = await this.dataSource.transaction(async (manager) => {
      if (await this.orderRepository.existsByIdempotencyKey(request.idempotencyKey)) {
        throw new CoinBattleException(ErrorCode.DUPLICATE_ORDER);
      }

      const user = await this.userRepository.findById(userId);
      if (!user) throw new CoinBattleException(ErrorCode.USER_NOT_FOUND);

      const position = await this.positionRepository.findById(request.positionId);
      if (!position) throw new CoinBattleException(ErrorCode.POSITION_NOT_FOUND);
      if (Number(position.userId) !== userId) throw new CoinBattleException(ErrorCode.POSITION_NOT_OWNED);
      if (position.status === PositionStatus.CLOSED) throw new CoinBattleException(ErrorCode.POSITION_ALREADY_CLOSED);
      if (position.battleId && !request.battleId) throw new CoinBattleException(ErrorCode.BATTLE_POSITION_NOT_CLOSEABLE);

      const closeRatio = request.closeRatio;
      const currentPrice = await this.resolvePrice(position.ticker, OrderType.MARKET, null);
      const slippage = this.applySlippage(currentPrice, position.margin, this.isSellEntry(position.direction));
      const executedPrice = slippage.executedPrice;

      const positionQty = parseFloat(position.quantity);
      const closeQuantity = (positionQty * closeRatio).toFixed(BD_SCALE);
      const closeMargin = Math.floor(position.margin * closeRatio);

      const entryValue = parseFloat(closeQuantity) * position.averagePrice;
      const exitValue = parseFloat(closeQuantity) * executedPrice;

      const rawPnl =
        position.direction === OrderDirection.LONG
          ? exitValue - entryValue
          : entryValue - exitValue;
      const realizedPnl = Math.floor(rawPnl);

      if (!position.battleId) {
        user.balance += closeMargin + realizedPnl;
        await manager.save(user);
      }

      const isFullClose = Math.abs(closeRatio - 1) < 1e-9;
      if (isFullClose) {
        position.close();
        fullClosedPositionId = position.id;
        fullClosedTicker = position.ticker;
        fullClosedDirection = position.direction;
      } else {
        position.quantity = (positionQty - parseFloat(closeQuantity)).toFixed(BD_SCALE);
        position.margin -= closeMargin;
      }
      await manager.save(position);

      const order = new Order();
      order.userId = userId;
      order.positionId = position.id;
      order.idempotencyKey = request.idempotencyKey;
      order.ticker = position.ticker;
      order.orderType = OrderType.MARKET;
      order.direction = position.direction;
      order.side = OrderSide.SELL;
      order.requestedAmount = null;
      order.executedPrice = executedPrice;
      order.executedAmount = closeMargin;
      order.executedQuantity = closeQuantity;
      order.leverage = position.leverage;
      order.closeRatio = closeRatio.toFixed(4);
      order.realizedPnl = realizedPnl;
      order.status = OrderStatus.FILLED;
      const saved = await manager.save(order);

      const evaluatedValue = await this.resolvePortfolioEvaluatedValue(userId, user.balance, currentPrice, position);
      this.eventEmitter.emit('order.filled', new OrderFilledEvent(saved.id, userId, position.ticker, evaluatedValue));

      const response = OrderResponse.from(saved);
      response.marketPrice = currentPrice;
      response.slippageRate = slippage.slippageRate;
      return response;
    });

    if (fullClosedPositionId !== null && fullClosedTicker !== null && fullClosedDirection !== null) {
      await this.tickerRedisRepository.removeLiquidationIndex(
        fullClosedPositionId,
        fullClosedTicker,
        fullClosedDirection,
      );
    }

    return result;
  }

  async forceClose(positionId: number, liquidationPrice: number): Promise<OrderResponse> {
    const position = await this.positionRepository.findById(positionId);
    if (!position) throw new CoinBattleException(ErrorCode.POSITION_NOT_FOUND);
    if (position.status === PositionStatus.CLOSED) throw new CoinBattleException(ErrorCode.POSITION_ALREADY_CLOSED);

    const { ticker, direction } = position;
    const idempotencyKey = `liquidation:${positionId}`;

    const saved = await this.dataSource.transaction(async (manager) => {
      const lockedPosition = await this.positionRepository.findById(positionId);
      if (!lockedPosition) throw new CoinBattleException(ErrorCode.POSITION_NOT_FOUND);
      if (lockedPosition.status === PositionStatus.CLOSED) throw new CoinBattleException(ErrorCode.POSITION_ALREADY_CLOSED);

      const closeQuantity = lockedPosition.quantity;
      const qty = parseFloat(closeQuantity);

      const entryValue = qty * lockedPosition.averagePrice;
      const exitValue = qty * liquidationPrice;

      const rawPnl =
        lockedPosition.direction === OrderDirection.LONG
          ? exitValue - entryValue
          : entryValue - exitValue;
      const realizedPnl = Math.floor(rawPnl);

      const user = await this.userRepository.findById(lockedPosition.userId);
      if (!user) throw new CoinBattleException(ErrorCode.USER_NOT_FOUND);

      const returnAmount = Math.max(lockedPosition.margin + realizedPnl, 0);
      user.balance += returnAmount;
      await manager.save(user);

      lockedPosition.close();
      await manager.save(lockedPosition);

      const order = new Order();
      order.userId = lockedPosition.userId;
      order.positionId = lockedPosition.id;
      order.idempotencyKey = idempotencyKey;
      order.ticker = lockedPosition.ticker;
      order.orderType = OrderType.MARKET;
      order.direction = lockedPosition.direction;
      order.side = OrderSide.SELL;
      order.executedPrice = liquidationPrice;
      order.executedAmount = lockedPosition.margin;
      order.executedQuantity = closeQuantity;
      order.leverage = lockedPosition.leverage;
      order.closeRatio = '1.0000';
      order.realizedPnl = realizedPnl;
      order.status = OrderStatus.FILLED;
      const orderSaved = await manager.save(order);

      this.eventEmitter.emit('order.filled', new OrderFilledEvent(orderSaved.id, lockedPosition.userId, lockedPosition.ticker, user.balance));
      return OrderResponse.from(orderSaved);
    });

    await this.tickerRedisRepository.removeLiquidationIndex(positionId, ticker, direction);
    return saved;
  }

  async getPortfolio(userId: number, includeHistory = false): Promise<PortfolioResponse> {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new CoinBattleException(ErrorCode.USER_NOT_FOUND);

    const openPositions = await this.positionRepository.findByUserIdAndStatus(userId, PositionStatus.OPEN);
    const positions: PositionResponse[] = [];
    let totalPnl = 0;
    let totalMargin = 0;

    for (const pos of openPositions) {
      const ticker = await this.tickerRedisRepository.findByMarket(pos.ticker);
      const currentPrice = ticker?.tradePrice ? Math.floor(ticker.tradePrice) : pos.averagePrice;
      const posResponse = PositionResponse.from(pos, currentPrice);
      positions.push(posResponse);
      totalPnl += posResponse.unrealizedPnl;
      totalMargin += pos.margin;
    }

    const totalAsset = user.balance + totalMargin + totalPnl;
    const totalPnlRate =
      totalMargin > 0 ? parseFloat(((totalPnl / totalMargin) * 100).toFixed(2)) : 0;

    const recentOrders = includeHistory
      ? (await this.orderRepository.findByUserIdOrderByCreatedAtDesc(userId))
          .slice(0, 20)
          .map(RecentOrderResponse.from)
      : undefined;

    return {
      portfolio: {
        userId,
        balance: user.balance,
        totalAsset,
        totalPnl,
        totalPnlRate,
      },
      positions,
      recentOrders,
    };
  }

  async getOrderHistory(userId: number): Promise<OrderHistoryResponse[]> {
    const orders = await this.orderRepository.findByUserIdOrderByCreatedAtDesc(userId);
    return orders.map(OrderHistoryResponse.from);
  }

  private async upsertPosition(
    manager: any,
    userId: number,
    ticker: string,
    direction: OrderDirection,
    addQuantityStr: string,
    executedPrice: number,
    leverage: number,
    addMargin: number,
    battleId: string | null = null,
  ): Promise<Position> {
    const existing = await this.positionRepository.findByUserIdAndTickerAndDirectionAndStatus(
      userId,
      ticker,
      direction,
      PositionStatus.OPEN,
      battleId,
    );

    if (existing) {
      const existingQty = parseFloat(existing.quantity);
      const addQty = parseFloat(addQuantityStr);
      const totalQty = existingQty + addQty;

      const existingEntryValue = existingQty * existing.averagePrice;
      const newEntryValue = addQty * executedPrice;
      const newAveragePrice = Math.floor((existingEntryValue + newEntryValue) / totalQty);

      existing.quantity = totalQty.toFixed(BD_SCALE);
      existing.averagePrice = newAveragePrice;
      existing.margin += addMargin;
      const savedExisting = await manager.save(existing);
      existing.id = savedExisting.id ?? existing.id;
      return existing;
    }

    const position = new Position();
    position.userId = userId;
    position.ticker = ticker;
    position.direction = direction;
    position.quantity = parseFloat(addQuantityStr).toFixed(BD_SCALE);
    position.averagePrice = executedPrice;
    position.leverage = leverage;
    position.margin = addMargin;
    position.status = PositionStatus.OPEN;
    position.battleId = battleId;
    const savedPosition = await manager.save(position);
    position.id = savedPosition.id ?? position.id;
    return position;
  }

  private async resolvePrice(ticker: string, orderType: OrderType, limitPrice?: number | null): Promise<number> {
    const tickerData = await this.tickerRedisRepository.findByMarket(ticker);
    if (!tickerData) throw new CoinBattleException(ErrorCode.TICKER_NOT_FOUND);
    return Math.floor(tickerData.tradePrice);
  }

  private applySlippage(
    basePrice: number,
    amount: number,
    isAdverseHigh: boolean,
  ): { executedPrice: number; slippageRate: number } {
    let rate: number;
    if (amount <= 1_000_000) {
      rate = 0;
    } else if (amount <= 5_000_000) {
      rate = 0.0005;
    } else {
      const randomBasisPoints = 10 + Math.floor(Math.random() * 21);
      rate = randomBasisPoints / 10000;
    }

    if (rate === 0) return { executedPrice: basePrice, slippageRate: 0 };

    const adjustment = basePrice * rate;
    const executedPrice = isAdverseHigh
      ? Math.round(basePrice + adjustment)
      : Math.round(basePrice - adjustment);
    const slippageRate = isAdverseHigh ? rate : -rate;
    return { executedPrice, slippageRate };
  }

  private isBuyEntry(direction: OrderDirection): boolean {
    return direction === OrderDirection.LONG;
  }

  private isSellEntry(direction: OrderDirection): boolean {
    return direction === OrderDirection.SHORT;
  }

  private async resolvePortfolioEvaluatedValue(
    userId: number,
    currentBalance: number,
    latestPrice: number,
    latestPosition: Position,
  ): Promise<number> {
    const openPositions = await this.positionRepository.findByUserIdAndStatus(userId, PositionStatus.OPEN);
    let totalPnl = 0;
    let totalMargin = 0;
    for (const pos of openPositions) {
      const price =
        pos.id === latestPosition.id
          ? latestPrice
          : (await this.tickerRedisRepository.findByMarket(pos.ticker))?.tradePrice ?? pos.averagePrice;
      totalMargin += pos.margin;
      totalPnl += pos.unrealizedPnl(Math.floor(price));
    }
    return currentBalance + totalMargin + totalPnl;
  }
}
