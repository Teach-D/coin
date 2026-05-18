export enum ChangeType {
  RISE = 'RISE',
  FALL = 'FALL',
  EVEN = 'EVEN',
}

export class TickerResponse {
  market: string;
  tradePrice: number;
  changeRate: number;
  changePrice: number;
  change: ChangeType;
  accTradeVolume24h: number;
  accTradePrice24h: number;
  highPrice: number;
  lowPrice: number;
  timestamp: number | null;
}

export class TickerListResponse {
  tickers: TickerResponse[];
}
