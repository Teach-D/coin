# 요구사항 명세 — 배틀 격리 자금 (Battle Isolated Funds)

## 1. 개요

- **기능 목적**: 배틀 참가 시 seedMoney만큼의 격리된 자금을 `BattleSession.battleBalance`에 할당하고, 배틀 내 모든 거래와 평가를 전역 `user.balance` 대신 이 격리 자금 기준으로 처리함으로써 비정상적 수익률(+900%) 문제를 해결한다.
- **핵심 사용자**: USER (배틀 참가자), 시스템 (배틀 종료 스케줄러)
- **범위**
  - In Scope:
    - `BattleSession.battleBalance` 필드 추가 및 초기화 (= seedMoney)
    - `Position.battleId` 필드 추가 (배틀 포지션 vs 일반 포지션 구분)
    - 배틀룸 내 주문 시 `battleBalance` 차감/증감
    - 배틀 종료 시 배틀 포지션 강제 시장가 청산
    - 배틀 랭킹·결과 평가를 `battleBalance + 배틀 포지션 평가금액` 기준으로 변경
    - `BattleRoom.tsx`에 코인 선택 + 주문 패널 통합 (battleId 자동 주입)
    - 배틀룸 상단에 배틀 전용 잔고 표시
  - Out of Scope:
    - 전역 `user.balance` 변경 (배틀 격리 자금은 별도 관리, 전역 잔고에 영향 없음)
    - 배틀 종료 후 잔여 자금의 전역 잔고 이전
    - 실제 자산 입출금, 외부 거래소 연동

---

## 2. 도메인 모델

### 엔티티 목록

| 엔티티 | 핵심 속성 (신규/변경) | 기존 엔티티 참조 |
|--------|----------------------|-----------------|
| `BattleSession` | `battleBalance: number` (신규) | Battle 1:N BattleSession |
| `Position` | `battleId: string \| null` (신규) | User 1:N Position |

### 엔티티 간 관계

- `BattleSession` N:1 `Battle` — 배틀 1개에 여러 참가자 세션
- `Position` N:1 `Battle` (nullable) — 배틀 포지션이면 battleId 보유, 일반 포지션이면 null
- `BattleSession` N:1 `User` (`participantId`)

### 상태 다이어그램 — `BattleSession.battleBalance`

```
참가 시 초기화 (= battle.seedMoney)
    → 매수 주문: battleBalance -= margin
    → 매도 주문: battleBalance += closeMargin + realizedPnl
    → 배틀 종료 강제 청산: battleBalance += returnAmount (max(margin + realizedPnl, 0))
    → 최종 평가: battleBalance + Σ(OPEN 배틀 포지션 평가금액)  [청산 후라면 0]
```

---

## 3. 비즈니스 규칙

1. **BR-01** 배틀 잔고 초기화
   - 조건: 배틀 참가(`joinBattle` / `matchBattle`) 시 `BattleSession` 저장 시점
   - 규칙: `session.battleBalance = battle.seedMoney`

2. **BR-02** 배틀 주문 시 격리 잔고 차감
   - 조건: `BuyOrderRequest.battleId` 값이 존재하는 경우
   - 규칙: `user.balance` 대신 해당 battleId의 `session.battleBalance -= margin`
   - 위반 시: `400 INSUFFICIENT_BALANCE` (battleBalance < margin)

3. **BR-03** 배틀 주문으로 생성된 포지션에 battleId 설정
   - 조건: `BuyOrderRequest.battleId` 값이 존재하는 경우
   - 규칙: 생성/업서트되는 `Position.battleId = request.battleId`
   - 주의: `upsertPosition`에서 기존 포지션 업서트 시, 동일 (ticker, direction)이더라도 `battleId`가 다르면 별도 포지션으로 생성

4. **BR-04** 배틀 매도 시 격리 잔고 반환
   - 조건: 매도되는 `position.battleId`가 존재하는 경우
   - 규칙: `user.balance` 대신 `session.battleBalance += closeMargin + realizedPnl`
   - 세션 조회: `position.battleId`로 해당 유저의 BattleSession 조회

5. **BR-05** 배틀 종료 시 강제 청산
   - 조건: 배틀 status가 FINISHED로 전환되는 시점 (`finishBattleInTransaction`)
   - 규칙: `position.battleId = battle.battleId` AND `position.status = OPEN` 인 모든 포지션을 현재 시장가로 강제 청산
   - 청산 손익은 `session.battleBalance`에 반영 (`user.balance` 변경 없음)
   - idempotencyKey: `battle-end-close:{positionId}` 형식

