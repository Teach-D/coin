# 도메인 모델 — LiquidationScheduler 이벤트 기반 전환

> 기반: docs/requirements-liquidation-event-driven.md
> 작성일: 2026-05-21

---

## 1. 유비쿼터스 언어 (Ubiquitous Language)

| 용어 | 정의 |
|------|------|
| 강제청산 (Force Liquidation) | 포지션의 손실률이 청산 임계값에 도달했을 때 시스템이 자동으로 포지션을 종료하는 행위 |
| 청산가 (Liquidation Price) | `averagePrice × (1 ± (1/leverage) × 0.9)` — 이 가격에 도달하면 강제청산 실행 |
| 청산 인덱스 (Liquidation Index) | 청산가를 score로, positionId를 member로 가지는 Redis Sorted Set. 가격 범위 조회를 O(log N)으로 지원 |
| 이벤트 기반 감시 (Event-Driven Watch) | 시세가 들어올 때마다 ZRANGEBYSCORE로 청산 대상만 추출하는 방식. 폴링과 달리 이벤트 발생 시에만 실행 |
| 인덱스 재적재 (Index Rebuild) | 서버 재시작 시 DB의 OPEN 포지션 전체를 Redis Sorted Set에 다시 쓰는 초기화 작업 |

---

## 2. 바운디드 컨텍스트

```
[ Order / Position 컨텍스트 ]
  - Position 생명주기 관리
  - 청산 인덱스 등록 / 제거 (Position 상태 전이와 결합)

[ Market 컨텍스트 ]
  - 시세 이벤트 발행 (TickerPubSubSubscriber)
  - 청산 인덱스 조회 (LiquidationService가 이 컨텍스트의 이벤트를 구독)
```

두 컨텍스트는 Redis Pub/Sub 채널(`coin:ticker:broadcast`)을 통해 느슨하게 결합.

---

## 3. 애그리거트

### Aggregate: Position

#### 책임
포지션의 OPEN → CLOSED 상태 전이와 청산가 계산의 일관성을 보호한다.

#### 애그리거트 루트
`Position`

#### 엔티티 & 값 객체

| 구분 | 이름 | 핵심 속성 | 설명 |
|------|------|-----------|------|
| Entity | `Position` | id, userId, ticker, direction, averagePrice, leverage, margin, quantity, status | 청산 감시 대상 |

#### 비즈니스 불변식 (Invariants)

- **INV-01**: `status=CLOSED` 포지션은 다시 OPEN이 될 수 없다
  - 위반 시: `forceClose()` 내부 상태 체크 후 `CoinBattleException(POSITION_ALREADY_CLOSED)` — 낙관적 락(@VersionColumn)이 이중 처리를 DB 레벨에서도 차단

- **INV-02**: 청산가는 `position.liquidationPrice()`가 단독으로 계산하며, 외부에서 임의 주입 불가
  - 위반 시: 청산 인덱스 등록 시 반드시 `position.liquidationPrice()` 반환값 사용

- **INV-03**: 부분 청산(`closeRatio < 1`) 시 포지션은 OPEN을 유지하며 청산 인덱스는 변경하지 않는다
  - 이유: 평균단가가 바뀌지 않으므로 liquidationPrice도 동일. 재등록 불필요

#### 라이프사이클 & 상태 머신

```
OPEN  -[forceClose() / executeSell(closeRatio=1)]→  CLOSED
OPEN  -[executeSell(closeRatio<1)]→  OPEN  (수량/마진 감소, 청산가 불변)
CLOSED  (종료, 변경 불가)
```

#### 트랜잭션 경계

`forceClose()`와 `executeSell()`은 각각 단일 DB 트랜잭션으로 완결.
청산 인덱스 ZREM은 트랜잭션 커밋 **이후** 실행 — DB 롤백 시 인덱스는 유지되어 다음 이벤트에서 재시도 가능.

#### 동시성 고려사항

| 단계 | 방식 | 적용 여부 | 이유 |
|------|------|-----------|------|
| 1 | Redisson 분산 락 | N | 강제청산은 시스템 단독 실행, 사용자 동시 요청 없음 |
| 2 | 낙관적 락 (`@VersionColumn`) | Y | 동일 포지션에 사용자 매도 + 강제청산 동시 도달 시 이중 처리 방지 |
| 3 | 멱등성 키 | Y | `forceClose()` 내부 `status=CLOSED` 체크로 재진입 안전 보장 |

