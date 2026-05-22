# 도메인 모델 — trade WebSocket 기반 실시간 캔들 집계

> 기반: docs/requirements-trade-candle-realtime.md
> 작성일: 2026-05-22

---

## 1. 유비쿼터스 언어 (Ubiquitous Language)

| 용어 | 정의 |
|------|------|
| Trade | 업비트 체결 이벤트 — market, price, timestamp를 포함한 원시 데이터 |
| CandleState | 현재 집계 중인 봉의 OHLC 상태 (인메모리 값 객체) |
| CandleUnit | 분봉 단위 — 1·3·5·10·15·30·60·240 중 하나 |
| 봉 교체 | trade timestamp의 분 경계가 현재 봉 시작 시각과 다를 때 발생하는 상태 전이 |
| candleUpdate | Socket.io 이벤트명 — 클라이언트에게 현재 봉 OHLC를 브로드캐스트 |
| Throttle | 마켓별로 250ms 이내 중복 브로드캐스트를 억제하는 시간 제한 |

---

## 2. 바운디드 컨텍스트

```
[ Market 컨텍스트 ]
  UpbitWebSocketClient (trade 구독 추가)
  TradeCandleService   (OHLC 집계 — 도메인 서비스)
  MarketGateway        (candleUpdate 브로드캐스트)
```

이 기능은 기존 `market` 바운디드 컨텍스트 내에서 완결된다. 새 컨텍스트 분리 불필요.

---

## 3. 도메인 서비스

### DomainService: TradeCandleService

#### 책임
마켓·봉단위별 현재 봉 OHLC를 인메모리에서 집계하고, 250ms throttle로 candleUpdate를 브로드캐스트한다.

#### 상태 (인메모리 값 객체)

**CandleState**

| 필드 | 타입 | 설명 |
|------|------|------|
| `open` | number | 봉 시가 — 봉 최초 체결가, 이후 불변 |
| `high` | number | 봉 고가 — trade마다 `Math.max` 갱신 |
| `low` | number | 봉 저가 — trade마다 `Math.min` 갱신 |
| `close` | number | 봉 종가 — 최신 체결가로 항상 갱신 |
| `volume` | number | 봉 누적 거래량 |
| `candleStartMs` | number | 봉 시작 분 경계 (ms) — 봉 교체 감지 기준 |

**저장 구조**

```
candleMap: Map<market, Map<unit, CandleState>>
lastEmitMs: Map<market, number>   ← throttle 제어
```

#### 비즈니스 불변식 (Invariants)

- **INV-01**: 봉 교체 시점 판별
  ```
  bucketKey = Math.floor(tradeTimestamp / (unit * 60_000))
  현재 봉의 bucketKey ≠ 새 trade의 bucketKey → 봉 교체
  ```
  위반 시: 봉 교체 없이 기존 봉에 OHLC 계속 갱신

- **INV-02**: OHLC 갱신 순서
  - open: 봉 최초 설정 후 변경 불가
  - high: `Math.max(state.high, tradePrice)`
  - low: `Math.min(state.low, tradePrice)`
  - close: 매 trade마다 `tradePrice`로 덮어씀

- **INV-03**: 봉 교체 브로드캐스트
  - 교체 직전 완성된 봉을 즉시 emit (throttle 예외)
  - 새 봉 초기화: `open = high = low = close = tradePrice`, `volume = 0`

- **INV-04**: 250ms throttle
  - `Date.now() - lastEmitMs[market] < 250` → emit 생략
  - 봉 교체 시점은 throttle 우선순위 초과 → 즉시 emit

#### 라이프사이클

```
[trade 수신]
    │
    ├─ 봉 없음 ──────────────→ [초기화: open=high=low=close=price, vol=0]
    │
    └─ 봉 있음
         │
         ├─ 같은 봉 (bucketKey 동일) ──→ [OHLC 갱신] ──→ [throttle 통과?] ──→ emit
         │
         └─ 봉 교체 (bucketKey 변경) ──→ [완성 봉 즉시 emit]
                                         → [새 봉 초기화]
                                         → [새 봉 emit]
```

#### 트랜잭션 경계
DB 트랜잭션 없음. 인메모리 단일 스레드(Node.js 이벤트 루프) 보장으로 락 불필요.

#### 동시성 고려사항

| 단계 | 방식 | 적용 여부 | 이유 |
|------|------|-----------|------|
| 1 | Redisson 분산 락 | N | Node.js 단일 스레드 이벤트 루프 |
| 2 | 낙관적 락 (`@VersionColumn`) | N | DB 영속화 없음 |
| 3 | 멱등성 키 | N | 업비트 trade 이벤트는 단방향 스트림 |

> 멀티 인스턴스 배포 시 인메모리 분기 발생 — 현재 Out of Scope, Redis Stream으로 해결 필요

---

## 4. 수정 컴포넌트

### UpbitWebSocketClient (수정)

**책임**: `ticker`·`trade` 두 타입을 하나의 WebSocket 연결에서 병렬 수신

변경점:
```typescript
// 기존 payload (ticker만)
[{"ticket":"coinbattle-server"},{"type":"ticker","codes":[...]}]

// 수정 후 (trade 병렬 추가)
[
  {"ticket":"coinbattle-server"},
  {"type":"ticker","codes":[...]},
  {"type":"trade","codes":[...]}
]
```

`onTrade` 콜백 인터페이스:
```typescript
type TradeCallback = (market: string, price: number, timestamp: number) => void
```

**INV-05**: `type === 'trade'`인 메시지만 `onTrade` 콜백 호출, `type === 'ticker'`는 기존 로직 유지

