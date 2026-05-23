# 도메인 모델 — 배틀 격리 자금 (Battle Isolated Funds)

> 기반: docs/requirements-battle-isolated-funds.md
> 작성일: 2026-05-23

---

## 1. 유비쿼터스 언어 (Ubiquitous Language)

| 용어 | 정의 |
|------|------|
| `BattleBalance` | 배틀 참가 시 seedMoney 만큼 BattleSession에 격리된 자금. 전역 `user.balance`와 독립적으로 관리된다. |
| `BattlePosition` | `position.battleId`가 설정된 포지션. 해당 배틀에서 체결된 거래의 결과물이며 일반 포지션과 구분된다. |
| `ForceClose` | 배틀 종료 시 시스템이 모든 BattlePosition을 현재 시장가로 강제 청산하는 행위. |
| `BattleValuation` | `session.battleBalance + Σ(해당 배틀의 OPEN 포지션 평가금액)`. 배틀 내 수익률·랭킹 계산의 기준. |
| `SeedMoney` | 배틀 생성 시 설정된 참가자 초기 자금. 모든 참가자에게 동일하게 격리 배분된다. |

---

## 2. 바운디드 컨텍스트

```
┌─────────────────────────────────────────┐   ┌──────────────────────────────────────┐
│          Battle Context                 │   │          Order Context               │
│                                         │   │                                      │
│  Battle (Aggregate Root)                │   │  Position (Aggregate Root)           │
│  BattleSession (+ battleBalance 신규)   │──▶│    + battleId (nullable, 신규)       │
│                                         │   │  Order                               │
│  BattleOrderService (신규 도메인 서비스) │   │  OrderService                        │
│    → BattleSession 조회 후              │   │    executeBuy(battleContext?) 확장    │
│      OrderService.executeBuy() 호출     │   │                                      │
└─────────────────────────────────────────┘   └──────────────────────────────────────┘
                  BattleModule imports OrderModule (단방향, circular 없음)
```

---

## 3. 애그리거트

### Aggregate: BattleSession (변경)

#### 책임
배틀 참가자의 격리 자금(`battleBalance`)을 보호하고, 매수/매도 거래 시 정확히 차감·증감되도록 일관성을 보장한다.

#### 애그리거트 루트
`BattleSession`

#### 엔티티 & 값 객체

| 구분 | 이름 | 핵심 속성 | 설명 |
|------|------|-----------|------|
| Entity | `BattleSession` | id, battleId, participantId, **battleBalance** (신규), finalValuation, rank, joinedAt | 배틀 참가자 세션. battleBalance가 격리 자금 |

#### 비즈니스 불변식 (Invariants)

- **INV-01**: `battleBalance >= 0` — 잔고가 음수가 될 수 없다
  - 위반 시: `400 INSUFFICIENT_BALANCE` (매수 전 사전 검증)
- **INV-02**: `battleBalance`의 초기값은 정확히 `battle.seedMoney`
  - 위반 시: 참가 로직 버그 — `BattleMatchingService`에서 초기화 보장
- **INV-03**: `battleBalance` 변경은 반드시 분산 락 보호 하에 실행
  - `user:{userId}:order` Redis 락 TTL 3초

#### 라이프사이클

```
참가(join) → battleBalance = seedMoney
    ↓
매수 체결 → battleBalance -= margin
    ↓
매도 체결 → battleBalance += closeMargin + realizedPnl
    ↓
배틀 종료 강제 청산 → battleBalance += max(margin + realizedPnl, 0)  (포지션당)
    ↓
최종 평가 → finalValuation = battleBalance + Σ(OPEN 배틀 포지션 평가금액)
           [강제 청산 완료 후라면 Σ는 0]
```

#### 트랜잭션 경계
`battleBalance` 차감/증감과 `Position` 생성/업데이트는 **단일 DB 트랜잭션**으로 처리해야 한다 (잔고 차감 후 포지션 미생성 상태 방지).

#### 동시성 고려사항

| 단계 | 방식 | 적용 여부 | 이유 |
|------|------|-----------|------|
| 1 | Redisson 분산 락 (`user:{id}:order`, TTL 3초) | Y | 동시 매수로 인한 battleBalance 이중 차감 방지 |
| 2 | 낙관적 락 (`@VersionColumn`) | Y (권장) | BattleSession에 @VersionColumn 추가 권장 — DB 레벨 이중 차감 방어 |
| 3 | 멱등성 키 (클라이언트 UUID) | Y | 기존 idempotencyKey 그대로 적용 |

#### 도메인 이벤트
- **없음** (기존 `order.filled` 이벤트 재사용 — 변경 없음)

---

### Aggregate: Position (변경)

#### 책임
배틀 포지션과 일반 포지션을 `battleId` 필드로 구분하고, 배틀 포지션의 청산 손익이 `battleBalance`로 흐르도록 경계를 명확히 한다.

#### 애그리거트 루트
`Position`

#### 엔티티 & 값 객체