#### 도메인 이벤트

- `PositionClosedByLiquidation`: `forceClose()` 성공 시 발행
  - 구독: `LiquidationService` → Socket.io `user:{userId}` room `LIQUIDATION` emit
  - 구독: `TickerRedisRepository` → `ZREM liq:{ticker}:{direction} {positionId}`

---

## 4. 애그리거트 관계도

```
Position (OPEN) ──────────────────────── Redis Sorted Set
  id (member)                            liq:{ticker}:{LONG|SHORT}
  liquidationPrice() (score)             score = liquidationPrice

TickerPubSubSubscriber ──event──► LiquidationService
  ticker, currentPrice                   ZRANGEBYSCORE → [positionId, ...]
                                         → forceClose(positionId)
```

---

## 5. 도메인 이벤트

| 이벤트명 | 발행 주체 | 발행 시점 | 구독 주체 | 처리 내용 |
|----------|-----------|-----------|-----------|-----------|
| `ticker.updated` (내부 콜백) | `TickerPubSubSubscriber` | Redis Pub/Sub 메시지 수신 시 | `LiquidationService` | ZRANGEBYSCORE → 청산 대상 목록 → forceClose 병렬 실행 |
| `order.filled` (기존) | `OrderService.forceClose()` | 강제청산 Order 저장 후 | `OrderFilledListener` | 랭킹 갱신 (기존 동작 유지) |

---

## 6. 도메인 서비스

### LiquidationService

- **책임**: 시세 이벤트를 구독하고, 청산 인덱스를 조회해 대상 포지션에 강제청산을 실행한다. Position 애그리거트 단독으로 처리 불가능한 "시세 ↔ 포지션" 크로스 컨텍스트 조정 담당
- **관여 애그리거트**: `Position`, `Market(Ticker)`
- **로직 요약**:
  1. `onModuleInit()`: DB OPEN 포지션 전체 → `addLiquidationIndex` 일괄 등록 (재시작 복구)
  2. `onMessage(ticker)`: `getLiquidationCandidates(LONG)` + `getLiquidationCandidates(SHORT)` → `Promise.all(forceClose)`
  3. `forceClose()` 성공 시 Socket.io 청산 알림 emit
- **트랜잭션 전략**: 최종 일관성 — 이벤트 수신 → forceClose(DB 트랜잭션) → ZREM(Redis). 각 단계가 독립적으로 실패 가능하며 재시도로 수렴

---

## 7. 크로스-애그리거트 상호작용

| 상황 | 관여 주체 | 일관성 전략 | 이유 |
|------|----------|-------------|------|
| 시세 수신 → 청산 실행 | Market → Position | 최종 일관성 | 시세와 포지션은 다른 바운디드 컨텍스트. Redis Pub/Sub 이벤트로 느슨한 결합 |
| forceClose 성공 → 인덱스 제거 | Position → Redis | 최종 일관성 | DB 커밋 후 ZREM. 실패 시 잔류 인덱스는 다음 이벤트에서 멱등하게 재처리 |
| 포지션 생성 → 인덱스 등록 | Position(생성) → Redis | 최종 일관성 | executeBuy 트랜잭션 커밋 후 addLiquidationIndex. 실패 시 서버 재시작 재적재로 보완 |

---

## 8. 레포지토리 인터페이스

### PositionRepository (기존, 변경 없음)
```typescript
findAllByStatus(status: PositionStatus): Promise<Position[]>  // onModuleInit 재적재용
findById(id: number): Promise<Position | null>
```