### MarketGateway (수정)

**책임**: `TradeCandleService`에서 받은 candleUpdate를 Socket.io `ticker:{market}` room에 브로드캐스트

추가 메서드:
```typescript
emitCandleUpdate(market: string, unit: number, candle: CandleState): void
// → this.server.to(`ticker:${market}`).emit('candleUpdate', { market, unit, ...candle })
```

기존 `ticker` 이벤트 처리와 room 재활용 — 별도 구독 메시지 없음.

---

## 5. 도메인 이벤트

이 기능은 `@nestjs/event-emitter` 이벤트를 사용하지 않는다.
`TradeCandleService`가 `MarketGateway`를 직접 주입받아 동기 호출한다.

> 이유: trade 처리→브로드캐스트 사이 비동기 큐 지연이 250ms throttle 기준과 충돌할 수 있음

---

## 6. 컴포넌트 상호작용

```
UpbitWebSocketClient
    │── onMessage(type:'ticker') ──→ TickerRedisRepository + TickerPubSubPublisher (기존)
    └── onMessage(type:'trade')  ──→ TradeCallback
                                         │
                                    TradeCandleService.onTrade(market, price, ts)
                                         │── OHLC 집계
                                         │── throttle 판단
                                         └── MarketGateway.emitCandleUpdate()
                                                  │
                                         Socket.io `ticker:{market}` room
                                                  │
                                         클라이언트 candleUpdate 이벤트
```

---

## 7. 프론트엔드 컴포넌트 설계

### useCandleSubscription (신규 훅)

```typescript
interface UseCandleSubscriptionOptions {
  market: string;
  unit: CandleUnit;
  onUpdate: (candle: CandleData) => void;
}
```

- `connectSocket()` 후 `candleUpdate` 이벤트 리스너 등록
- payload의 `market`·`unit`이 구독 중인 값과 일치할 때만 `onUpdate` 호출
- cleanup: 이벤트 리스너 제거 (room leave 없음 — ticker 구독이 이미 room 관리)

### CandleChart (수정)

```typescript
interface CandleChartProps {
  candles: CandleData[];
  height?: number;
  liveCandle?: CandleData;  // 추가
}
```

`liveCandle` 변경 시 `seriesRef.current?.update(bar)` 호출 — `setData` 재호출 없음

### CoinDetailPage (수정)

```typescript
const [liveCandle, setLiveCandle] = useState<CandleData | undefined>();

useCandleSubscription({
  market: ticker,
  unit: candleUnit,
  onUpdate: setLiveCandle,
});

<CandleChart candles={candles} liveCandle={liveCandle} />
```

---

## 8. 패키지 구조 제안

```
backend/src/domain/market/
├── client/
│   └── upbit-websocket.client.ts    ← trade 구독 추가
├── service/
│   ├── ticker-pubsub.service.ts     (기존)
│   └── trade-candle.service.ts      ← 신규
└── gateway/
    └── market.gateway.ts            ← emitCandleUpdate 추가

frontend/src/
├── hooks/
│   └── useCandleSubscription.ts     ← 신규
├── components/
│   └── CandleChart.tsx              ← liveCandle prop 추가
└── pages/
    └── CoinDetailPage.tsx           ← 훅 연결
```

---

## 9. 설계 결정 사항 (ADR)

### ADR-01: TradeCandleService → MarketGateway 직접 주입 (이벤트 발행 미사용)
- **결정**: `TradeCandleService`가 `MarketGateway`를 constructor injection으로 직접 호출
- **이유**: 250ms throttle 기준과 비동기 이벤트 큐 지연이 충돌 가능. 동기 호출로 타이밍 보장
- **trade-off**: 서비스 간 결합도 증가. trade 처리량이 매우 높아지면 Gateway I/O가 서비스 처리를 블로킹할 수 있음

### ADR-02: ticker:{market} room 재활용
- **결정**: 별도 room 없이 기존 `ticker:{market}` room에 `candleUpdate` 이벤트 추가
- **이유**: 클라이언트가 이미 구독 중인 room 활용 — 추가 구독 메시지 불필요
- **trade-off**: candleUpdate만 필요한 클라이언트도 ticker room에 join해야 함 (현재는 동일 페이지에서 함께 사용하므로 무관)

### ADR-03: 봉단위 = CoinDetailPage에서 결정
- **결정**: 서버는 모든 unit에 대해 집계, 클라이언트가 `unit` 필드로 필터링
- **이유**: 서버가 어떤 봉단위가 구독 중인지 추적할 필요 없음 — 단순화
- **trade-off**: 필요 없는 봉단위 브로드캐스트가 발생. 트래픽 관점에서 수용 가능 (payload 소형)

---

## 10. 아키텍처 위험 요소

- **단일 인스턴스 의존**: 인메모리 집계는 서버 재시작 시 현재 봉 손실. 재시작 후 첫 trade까지 candleUpdate 없음 — 클라이언트는 REST API 초기 캔들을 유지
- **멀티 인스턴스 배포**: 인스턴스마다 다른 OHLC 집계 → 클라이언트가 서로 다른 봉을 수신할 수 있음. 현재 단일 인스턴스 배포이므로 허용, 확장 시 Redis Stream 도입 필요

---

## 11. TBD

- [ ] 지원 봉단위 확정 — 현재 `CandleUnit = 1 | 3 | 5 | 10 | 15 | 30 | 60 | 240` (types/index.ts 기준)
- [ ] 멀티 인스턴스 확장 시 Redis Stream 기반 trade 집계 전략
- [ ] 클라이언트가 봉단위를 변경할 때 기존 liveCandle 초기화 처리
