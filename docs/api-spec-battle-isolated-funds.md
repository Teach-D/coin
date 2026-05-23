# 배틀 격리 자금 API 명세서

> Base URL: `http://localhost:8080/api`
> 인증: 모든 엔드포인트 Bearer Token 필수 (`Authorization: Bearer {accessToken}`)
> 응답 래퍼: `{ "data": T, "message": string }`

---

## 1. 배틀 매수 주문 (배틀룸 전용)

| 항목 | 내용 |
|------|------|
| **메서드** | `POST` |
| **경로** | `/api/battles/:battleId/buy` |
| **인증** | Bearer Token 필수 |
| **설명** | 배틀룸에서 코인을 매수한다. `user.balance` 대신 `session.battleBalance`에서 차감하며, 생성되는 포지션에 `battleId`가 설정된다. |

### Request

#### Path Parameters

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `battleId` | `string (uuid)` | ✅ | 배틀 ID |

#### Request Body

Content-Type: `application/json`

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `idempotencyKey` | `string (max 64)` | ✅ | 클라이언트 UUID — 중복 주문 방지 |
| `ticker` | `string` | ✅ | 코인 티커 (예: `KRW-BTC`). 정규식: `^[A-Z]{2,10}-[A-Z]{2,10}$` |
| `orderType` | `"MARKET" \| "LIMIT"` | ✅ | 주문 유형 |
| `direction` | `"LONG" \| "SHORT"` | ✅ | 매수 방향 |
| `amount` | `number (int, >= 1000)` | ✅ | 주문 금액 (원). 최소 1,000원 |
| `leverage` | `number (int, 1~10)` | ✅ | 레버리지 배수 |
| `limitPrice` | `number (int) \| null` | 조건부 | 지정가 주문 시 필수. LONG은 현재가 이하, SHORT는 현재가 이상 |

```json
{
  "idempotencyKey": "550e8400-e29b-41d4-a716-446655440000",
  "ticker": "KRW-BTC",
  "orderType": "MARKET",
  "direction": "LONG",
  "amount": 100000,
  "leverage": 2,
  "limitPrice": null
}
```

### Response

#### 성공 응답 — `200 OK`

| 필드 | 타입 | 설명 |
|------|------|------|
| `orderId` | `number` | 주문 ID |
| `ticker` | `string` | 코인 티커 |
| `direction` | `string` | 매수 방향 |
| `orderType` | `string` | 주문 유형 |
| `requestedAmount` | `number` | 요청 금액 |
| `executedPrice` | `number \| null` | 체결가 (슬리피지 적용) |
| `executedAmount` | `number \| null` | 실제 체결 금액 |
| `leverage` | `number` | 레버리지 |
| `status` | `"PENDING" \| "FILLED" \| "CANCELLED"` | 주문 상태 |
| `marketPrice` | `number` | 주문 시점 시장가 |
| `slippageRate` | `number` | 슬리피지 비율 |
| `createdAt` | `string (ISO 8601)` | 주문 생성 시각 |

```json
{
  "data": {
    "orderId": 1,
    "ticker": "KRW-BTC",
    "direction": "LONG",
    "orderType": "MARKET",
    "requestedAmount": 100000,
    "executedPrice": 140000000,
    "executedAmount": 100000,
    "leverage": 2,
    "status": "FILLED",
    "marketPrice": 140000000,
    "slippageRate": 0,
    "createdAt": "2026-05-23T10:00:00.000Z"
  },
  "message": "success"
}
```

#### 에러 응답

| 상태 코드 | ErrorCode | 발생 조건 |
|-----------|-----------|-----------|
| `400 Bad Request` | `VALIDATION_FAILED` | 필수 필드 누락 또는 유효성 실패 |
| `400 Bad Request` | `LIMIT_PRICE_REQUIRED` | orderType=LIMIT인데 limitPrice 없음 |
| `400 Bad Request` | `INVALID_LIMIT_PRICE` | 지정가가 시세 기준에 맞지 않음 |
| `400 Bad Request` | `BATTLE_NOT_IN_PROGRESS` | 배틀이 IN_PROGRESS 상태가 아님 |
| `401 Unauthorized` | `INVALID_TOKEN` | 인증 토큰 없음/만료 |
| `403 Forbidden` | `BATTLE_ACCESS_DENIED` | 해당 배틀 참가자가 아님 |
| `404 Not Found` | `BATTLE_NOT_FOUND` | battleId 없음 |
| `404 Not Found` | `TICKER_NOT_FOUND` | 시세 정보 없음 |
| `409 Conflict` | `INSUFFICIENT_BALANCE` | 배틀 잔고 부족 (battleBalance < amount) |
| `409 Conflict` | `DUPLICATE_ORDER` | 동일 idempotencyKey 재전송 |
| `423 Locked` | `ORDER_LOCK_TIMEOUT` | 분산 락 획득 실패 (동시 주문 충돌) |