### TickerRedisRepository (신규 메서드 추가)
```typescript
// 청산 인덱스 등록 (ZADD — 동일 member 재등록 시 score 갱신)
addLiquidationIndex(
  positionId: number,
  ticker: string,
  direction: OrderDirection,
  liquidationPrice: number
): Promise<void>

// 청산 인덱스 제거 (ZREM)
removeLiquidationIndex(
  positionId: number,
  ticker: string,
  direction: OrderDirection
): Promise<void>

// 청산 대상 조회 (ZRANGEBYSCORE)
// LONG: 0 ~ currentPrice (liquidationPrice <= currentPrice → 청산)
// SHORT: currentPrice ~ +inf (liquidationPrice >= currentPrice → 청산)
getLiquidationCandidates(
  ticker: string,
  direction: OrderDirection,
  currentPrice: number
): Promise<number[]>  // positionId[]
```

---

## 9. 패키지 구조 제안

```
backend/src/domain/
├── market/
│   └── repository/
│       └── ticker-redis.repository.ts   ← addLiquidationIndex 등 3개 메서드 추가
└── order/
    └── service/
        ├── liquidation.service.ts       ← 신규 (이벤트 기반 감시)
        └── liquidation.scheduler.ts     ← setInterval 제거 후 삭제 또는 빈 클래스 유지
```

---

## 10. 설계 결정 사항 (ADR)

### ADR-01: 청산 인덱스를 Market 도메인의 TickerRedisRepository에 배치
- **결정**: `liq:*` 키 관리 메서드를 `TickerRedisRepository`에 추가
- **이유**: 청산 인덱스는 시세(ticker) 단위로 파티셔닝되며, ticker 키 네이밍 관리가 이미 이 클래스에 집중되어 있음. 별도 `LiquidationRedisRepository` 생성 시 ticker 키 로직 분산
- **trade-off**: Market 도메인 레포지토리가 Order 도메인의 관심사(청산 인덱스)를 일부 담당하게 됨. 규모가 커지면 분리 고려

### ADR-02: 인덱스 ZREM을 DB 트랜잭션 외부(커밋 이후)에서 실행
- **결정**: `position.close()` DB 커밋 후 `removeLiquidationIndex` 호출
- **이유**: DB 롤백 시 Redis에서만 인덱스가 제거되는 불일치 방지. 인덱스 잔류는 다음 이벤트에서 `forceClose() → POSITION_ALREADY_CLOSED` 로 멱등하게 처리됨
- **trade-off**: 커밋과 ZREM 사이 서버 장애 시 인덱스 잔류 가능. 수렴 시간은 다음 시세 이벤트 수신까지

### ADR-03: 재적재 완료 전 이벤트 수신 허용
- **결정**: `onModuleInit` 재적재 완료 전에도 이벤트 수신 콜백 등록
- **이유**: 재적재 도중 들어온 이벤트는 이미 등록된 일부 인덱스에 대해서는 정상 처리됨. 완전 재적재 전까지 일부 누락 가능하나 수용 가능한 수준
- **trade-off**: 재시작 직후 수초간 일부 포지션 감시 공백 존재. 완전한 해결은 재적재 완료 플래그 후 이벤트 처리를 별도 큐에 버퍼링하는 방식이나 복잡도 대비 이득 낮음

---

## 11. 아키텍처 위험 요소

- **Redis Sorted Set 고아 키**: 서버가 `addLiquidationIndex` 직후, `position` DB 저장 전에 죽으면 인덱스에 존재하지 않는 positionId가 등록될 수 있음. `forceClose(positionId)` 내부 `findById → null` 처리로 무해하게 무시됨
- **동일 ticker의 대량 동시 청산**: 급락 시 수백 개 포지션이 동시에 청산 대상이 될 수 있음. `Promise.all(forceClose[])` 병렬 실행 시 DB 커넥션 풀 고갈 위험. 필요 시 청산 대상을 청크(chunk)로 나눠 순차 처리 고려
- **TickerPubSubSubscriber 콜백 블로킹**: `onMessage` 콜백이 `async`이므로 청산 처리가 느릴 경우 콜백이 쌓일 수 있음. 현재 Redis Pub/Sub 단일 subscriber 스레드 구조에서 허용 가능한 수준이나 모니터링 필요

---

## 12. TBD

- [ ] 재적재 중 이벤트 수신 시 감시 공백을 완전히 제거하는 버퍼 큐 방식 — 현재는 수용 가능으로 판단, 추후 재검토
- [ ] 대량 동시 청산 시 청크 처리 — 동시 청산 포지션 수 임계값 기준 설정 필요
