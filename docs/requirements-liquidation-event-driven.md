# 요구사항 명세 — LiquidationScheduler 이벤트 기반 전환

## 1. 개요

- **기능 목적**: 강제청산 감시를 1초 주기 DB 풀스캔에서 시세 이벤트 기반으로 전환해 DB 부하를 제거하고 청산 감지 지연을 최소화한다
- **핵심 사용자**: 시스템 (스케줄러 → 이벤트 리스너)
- **범위**
  - In Scope: LiquidationScheduler 폴링 제거, Redis Sorted Set 청산 인덱스 관리, 시세 이벤트 수신 시 청산 실행, 서버 재시작 시 인덱스 재적재
  - Out of Scope: 청산 기준가 변경, 레버리지 정책 변경, 강제청산 알림 UI 변경

---

## 2. 도메인 모델

### 기존 엔티티 활용

| 엔티티 | 관련 필드 | 역할 |
|--------|-----------|------|
| `Position` | id, userId, ticker, direction, averagePrice, leverage, status | 청산 대상 레코드 |
| `Order` | positionId, status=FILLED | forceClose 실행 결과 기록 |

### 신규 Redis 자료구조

| 키 패턴 | 자료구조 | score | member | 용도 |
|---------|----------|-------|--------|------|
| `liq:{ticker}:LONG` | Sorted Set | liquidationPrice (낮을수록 위험) | positionId | LONG 포지션 청산가 인덱스 |
| `liq:{ticker}:SHORT` | Sorted Set | liquidationPrice (높을수록 위험) | positionId | SHORT 포지션 청산가 인덱스 |

**청산 조건**
- LONG: `currentPrice <= liquidationPrice` → `ZRANGEBYSCORE liq:{ticker}:LONG 0 {currentPrice}`
- SHORT: `currentPrice >= liquidationPrice` → `ZRANGEBYSCORE liq:{ticker}:SHORT {currentPrice} +inf`

---

## 3. 비즈니스 규칙

1. **BR-01** 포지션 생성 시 청산 인덱스 등록
   - 조건: `executeBuy()` → `upsertPosition()` 완료 직후
   - 처리: `ZADD liq:{ticker}:{direction} {liquidationPrice} {positionId}`
   - 평균단가 갱신(분할매수) 시 기존 인덱스 덮어쓰기 (`ZADD` 동일 member → score 갱신)

2. **BR-02** 포지션 청산 시 인덱스 제거
   - 조건: `executeSell()` 또는 `forceClose()` 에서 `position.close()` 호출 직후
   - 처리: `ZREM liq:{ticker}:{direction} {positionId}`
   - 부분 청산(`closeRatio < 1`)은 인덱스 유지 (포지션 OPEN 상태 유지)

3. **BR-03** 서버 재시작 시 인덱스 재적재
   - 조건: `LiquidationService.onModuleInit()`
   - 처리: DB에서 `status=OPEN` 전체 포지션 조회 → 각 포지션 `addLiquidationIndex` 일괄 등록
   - 재시작 중 누락된 청산은 재적재 완료 후 즉시 감지

4. **BR-04** 시세 이벤트 수신 시 청산 대상 조회 및 실행
   - 조건: `TickerPubSubSubscriber.onMessage()` 콜백
   - 처리: `getLiquidationCandidates()` → 각 positionId에 대해 `orderService.forceClose()` 비동기 실행
   - `forceClose()` 내부에서 `status=CLOSED` 체크로 멱등성 보장 (이미 청산된 포지션 재처리 안전)

5. **BR-05** 강제청산 알림
   - 조건: `forceClose()` 성공 직후
   - 처리: Socket.io `user:{userId}` room으로 `LIQUIDATION` 이벤트 emit
   - 기존 동작 유지 (LiquidationScheduler에서 이전)

---

## 5. 주요 시나리오

### Happy Path — 포지션 생성 후 청산 감지

1. 유저가 매수 주문 → `executeBuy()` 실행
2. `upsertPosition()` 완료 → `addLiquidationIndex(positionId, ticker, LONG, liquidationPrice)` 호출
3. 시세 업데이트 → Redis Pub/Sub → `TickerPubSubSubscriber.onMessage()` 수신
4. `getLiquidationCandidates(ticker, LONG, currentPrice)` → ZRANGEBYSCORE → 청산 대상 positionId 목록
5. 각 positionId에 대해 `orderService.forceClose()` 실행
6. `position.close()` → `ZREM` 인덱스 제거 → Socket.io 청산 알림

### Happy Path — 서버 재시작 복구

1. 서버 재시작 → `LiquidationService.onModuleInit()` 실행
2. `positionRepository.findAllByStatus(OPEN)` → 전체 오픈 포지션 조회
3. 각 포지션 `addLiquidationIndex` → Redis Sorted Set 재구성
4. 이후 정상 이벤트 수신 흐름으로 전환

### 예외 시나리오

| 시나리오 | 처리 방식 |
|----------|-----------|
| `forceClose()` 실패 | 로그 기록 후 다음 시세 이벤트에서 재시도 (인덱스 미제거) |
| 이미 청산된 포지션이 인덱스에 남아있음 | `forceClose()` 내부 `status=CLOSED` 체크로 무해하게 무시 |
| 시세 공백 (Redis TTL 만료) | 해당 ticker 이벤트 미수신 → 청산 지연, 시세 복구 후 즉시 재감지 |
| 부분 매도 후 잔여 포지션 | `closeRatio < 1` 판단, 인덱스 유지 (평균단가 변동 없으므로 재등록 불필요) |

---

## 6. 비기능 요구사항

- **성능**: 시세 이벤트 수신 → 청산 실행까지 50ms 이내 (폴링 최대 1,000ms 대비)
- **동시성**: `forceClose()` 내부 기존 TypeORM 트랜잭션 + `@VersionColumn` 낙관적 락 유지. 별도 분산 락 불필요 (멱등성 체크로 충분)
- **Redis 키**: `liq:{ticker}:{LONG|SHORT}` — TTL 없음 (포지션 생명주기와 함께 명시적 ZREM으로 관리)
- **비동기**: `forceClose()` 호출은 `Promise.all()` 병렬 실행 (같은 ticker의 여러 청산 대상 동시 처리)
- **외부 연동**: `TickerPubSubSubscriber` 기존 Redis Pub/Sub 파이프라인 재사용 (추가 인프라 없음)
- **데이터 보존**: Position 엔티티 상태 변경 및 Order 레코드 생성은 기존 `forceClose()` 로직 그대로 유지

---

## 7. 미결 사항 (TBD)

- [ ] 서버 재시작 재적재 중 이벤트 수신 시 race condition 처리 방식 (재적재 완료 전 이벤트 수신 가능성)
- [ ] Redis 장애 시 fallback 정책 (현재 시세 파이프라인 자체가 Redis 의존 → 전체 서비스 영향과 동일 범위로 간주 가능)
