# 실시간 캔들 집계 API 명세서 (Socket.io)

> 연결 URL: `ws://localhost:8080` (VITE_WS_URL)
> 프로토콜: Socket.io (WebSocket)
> 인증: `socket.handshake.auth.token` — 선택 (미인증 연결도 이벤트 수신 가능)

---

## 클라이언트 → 서버: subscribeToTicker (기존 재활용)

candleUpdate를 받기 위해 별도 구독 이벤트 불필요.
기존 `subscribeToTicker` 또는 `subscribeToTickers`로 `ticker:{market}` room에 join되면
해당 room으로 `candleUpdate`도 함께 수신됨.

```json
// 이미 구독 중인 경우 추가 메시지 없음
{ "event": "subscribeToTicker", "data": { "market": "KRW-BTC" } }
```

---

## 서버 → 클라이언트: candleUpdate (신규)

| 항목 | 내용 |
|------|------|
| **이벤트명** | `candleUpdate` |
| **발행 주체** | `MarketGateway` |
| **대상 room** | `ticker:{market}` |
| **발행 조건** | trade 수신 후 250ms throttle 통과 시, 또는 봉 교체 시 즉시 |
| **발행 주기** | 최대 250ms당 1회 (봉 교체 시 예외) |

### Payload

| 필드 | 타입 | 설명 |
|------|------|------|
| `market` | `string` | 마켓 코드 (예: `"KRW-BTC"`) |
| `unit` | `number` | 봉 단위 (분) — `1 \| 3 \| 5 \| 10 \| 15 \| 30 \| 60 \| 240` |
| `open` | `number` | 봉 시가 |
| `high` | `number` | 봉 고가 |
| `low` | `number` | 봉 저가 |
| `close` | `number` | 봉 종가 (최신 체결가) |
| `volume` | `number` | 봉 누적 거래량 |
| `candleStartMs` | `number` | 봉 시작 분 경계 (Unix ms) — `time` 변환: `candleStartMs / 1000` |

```json
{
  "market": "KRW-BTC",
  "unit": 1,
  "open": 95000000,
  "high": 95200000,
  "low": 94900000,
  "close": 95150000,
  "volume": 0.123456,
  "candleStartMs": 1748000400000
}
```

### 클라이언트 처리 예시

```typescript
socket.on('candleUpdate', (payload) => {
  if (payload.market !== currentMarket || payload.unit !== currentUnit) return;
  series.update({
    time: (payload.candleStartMs / 1000) as UTCTimestamp,
    open: payload.open,
    high: payload.high,
    low: payload.low,
    close: payload.close,
  });
});
```

---

## 봉 교체 시 이벤트 흐름

봉 교체가 감지되면 2개의 `candleUpdate`가 연속 발행됨:

1. **완성 봉** — 이전 분봉의 최종 OHLC (throttle 예외, 즉시 발행)
2. **새 봉** — 현재 분봉의 초기 OHLC (`open = high = low = close = tradePrice`)

```json
// 1. 완성 봉
{ "market": "KRW-BTC", "unit": 1, "open": 95000000, "high": 95200000, "low": 94900000, "close": 95190000, "volume": 0.456, "candleStartMs": 1748000400000 }

// 2. 새 봉 (초기화)
{ "market": "KRW-BTC", "unit": 1, "open": 95190000, "high": 95190000, "low": 95190000, "close": 95190000, "volume": 0, "candleStartMs": 1748000460000 }
```

lightweight-charts `series.update()`는 `time`이 이미 존재하면 갱신, 없으면 추가하므로 두 호출 모두 정상 처리됨.

---

## 에러 케이스

| 상황 | 처리 |
|------|------|
| trade 메시지 파싱 실패 | 서버 silent skip — 클라이언트에게 에러 없음 |
| 서버 재시작 | 인메모리 초기화 — 재시작 후 첫 trade까지 `candleUpdate` 없음. 클라이언트는 REST API 초기 캔들 유지 |
| 업비트 WebSocket 재연결 | 기존 재연결 로직 동일 — 재연결 후 trade 재구독 자동 처리 |
| `market`·`unit` 불일치 | 클라이언트 측 필터링으로 처리 — 콜백 미호출 |

---

## 추론 항목

> 코드에 명시되지 않아 도메인 모델 및 기존 코드 패턴으로 추론했습니다.

- `candleStartMs / 1000` → lightweight-charts `UTCTimestamp` 변환 (기존 `CandleRaw.timestamp` 처리 패턴 동일)
- `volume` 필드: 업비트 trade 메시지의 `trade_volume` 필드 매핑 (구현 시 확인 필요)
- 봉단위 전체(`1|3|5|10|15|30|60|240`) 서버 집계 후 클라이언트 필터링 — 서버가 구독 중인 unit을 추적하지 않음
