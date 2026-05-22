import { TradeCandleService } from 'src/domain/market/service/trade-candle.service';

interface GatewayMock {
  emitCandleUpdate: jest.Mock;
}

function makeGatewayMock(): GatewayMock {
  return { emitCandleUpdate: jest.fn() };
}

function makeService(gateway: GatewayMock): TradeCandleService {
  return new TradeCandleService(gateway as any);
}

const MARKET = 'KRW-BTC';
const UNIT = 1;
const MINUTE_MS = 60_000;

function minuteBoundaryMs(minuteOffset = 0): number {
  return Math.floor(Date.now() / MINUTE_MS) * MINUTE_MS + minuteOffset * MINUTE_MS;
}

describe('TradeCandleService', () => {
  let gateway: GatewayMock;
  let service: TradeCandleService;

  beforeEach(() => {
    jest.useFakeTimers();
    gateway = makeGatewayMock();
    service = makeService(gateway);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('최초 trade 수신 — 봉 초기화', () => {
    it('최초_trade_수신시_open_high_low_close_모두_체결가로_초기화', () => {
      const ts = minuteBoundaryMs();
      service.onTrade(MARKET, UNIT, 100, 0, ts);

      expect(gateway.emitCandleUpdate).toHaveBeenCalledTimes(1);
      const [, , candle] = gateway.emitCandleUpdate.mock.calls[0];
      expect(candle.open).toBe(100);
      expect(candle.high).toBe(100);
      expect(candle.low).toBe(100);
      expect(candle.close).toBe(100);
    });

    it('최초_trade_수신시_volume_0으로_초기화', () => {
      const ts = minuteBoundaryMs();
      service.onTrade(MARKET, UNIT, 100, 0, ts);

      const [, , candle] = gateway.emitCandleUpdate.mock.calls[0];
      expect(candle.volume).toBe(0);
    });

    it('최초_trade_수신시_candleStartMs가_분_경계로_설정됨', () => {
      const ts = minuteBoundaryMs() + 15_000;
      service.onTrade(MARKET, UNIT, 100, 0, ts);

      const [, , candle] = gateway.emitCandleUpdate.mock.calls[0];
      const expectedBucket = Math.floor(ts / (UNIT * MINUTE_MS)) * (UNIT * MINUTE_MS);
      expect(candle.candleStartMs).toBe(expectedBucket);
    });

    it('최초_trade_수신시_emitCandleUpdate_market과_unit이_올바르게_전달됨', () => {
      const ts = minuteBoundaryMs();
      service.onTrade(MARKET, UNIT, 100, 0, ts);

      const [emittedMarket, emittedUnit] = gateway.emitCandleUpdate.mock.calls[0];
      expect(emittedMarket).toBe(MARKET);
      expect(emittedUnit).toBe(UNIT);
    });
  });

  describe('OHLC 갱신 — 같은 봉 내 연속 trade', () => {
    it('같은_봉_두번째_trade가_첫_체결가보다_높으면_high_갱신', () => {
      const ts = minuteBoundaryMs();
      service.onTrade(MARKET, UNIT, 100, 0, ts);

      jest.advanceTimersByTime(300);
      service.onTrade(MARKET, UNIT, 200, 0, ts + 1_000);

      const lastCall = gateway.emitCandleUpdate.mock.calls.at(-1)!;
      expect(lastCall[2].high).toBe(200);
    });

    it('같은_봉_두번째_trade가_첫_체결가보다_낮으면_low_갱신', () => {
      const ts = minuteBoundaryMs();
      service.onTrade(MARKET, UNIT, 100, 0, ts);

      jest.advanceTimersByTime(300);
      service.onTrade(MARKET, UNIT, 50, 0, ts + 1_000);

      const lastCall = gateway.emitCandleUpdate.mock.calls.at(-1)!;
      expect(lastCall[2].low).toBe(50);
    });

    it('같은_봉_매_trade마다_close는_최신_체결가로_갱신', () => {
      const ts = minuteBoundaryMs();
      service.onTrade(MARKET, UNIT, 100, 0, ts);

      jest.advanceTimersByTime(300);
      service.onTrade(MARKET, UNIT, 150, 0, ts + 1_000);

      jest.advanceTimersByTime(300);
      service.onTrade(MARKET, UNIT, 120, 0, ts + 2_000);

      const lastCall = gateway.emitCandleUpdate.mock.calls.at(-1)!;
      expect(lastCall[2].close).toBe(120);
    });

    it('같은_봉_open은_봉_최초_체결가_이후_변경_불가', () => {
      const ts = minuteBoundaryMs();
      service.onTrade(MARKET, UNIT, 100, 0, ts);

      jest.advanceTimersByTime(300);
      service.onTrade(MARKET, UNIT, 200, 0, ts + 1_000);

      jest.advanceTimersByTime(300);
      service.onTrade(MARKET, UNIT, 50, 0, ts + 2_000);

      const lastCall = gateway.emitCandleUpdate.mock.calls.at(-1)!;
      expect(lastCall[2].open).toBe(100);
    });
  });

  describe('250ms throttle', () => {
    it('첫_trade_후_250ms_미경과_시_두번째_emit_생략', () => {
      const ts = minuteBoundaryMs();
      service.onTrade(MARKET, UNIT, 100, 0, ts);

      jest.advanceTimersByTime(100);
      service.onTrade(MARKET, UNIT, 110, 0, ts + 100);

      expect(gateway.emitCandleUpdate).toHaveBeenCalledTimes(1);
    });

    it('첫_trade_후_250ms_경과_시_두번째_emit_통과', () => {
      const ts = minuteBoundaryMs();
      service.onTrade(MARKET, UNIT, 100, 0, ts);

      jest.advanceTimersByTime(250);
      service.onTrade(MARKET, UNIT, 110, 0, ts + 250);

      expect(gateway.emitCandleUpdate).toHaveBeenCalledTimes(2);
    });

    it('throttle_중_OHLC_상태는_누적_유지되다가_다음_emit에_반영', () => {
      const ts = minuteBoundaryMs();
      service.onTrade(MARKET, UNIT, 100, 0, ts);

      jest.advanceTimersByTime(50);
      service.onTrade(MARKET, UNIT, 300, 0, ts + 50);

      jest.advanceTimersByTime(50);
      service.onTrade(MARKET, UNIT, 50, 0, ts + 100);

      jest.advanceTimersByTime(200);
      service.onTrade(MARKET, UNIT, 200, 0, ts + 300);

      const lastCall = gateway.emitCandleUpdate.mock.calls.at(-1)!;
      expect(lastCall[2].high).toBe(300);
      expect(lastCall[2].low).toBe(50);
      expect(lastCall[2].close).toBe(200);
    });
  });

  describe('봉 교체', () => {
    it('새_봉_진입시_완성된_이전_봉을_즉시_emit_후_새_봉_emit', () => {
      const ts1 = minuteBoundaryMs();
      service.onTrade(MARKET, UNIT, 100, 0, ts1);

      jest.advanceTimersByTime(300);

      const ts2 = minuteBoundaryMs(1);
      service.onTrade(MARKET, UNIT, 200, 0, ts2);

      expect(gateway.emitCandleUpdate).toHaveBeenCalledTimes(3);
    });

    it('봉_교체_직전_완성_봉_emit은_throttle_우선순위_초과로_즉시_발생', () => {
      const ts1 = minuteBoundaryMs();
      service.onTrade(MARKET, UNIT, 100, 0, ts1);

      jest.advanceTimersByTime(100);

      const ts2 = minuteBoundaryMs(1);
      service.onTrade(MARKET, UNIT, 200, 0, ts2);

      const completedCandleCall = gateway.emitCandleUpdate.mock.calls[1];
      expect(completedCandleCall[2].close).toBe(100);
    });

    it('새_봉_초기화시_open_high_low_close가_새_체결가로_설정', () => {
      const ts1 = minuteBoundaryMs();
      service.onTrade(MARKET, UNIT, 100, 0, ts1);

      jest.advanceTimersByTime(300);

      const ts2 = minuteBoundaryMs(1);
      service.onTrade(MARKET, UNIT, 200, 0, ts2);

      const newCandleCall = gateway.emitCandleUpdate.mock.calls.at(-1)!;
      expect(newCandleCall[2].open).toBe(200);
      expect(newCandleCall[2].high).toBe(200);
      expect(newCandleCall[2].low).toBe(200);
      expect(newCandleCall[2].close).toBe(200);
    });

    it('새_봉_초기화시_volume이_0으로_리셋', () => {
      const ts1 = minuteBoundaryMs();
      service.onTrade(MARKET, UNIT, 100, 0, ts1);

      jest.advanceTimersByTime(300);

      const ts2 = minuteBoundaryMs(1);
      service.onTrade(MARKET, UNIT, 200, 0, ts2);

      const newCandleCall = gateway.emitCandleUpdate.mock.calls.at(-1)!;
      expect(newCandleCall[2].volume).toBe(0);
    });
  });

  describe('다중 마켓·봉단위 독립성', () => {
    it('다른_마켓은_독립적인_candleMap_상태를_가짐', () => {
      const ts = minuteBoundaryMs();

      service.onTrade('KRW-BTC', UNIT, 100, 0, ts);
      service.onTrade('KRW-ETH', UNIT, 3000, 0, ts);

      const btcCall = gateway.emitCandleUpdate.mock.calls.find(([m]) => m === 'KRW-BTC')!;
      const ethCall = gateway.emitCandleUpdate.mock.calls.find(([m]) => m === 'KRW-ETH')!;

      expect(btcCall[2].open).toBe(100);
      expect(ethCall[2].open).toBe(3000);
    });

    it('같은_마켓_다른_봉단위는_독립적인_CandleState를_가짐', () => {
      const ts = minuteBoundaryMs();

      service.onTrade(MARKET, 1, 100, 0, ts);

      jest.advanceTimersByTime(300);
      service.onTrade(MARKET, 3, 100, 0, ts);

      const unit1Call = gateway.emitCandleUpdate.mock.calls.find(([, u]) => u === 1)!;
      const unit3Call = gateway.emitCandleUpdate.mock.calls.find(([, u]) => u === 3)!;

      const expectedBucket1 = Math.floor(ts / (1 * MINUTE_MS)) * (1 * MINUTE_MS);
      const expectedBucket3 = Math.floor(ts / (3 * MINUTE_MS)) * (3 * MINUTE_MS);

      expect(unit1Call[2].candleStartMs).toBe(expectedBucket1);
      expect(unit3Call[2].candleStartMs).toBe(expectedBucket3);
    });

    it('한_마켓의_throttle이_다른_마켓_emit에_영향을_주지_않음', () => {
      const ts = minuteBoundaryMs();

      service.onTrade('KRW-BTC', UNIT, 100, 0, ts);

      jest.advanceTimersByTime(100);
      service.onTrade('KRW-ETH', UNIT, 3000, 0, ts + 100);

      const ethCalls = gateway.emitCandleUpdate.mock.calls.filter(([m]) => m === 'KRW-ETH');
      expect(ethCalls.length).toBe(1);
    });
  });

  describe('bucketKey 동일성 — 봉 교체 감지 기준', () => {
    it('bucketKey가_동일하면_봉_교체_없이_OHLC_갱신', () => {
      const ts1 = minuteBoundaryMs() + 10_000;
      const ts2 = minuteBoundaryMs() + 50_000;

      service.onTrade(MARKET, UNIT, 100, 0, ts1);

      jest.advanceTimersByTime(300);
      service.onTrade(MARKET, UNIT, 200, 0, ts2);

      const calls = gateway.emitCandleUpdate.mock.calls;
      expect(calls.length).toBe(2);
      expect(calls[1][2].open).toBe(100);
    });

    it('bucketKey가_달라지면_봉_교체_발생', () => {
      const ts1 = minuteBoundaryMs();
      const ts2 = minuteBoundaryMs(2);

      service.onTrade(MARKET, UNIT, 100, 0, ts1);

      jest.advanceTimersByTime(300);
      service.onTrade(MARKET, UNIT, 200, 0, ts2);

      expect(gateway.emitCandleUpdate).toHaveBeenCalledTimes(3);
    });
  });
});
