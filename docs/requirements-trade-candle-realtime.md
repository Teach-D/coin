# 요구사항 명세서 — trade WebSocket 기반 실시간 캔들 집계

## 1. 개요

- **기능 목적**: 업비트 WebSocket의 `trade`(체결) 이벤트를 실시간 수신해 서버 인메모리에서 OHLC 캔들을 집계하고, Socket.io를 통해 클라이언트 캔들 차트를 실시간으로 업데이트한다.
- **핵심 사용자**: 시스템 (업비트 WebSocket → 서버 집계 → Socket.io 브로드캐스트), USER (캔들 차트 수신)
- **범위**
  - In Scope: trade 구독 추가, 인메모리 OHLC 집계, 봉 교체 감지, Socket.io `candleUpdate` 브로드캐스트, 프론트 수신 훅, CandleChart 실시간 업데이트
  - Out of Scope: 과거 캔들 DB 영속화, 바이낸스 trade 구독, 분봉 이외 단위(일봉/주봉) 집계, Redis 캐시

---

## 2. 도메인 모델

### 인메모리 자료구조

| 구조 | 타입 | 설명 |
|------|------|------|
| `CandleState` | 인메모리 객체 | 현재 집계 중인 봉의 OHLC 상태 |
| `candleMap` | `Map<market, Map<unit, CandleState>>` | 마켓·봉단위별 현재 봉 보관 |

### CandleState 필드

| 필드 | 타입 | 설명 |
|------|------|------|
| `open` | number | 봉 시가 (첫 체결가) |
| `high` | number | 봉 고가 (갱신 중) |
| `low` | number | 봉 저가 (갱신 중) |
| `close` | number | 봉 종가 (= 최신 체결가) |
| `timestamp` | number | 봉 시작 시각 (분 경계 ms) |
| `volume` | number | 봉 누적 거래량 |

### 관련 기존 컴포넌트

- `UpbitWebSocketClient` — 기존 `ticker` 구독 유지, `trade` 구독 병렬 추가
- `MarketGateway` — 기존 `ticker:{market}` room 재활용해 `candleUpdate` 이벤트 추가
- `CandleChart` — lightweight-charts 기반 기존 컴포넌트에 `liveCandle` prop 추가

---

## 3. 비즈니스 규칙

1. **BR-01** `ticker`와 `trade` 구독 병렬 운영
   - 조건: `onModuleInit` 시점에 두 구독을 하나의 WebSocket 연결에 함께 송신
   - 기존 `ticker` 처리 로직은 변경하지 않는다

2. **BR-02** 봉 교체 감지 — 분 경계 기준
   - 조건: `Math.floor(tradeTimestamp / (unit * 60_000))` 값이 현재 봉과 다를 때 새 봉 시작
   - 교체 시 완성된 봉을 한 번 더 브로드캐스트 후 새 봉으로 교체

3. **BR-03** OHLC 갱신 규칙
   - open: 봉 최초 체결가 (이후 변경 없음)
   - high: `Math.max(current.high, tradePrice)`
   - low: `Math.min(current.low, tradePrice)`
   - close: 최신 체결가로 항상 갱신

4. **BR-04** 250ms throttle 브로드캐스트
   - 조건: 마켓별로 마지막 emit 이후 250ms 이내 수신된 trade는 브로드캐스트 생략
   - 봉 교체 시점은 throttle 예외 — 즉시 브로드캐스트

5. **BR-05** 클라이언트 필터링 — market·unit 기준
   - `candleUpdate` 이벤트 payload에 `market`, `unit` 포함
   - 클라이언트는 구독 중인 market·unit과 일치하는 이벤트만 처리

6. **BR-06** 서버 재시작 시 인메모리 상태 초기화
   - 재시작 후 첫 trade 수신 시 해당 시점으로 봉 초기화 (과거 복원 없음)

---

## 4. 사용자 & 권한

| 역할 | JWT 인증 | 접근 |
|------|----------|------|
| `GUEST` (비인증) | 불필요 | `candleUpdate` 이벤트 수신 가능 (Socket.io 연결 허용) |
| `USER` | 선택 | 동일 |

---

## 5. 주요 시나리오

### Happy Path — 실시간 캔들 업데이트

1. 업비트 WebSocket에서 `trade` 타입 메시지 수신 (`code`, `trade_price`, `trade_timestamp` 포함)
2. `TradeCandleService.onTrade(market, price, timestamp)` 호출
3. `candleMap`에서 해당 market·unit 봉 조회
4. 봉 교체 감지 — 분 경계가 바뀌면 완성 봉 emit 후 새 봉 초기화, 아니면 OHLC 갱신
5. 250ms throttle 통과 시 `MarketGateway.emitCandleUpdate(market, unit, candleState)` 호출
6. Gateway가 `ticker:{market}` room에 `candleUpdate` 이벤트 브로드캐스트
7. 프론트 `useCandleSubscription(market, unit, onUpdate)` 콜백 호출
8. `CoinDetailPage`가 `liveCandle` state 업데이트 → `CandleChart`에 전달
9. `CandleChart`가 lightweight-charts `series.update(bar)` 실행

### 예외 시나리오

| 시나리오 | 처리 방식 |
|----------|-----------|
| trade 메시지 파싱 실패 | 로그 없이 skip (ticker와 동일한 패턴) |
| market·unit 봉이 아직 없음 | 첫 trade로 봉 초기화 (open = high = low = close = price) |
| 클라이언트가 다른 market 구독 중 | `market`·`unit` 필드 불일치 → 콜백 미호출 |
| WebSocket 재연결 | 기존 재연결 로직 그대로 — 재연결 후 trade 재구독 |

---

## 6. 비기능 요구사항

- **성능**: trade 메시지 처리 지연 < 1ms (인메모리 연산), 브로드캐스트 지연 < 250ms (throttle 기준)
- **동시성**: 단일 프로세스 인메모리 집계 — 분산 락 불필요. 멀티 인스턴스 배포 시 Redis Pub/Sub 확장 필요 (현재 Out of Scope)
- **실시간**: Socket.io `ticker:{market}` room 재활용, `candleUpdate` 이벤트명 신규
- **외부 연동**: 업비트 WebSocket `trade` 타입 (기존 `ticker` 연결과 동일 소켓)
- **메모리**: `Map<market, Map<unit, CandleState>>` — KRW 200개 마켓 × 최대 6 봉단위 = 최대 1,200개 객체 (무시 가능)

---

## 7. 미결 사항 (TBD)

- [ ] 지원할 봉단위(unit) 목록 확정 — 현재 기획: 1, 3, 5, 15, 30, 60분
- [ ] 멀티 인스턴스 배포 시 인메모리 집계 동기화 전략 (Redis Stream 등)
- [ ] 바이낸스 trade 구독 연동 (Out of Scope, 추후 검토)