6. **BR-06** 최종 평가금액 계산 기준 변경
   - 조건: 배틀 랭킹/결과 평가 (`calculateFinalValuation`, `calculateLiveRankings`)
   - 기존: `user.balance + 모든 오픈 포지션 평가금액`
   - 변경: `session.battleBalance + 해당 배틀 오픈 포지션 평가금액`

7. **BR-07** 배틀룸 외부에서 배틀 포지션 접근 불가
   - 조건: 전역 주문 (`battleId` 없음)
   - 규칙: `position.battleId`가 있는 포지션은 일반 매도 API로 청산 불가
   - 위반 시: `403 BATTLE_POSITION_NOT_CLOSEABLE` (또는 기존 POSITION_NOT_OWNED 활용 가능)

8. **BR-08** 배틀 참가자 본인만 배틀 잔고 조회 가능
   - 조건: `GET /api/battles/:battleId/my-balance`
   - 위반 시: `403 BATTLE_ACCESS_DENIED`

---

## 4. 사용자 & 권한

| 역할 | JWT 인증 | 접근 가능 리소스 |
|------|----------|-----------------|
| `USER` | 필요 | 배틀 참가, 배틀 내 주문, 배틀 잔고 조회 (본인만) |
| 시스템 (스케줄러) | 불필요 | 배틀 종료 강제 청산, 랭킹 계산 |

---

## 5. 주요 시나리오

### Happy Path — 배틀 참가 ~ 종료

1. USER가 배틀 참가 → `BattleMatchingService`가 `session.battleBalance = battle.seedMoney` 초기화
2. 배틀 시작 (IN_PROGRESS) → 배틀룸 상단에 `battleBalance` 표시 (초기값 = seedMoney)
3. USER가 배틀룸에서 코인 선택 후 매수 → `BuyOrderRequest.battleId = battleId` 자동 주입
4. 백엔드가 `session.battleBalance -= margin`, `position.battleId = battleId` 저장
5. 랭킹 갱신: `session.battleBalance + 해당 배틀 오픈 포지션 평가금액` → 정상 수익률 표시
6. 배틀 종료 스케줄러 실행 → 배틀 오픈 포지션 강제 청산 → `session.battleBalance` 갱신
7. 최종 평가금액 기준 랭킹 확정, `BattleSession.rank` / `finalValuation` 저장

### 예외 시나리오

| 시나리오 | 처리 방식 |
|----------|-----------|
| 배틀 잔고 부족 (battleBalance < margin) | `400 INSUFFICIENT_BALANCE` |
| 배틀 종료 직전 포지션 청산 시 시세 없음 | `position.averagePrice` 폴백 사용 |
| 강제 청산 중 오류 발생 | 해당 포지션 스킵, 나머지 처리 후 로그 기록 |
| 배틀 포지션을 일반 매도 API로 청산 시도 | `403 BATTLE_POSITION_NOT_CLOSEABLE` |
| 동시 매수 요청 (두 요청이 동시에 battleBalance 차감 시도) | Redisson 분산 락 `user:{id}:order` TTL 3초로 직렬화 |

---

## 6. 비기능 요구사항

- **성능**: 배틀 잔고 조회 응답 100ms 이내 (DB 조회 1회)
- **동시성**:
  - Redisson 분산 락 `user:{id}:order` (TTL 3초) — 동시 배틀 주문 직렬화 (기존 방식 그대로 적용)
  - `@VersionColumn` — `BattleSession.battleBalance` 업데이트 시 낙관적 락 적용 권장
- **실시간**: 랭킹 갱신 시 기존 `rankUpdate` STOMP 브로드캐스트 그대로 사용 (변경 없음)
- **외부 연동**: 배틀 포지션 강제 청산 시 Redis에서 현재 시세 조회 (`TickerRedisRepository.findByMarket`)
- **데이터 보존**: `Position.battleId` nullable — 기존 일반 포지션 데이터 영향 없음

---

## 7. 미결 사항 (TBD)

- [ ] 배틀 종료 후 남은 `session.battleBalance`를 `user.balance`로 이전할지 여부 (현재는 이전 없음)
- [ ] `BattleSession`에 `@VersionColumn` 추가 여부 (낙관적 락 적용 범위)
- [ ] 배틀 잔고 API 엔드포인트 방식: 별도 `GET /api/battles/:battleId/my-balance` vs 배틀 상세 응답에 포함
- [ ] 배틀룸에서 일반 포지션(battleId=null)도 보여줄지, 배틀 포지션만 보여줄지