---

## 2. 배틀 매도 주문 (배틀룸 전용)

| 항목 | 내용 |
|------|------|
| **메서드** | `POST` |
| **경로** | `/api/battles/:battleId/sell` |
| **인증** | Bearer Token 필수 |
| **설명** | 배틀 포지션을 청산한다. 실현 손익은 `session.battleBalance`에 반영된다. `position.battleId`가 이 배틀의 battleId와 일치하는 포지션만 청산 가능하다. |

### Request

#### Path Parameters

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `battleId` | `string (uuid)` | ✅ | 배틀 ID |

#### Request Body

Content-Type: `application/json`

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `idempotencyKey` | `string (max 64)` | ✅ | 클라이언트 UUID — 중복 주문 방지 |
| `positionId` | `number (int)` | ✅ | 청산할 포지션 ID |
| `closeRatio` | `number (0.0001 ~ 1.0)` | ✅ | 청산 비율. 1.0 = 전량 청산 |

```json
{
  "idempotencyKey": "550e8400-e29b-41d4-a716-446655440001",
  "positionId": 42,
  "closeRatio": 1.0
}
```

### Response

#### 성공 응답 — `200 OK`

| 필드 | 타입 | 설명 |
|------|------|------|
| `orderId` | `number` | 주문 ID |
| `positionId` | `number` | 청산된 포지션 ID |
| `ticker` | `string` | 코인 티커 |
| `direction` | `string` | 포지션 방향 |
| `executedPrice` | `number` | 체결가 |
| `executedAmount` | `number` | 청산 금액 |
| `realizedPnl` | `number` | 실현 손익 |
| `leverage` | `number` | 레버리지 |
| `closeRatio` | `string` | 청산 비율 |
| `status` | `"FILLED"` | 주문 상태 |
| `createdAt` | `string (ISO 8601)` | 주문 생성 시각 |

```json
{
  "data": {
    "orderId": 2,
    "positionId": 42,
    "ticker": "KRW-BTC",
    "direction": "LONG",
    "executedPrice": 141000000,
    "executedAmount": 100000,
    "realizedPnl": 1428,
    "leverage": 2,
    "closeRatio": "1.0000",
    "status": "FILLED",
    "createdAt": "2026-05-23T10:05:00.000Z"
  },
  "message": "success"
}
```

#### 에러 응답

| 상태 코드 | ErrorCode | 발생 조건 |
|-----------|-----------|-----------|
| `400 Bad Request` | `VALIDATION_FAILED` | 필수 필드 누락 또는 유효성 실패 |
| `400 Bad Request` | `BATTLE_NOT_IN_PROGRESS` | 배틀이 IN_PROGRESS 상태가 아님 |
| `401 Unauthorized` | `INVALID_TOKEN` | 인증 토큰 없음/만료 |
| `403 Forbidden` | `BATTLE_ACCESS_DENIED` | 해당 배틀 참가자가 아님 |
| `403 Forbidden` | `BATTLE_POSITION_NOT_CLOSEABLE` | 포지션의 battleId가 이 배틀과 다름 (신규 ErrorCode) |
| `404 Not Found` | `BATTLE_NOT_FOUND` | battleId 없음 |
| `404 Not Found` | `POSITION_NOT_FOUND` | positionId 없음 |
| `403 Forbidden` | `POSITION_NOT_OWNED` | 본인 포지션이 아님 |
| `409 Conflict` | `POSITION_ALREADY_CLOSED` | 이미 청산된 포지션 |
| `409 Conflict` | `DUPLICATE_ORDER` | 동일 idempotencyKey 재전송 |
| `423 Locked` | `ORDER_LOCK_TIMEOUT` | 분산 락 획득 실패 |