| 구분 | 이름 | 핵심 속성 | 설명 |
|------|------|-----------|------|
| Entity | `Position` | id, userId, ticker, direction, quantity, averagePrice, leverage, margin, status, version, **battleId** (신규, nullable) | battleId가 있으면 배틀 포지션 |

#### 비즈니스 불변식 (Invariants)

- **INV-04**: `battleId`가 설정된 포지션은 일반 매도 API(`POST /api/orders/sell`)로 청산 불가
  - 위반 시: `403 BATTLE_POSITION_NOT_CLOSEABLE`
- **INV-05**: 동일 `(userId, ticker, direction, battleId)`에 대해 OPEN 포지션은 최대 1개
  - battleId가 null인 일반 포지션과 battleId가 있는 배틀 포지션은 별개로 취급

#### 라이프사이클

```
OPEN (battleId=null) → 일반 포지션 — 기존 흐름 유지
OPEN (battleId=uuid) → 배틀 포지션 — 배틀룸에서만 청산 가능
    ↓ (배틀 종료 ForceClose)
CLOSED
```

#### 트랜잭션 경계
배틀 종료 강제 청산 시 포지션별 독립 트랜잭션 처리. 한 포지션 청산 실패가 전체를 막지 않도록 `try-catch`로 격리.

#### 동시성 고려사항

| 단계 | 방식 | 적용 여부 | 이유 |
|------|------|-----------|------|
| 1 | Redisson 분산 락 | Y | 배틀 주문 시 기존 `user:{id}:order` 락 적용 |
| 2 | 낙관적 락 (`@VersionColumn`) | Y (기존) | 이미 `@VersionColumn` 존재 |
| 3 | 멱등성 키 | Y (기존) | 주문 시 클라이언트 UUID, 강제 청산 시 `battle-end-close:{positionId}` |

---

## 4. 애그리거트 관계도

```
Battle ──1:N──▶ BattleSession (battleBalance 보유)
                    │
                    │ participantId = userId
                    ▼
                   User (balance는 배틀과 독립)

Position (battleId nullable)
    ├── battleId = null   → 일반 포지션 (User에 귀속)
    └── battleId = uuid   → 배틀 포지션 (Battle + BattleSession에 귀속)
```

---

## 5. 도메인 이벤트

| 이벤트명 | 발행 주체 | 발행 시점 | 구독 주체 | 처리 내용 |
|----------|-----------|-----------|-----------|-----------|
| `order.filled` | `OrderService` | 배틀 주문 체결 시 | `OrderFilledListener` | 랭킹 갱신 (기존 그대로) |
| `battle.finished` | `BattleEndService` | 배틀 종료 시 | `BattleFinishedListener` | 결과 카드 생성 등 (기존 그대로) |

> 신규 이벤트 없음. 기존 이벤트 파이프라인 재사용.

---

## 6. 도메인 서비스

### BattleOrderService (신규 — BattleModule에 추가)

- **책임**: 배틀룸 내 매수/매도 요청을 받아 BattleSession에서 격리 잔고를 확인하고 OrderService에 위임
- **관여 애그리거트**: `BattleSession`, `Position`, `Order`, `User`
- **로직 요약**:
  1. `BattleSessionRepository.findByParticipantAndBattle(userId, battleId)` 로 세션 조회
  2. `session.battleBalance >= margin` 검증
  3. `OrderService.executeBuy(userId, request, battleContext)` 호출 — `battleContext: { battleId, session }` 전달
  4. 트랜잭션 내부: `session.battleBalance -= margin`, `position.battleId = battleId` 설정
- **트랜잭션 전략**: 단일 트랜잭션 (OrderService의 기존 트랜잭션 내에서 처리)

### BattleEndService.forceCloseBattlePositions (기존 서비스 메서드 추가)

- **책임**: 배틀 종료 시 `position.battleId = battleId` AND `position.status = OPEN` 포지션 전체 시장가 청산
- **관여 애그리거트**: `Position`, `BattleSession`
- **로직 요약**:
  1. `PositionRepository.findOpenByUserIdAndBattleId(userId, battleId)` 로 배틀 포지션 조회
  2. 각 포지션에 대해 `TickerRedisRepository.findByMarket(ticker)` 로 현재가 조회
  3. PnL 계산 후 `session.battleBalance += max(margin + realizedPnl, 0)`
  4. `position.close()` 호출
  5. 청산 Order 저장 (idempotencyKey: `battle-end-close:{positionId}`)
- **트랜잭션 전략**: 포지션별 독립 try-catch (한 포지션 실패가 전체를 막지 않음)

---

## 7. 크로스-애그리거트 상호작용

| 상황 | 관여 애그리거트 | 일관성 전략 | 이유 |
|------|----------------|-------------|------|
| 배틀 매수: battleBalance 차감 + Position 생성 | BattleSession + Position | 강한 일관성 (단일 트랜잭션) | 차감 후 포지션 미생성 상태 방지 |
| 배틀 종료 강제 청산 | Position + BattleSession | 강한 일관성 (포지션별 트랜잭션) | 각 청산이 독립적으로 완결 |
| 배틀 랭킹 계산 | BattleSession + Position | 최종 일관성 (읽기 전용) | 5초 주기 스케줄러, 정확도보다 반응성 우선 |

