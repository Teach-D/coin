# 캔들 차트 과거 데이터 확장 API 명세서

> Base URL: `http://localhost:8080/api`

---

## 캔들 데이터 조회 (변경)

| 항목 | 내용 |
|------|------|
| **메서드** | `GET` |
| **경로** | `/api/market/{market}/candles` |
| **인증** | 불필요 |
| **설명** | 특정 마켓의 분봉 캔들 데이터를 조회한다. `pages` 파라미터는 봉 단위별 서버 상한(PagesUpperBound)으로 클램핑된다. |

### Request

#### Path Parameters

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `market` | `String` | ✅ | 업비트 마켓 코드 (예: `KRW-BTC`) |

#### Query Parameters

| 파라미터 | 타입 | 필수 | 기본값 | 설명 |
|---------|------|------|--------|------|
| `unit` | `Int` | ❌ | `1` | 봉 단위 (분). 허용값: 1 / 3 / 5 / 15 / 60 / 240 |
| `count` | `Int` | ❌ | `200` | 페이지당 캔들 수. 업비트 API 최대값은 200 |
| `pages` | `Int` | ❌ | `1` | 조회할 페이지 수. **봉 단위별 PagesUpperBound로 서버에서 클램핑** |

##### PagesUpperBound (서버 클램핑 기준)

| unit | PagesUpperBound | 최대 커버 범위 |
|------|----------------|--------------|
| 1 | 20 | 약 2.8일 |
| 3 | 15 | 약 6.3일 |
| 5 | 10 | 약 7일 |
| 15 | 8 | 약 16.7일 |
| 60 | 10 | 약 83일 |
| 240 | 10 | 약 11개월 |

### Response

#### 성공 응답 — `200 OK`

```json
{
  "data": {
    "market": "KRW-BTC",
    "unit": 1,
    "candles": [
      {
        "market": "KRW-BTC",
        "candleDateTimeUtc": "2026-05-22T05:00:00",
        "candleDateTimeKst": "2026-05-22T14:00:00",
        "openingPrice": 142000000,
        "highPrice": 142500000,
        "lowPrice": 141800000,
        "tradePrice": 142300000,
        "candleAccTradeVolume": 12.345
      }
    ],
    "totalCount": 4000
  },
  "message": "ok"
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `market` | `String` | 마켓 코드 |
| `unit` | `Int` | 봉 단위 (분) |
| `candles` | `CandleRaw[]` | 캔들 배열 (최신순 → 과거순 정렬) |
| `candles[].candleDateTimeUtc` | `String` | 캔들 시작 시각 (UTC, `yyyy-MM-dd'T'HH:mm:ss`) |
| `candles[].candleDateTimeKst` | `String` | 캔들 시작 시각 (KST) |
| `candles[].openingPrice` | `Number` | 시가 |
| `candles[].highPrice` | `Number` | 고가 |
| `candles[].lowPrice` | `Number` | 저가 |
| `candles[].tradePrice` | `Number` | 종가 |
| `candles[].candleAccTradeVolume` | `Number` | 누적 거래량 |
| `totalCount` | `Int` | 실제 수신된 전체 캔들 수 |

#### 에러 응답

| 상태 코드 | 발생 조건 | 응답 예시 |
|-----------|-----------|-----------|
| `404 Not Found` | 존재하지 않는 마켓 코드 | `{"data": null, "message": "TICKER_NOT_FOUND"}` |
| `200 OK (빈 배열)` | 업비트 API 연속 실패 시 수신된 데이터만 반환 | `{"data": {"candles": [], "totalCount": 0}, "message": "ok"}` |

---

## 변경 사항 요약 (이전 대비)

| 항목 | 이전 | 변경 후 |
|------|------|---------|
| `pages` 상한 적용 | 없음 (클라이언트 입력 그대로) | 봉 단위별 PagesUpperBound로 서버 클램핑 |
| 페이지 간 딜레이 | 없음 | 두 번째 페이지부터 100ms 대기 후 요청 |
| 프론트엔드 기본 pages | 1/3분봉: 10, 5/15분봉: 5 | 봉 단위별 PagesUpperBound 값으로 조정 |

---

## 추론 항목

> 아래 항목은 코드에서 명시적으로 확인되지 않아 관례 및 기존 코드 패턴으로 추론했습니다.

- 에러 응답 형식: `GlobalExceptionFilter` 기반 `{"data": null, "message": "{ErrorCode}"}` 패턴 추론
- 업비트 rate limit 초과 시 응답: 서버가 재시도 후 수신된 부분 데이터만 반환 (클라이언트는 200으로 수신)