---

## 3. 배틀 전용 잔고 조회

| 항목 | 내용 |
|------|------|
| **메서드** | `GET` |
| **경로** | `/api/battles/:battleId/my-balance` |
| **인증** | Bearer Token 필수 |
| **설명** | 현재 사용자의 배틀 전용 격리 잔고와 실시간 배틀 평가금액을 반환한다. |

### Request

#### Path Parameters

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `battleId` | `string (uuid)` | ✅ | 배틀 ID |

### Response

#### 성공 응답 — `200 OK`

| 필드 | 타입 | 설명 |
|------|------|------|
| `battleBalance` | `number` | 배틀 격리 잔고 (포지션 미포함 현금) |
| `openPositionValue` | `number` | 배틀 오픈 포지션 현재 평가금액 합계 |
| `totalValuation` | `number` | `battleBalance + openPositionValue` |
| `returnRate` | `number` | 수익률 (%) — `(totalValuation - seedMoney) / seedMoney * 100` |
| `seedMoney` | `number` | 초기 배틀 시드머니 |

```json
{
  "data": {
    "battleBalance": 900000,
    "openPositionValue": 102856,
    "totalValuation": 1002856,
    "returnRate": 0.29,
    "seedMoney": 1000000
  },
  "message": "success"
}
```

#### 에러 응답

| 상태 코드 | ErrorCode | 발생 조건 |
|-----------|-----------|-----------|
| `401 Unauthorized` | `INVALID_TOKEN` | 인증 토큰 없음/만료 |
| `403 Forbidden` | `BATTLE_ACCESS_DENIED` | 해당 배틀 참가자가 아님 |
| `404 Not Found` | `BATTLE_NOT_FOUND` | battleId 없음 |

---

## 4. 기존 엔드포인트 내부 변경사항 (API 시그니처 불변)

### POST /api/battles/:battleId/join (기존)

API 시그니처는 변경 없음. 내부 처리가 변경됨:
- 참가자 세션 저장 시 `session.battleBalance = battle.seedMoney` 초기화

### GET /api/battles/:battleId (기존)

응답 `participants` 배열에 `battleBalance` 필드 추가 가능 (TBD — 요구사항 7.3 참조).

---

## 5. WebSocket 이벤트 (변경 없음)

기존 `rankUpdate` 이벤트의 `currentValuation` 계산 기준이 내부적으로 변경됨:
- **기존**: `user.balance + 모든 오픈 포지션 평가금액`
- **변경**: `session.battleBalance + 해당 배틀 오픈 포지션 평가금액`

프론트엔드 소비 인터페이스(`BattleRankingEntry`)는 변경 없음.

---

## 6. 신규 ErrorCode 목록

구현 시 `error-code.enum.ts`에 추가 필요:

| ErrorCode | HTTP Status | 메시지 |
|-----------|------------|--------|
| `BATTLE_POSITION_NOT_CLOSEABLE` | 403 | `배틀 포지션은 배틀룸에서만 청산할 수 있습니다` |
| `BATTLE_SESSION_NOT_FOUND` | 404 | `배틀 세션을 찾을 수 없습니다` |

---

## 설계 확정 사항

- **배틀 잔고 API**: 별도 엔드포인트 `GET /api/battles/:battleId/my-balance` 사용 (배틀 상세 응답에 미포함)
- **배틀룸 포트폴리오**: 배틀 포지션만 표시 (`position.battleId = battleId` 필터링)
- **BattleSession @VersionColumn**: 추가하지 않음

## 추론 항목

> 아래 항목은 코드에서 명시적으로 확인되지 않아 기존 패턴으로 추론했습니다.

- `POST /api/battles/:battleId/buy` 경로: 기존 `POST /api/orders/buy`와 분리된 배틀 전용 엔드포인트로 설계. `BattleController`에 추가.
- `POST /api/battles/:battleId/sell` 경로: 동일 이유로 `BattleController`에 추가.
- 배틀 매수/매도 응답 구조: 기존 `OrderResponse` 재사용 (추가 필드 없음).
- 분산 락 키: 기존 `user:{userId}:order` 그대로 적용 (배틀 주문도 동일 사용자 락 범위).