---

## 8. 레포지토리 인터페이스

### BattleSessionRepository (추가 메서드)
```typescript
findByParticipantAndBattle(userId: number, battleId: string): Promise<BattleSession | null>
```

### PositionRepository (추가 메서드)
```typescript
findOpenByUserIdAndBattleId(userId: number, battleId: string): Promise<Position[]>
findByUserIdAndTickerAndDirectionAndBattleIdAndStatus(
  userId: number, ticker: string, direction: OrderDirection,
  battleId: string | null, status: PositionStatus
): Promise<Position | null>
```

---

## 9. 패키지 구조 제안

```
src/domain/
├── battle/
│   ├── entity/
│   │   └── battle-session.entity.ts  ← battleBalance 필드 추가
│   ├── service/
│   │   ├── battle-matching.service.ts  ← session.battleBalance 초기화
│   │   ├── battle-end.service.ts       ← forceCloseBattlePositions 추가
│   │   └── battle-order.service.ts     ← 신규: 배틀 전용 주문 처리
│   ├── controller/
│   │   └── battle.controller.ts        ← 배틀 주문 엔드포인트 추가
│   └── dto/
│       └── battle-order-request.dto.ts ← 신규: BattleBuyOrderRequest
└── order/
    ├── entity/
    │   └── position.entity.ts  ← battleId 필드 추가
    ├── dto/
    │   └── order-request.dto.ts  ← battleId optional 추가 (내부 전달용)
    └── service/
        └── order.service.ts  ← executeBuy에 battleContext 파라미터 추가
```

---

## 10. 설계 결정 사항 (ADR)

### ADR-01: OrderService vs BattleOrderService — 배틀 주문 처리 위치

- **결정**: `BattleModule`에 `BattleOrderService`를 신규 생성하고, `OrderService.executeBuy`에 `battleContext` 파라미터를 추가하여 위임
- **이유**: `BattleModule`이 이미 `OrderModule`을 import하므로 단방향 의존을 유지할 수 있다. `OrderService`에서 `BattleSessionRepository`를 직접 주입하면 `OrderModule → BattleModule` circular dependency가 발생한다.
- **trade-off**: `OrderService.executeBuy` 시그니처가 변경되지만 `battleContext` 파라미터가 optional이므로 기존 일반 주문 흐름에 영향 없음

### ADR-02: position.battleId nullable 필드 vs BattlePosition 별도 엔티티

- **결정**: `Position` 엔티티에 `battleId: string | null` nullable 필드 추가
- **이유**: 기존 Position 관련 코드(청산 스케줄러, 강제청산 서비스, 포트폴리오 조회) 변경을 최소화. 별도 엔티티는 코드 중복과 복잡도를 높임.
- **trade-off**: Position 테이블에 null이 많아지지만 인덱스(`idx_positions_user_battle`)로 배틀 포지션 조회 성능 보장

### ADR-03: upsertPosition — battleId별 포지션 분리

- **결정**: `upsertPosition`에서 기존 포지션 조회 시 `battleId` 조건을 추가. `(userId, ticker, direction, OPEN, battleId)` 5개 조건으로 업서트 기준 변경.
- **이유**: 동일 코인을 일반 계정과 배틀 계정에서 모두 LONG 포지션 보유 시 혼용되면 안 됨.
- **trade-off**: `upsertPosition` 시그니처 변경 필요

---

## 11. 아키텍처 위험 요소

- **Circular Dependency**: `OrderModule ← BattleModule` 단방향 유지가 필수. `OrderService`에 `BattleSessionRepository`를 직접 주입하면 circular 발생. → `BattleOrderService` 패턴으로 해결 (ADR-01)
- **강제 청산 부분 실패**: 배틀 종료 시 포지션 강제 청산이 일부 실패하면 해당 포지션의 가치가 최종 평가에서 누락됨. → 포지션별 try-catch + 에러 로깅, 실패한 포지션은 `position.averagePrice` 폴백으로 처리 권장
- **BattleSession @VersionColumn 미적용**: 현재 BattleSession에 낙관적 락이 없어 분산 락만으로 동시성 방어 중. 배틀 내 빠른 연속 주문 시 battleBalance 이중 차감 가능성 존재. → @VersionColumn 추가 권장

---

## 12. TBD

- [ ] 배틀 종료 후 `session.battleBalance` 잔여금을 `user.balance`로 이전 여부 (현재 미이전)

### 확정된 결정 사항

- **배틀 잔고 API**: 별도 엔드포인트 `GET /api/battles/:battleId/my-balance` 사용
- **배틀룸 포트폴리오 뷰**: 배틀 포지션만 표시 (일반 포지션 표시 안 함)
- **BattleSession @VersionColumn**: 추가하지 않음 — 분산 락(`user:{id}:order`)으로 충분
