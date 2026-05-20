# 요구사항 명세 — WebSocket 재연결 Jitter

## 1. 개요

- **기능 목적**: 다중 서버 인스턴스 또는 재시작 시, 업비트/바이낸스 WebSocket 클라이언트가 동시에 재연결을 시도해 거래소 API에 부하가 집중되는 Thundering Herd 문제를 Jitter로 방지한다.
- **핵심 사용자**: 시스템 (WebSocket 클라이언트 내부 재연결 스케줄러)
- **범위**
  - In Scope: `UpbitWebSocketClient.scheduleReconnect()`, `BinanceWebSocketClient.scheduleReconnect()` — 재연결 지연에 최대 500ms 랜덤 Jitter 추가
  - Out of Scope: 재연결 지연값(reconnectDelays) 변경, 최대 재시도 횟수 제한, Stale Connection 감지, 배치 브로드캐스트

## 3. 비즈니스 규칙

1. **BR-01** Jitter 범위
   - 조건: `scheduleReconnect()` 호출 시 항상 적용
   - 규칙: 실제 대기 시간 = `reconnectDelays[attempt]` + `Math.random() * 500` (단위: ms)
   - 결과: 동일 reconnectDelays 단계에서도 최대 500ms 산포 보장

2. **BR-02** 기존 Exponential Backoff 유지
   - 조건: BR-01과 병행 적용
   - 규칙: reconnectDelays 배열 값 및 attempt 증가 로직 변경 없음

## 5. 주요 시나리오

### Happy Path

1. 업비트/바이낸스 WebSocket 연결이 끊어짐 (`close` 이벤트)
2. `scheduleReconnect()` 호출 — `delay = reconnectDelays[attempt] + Math.random() * 500`
3. 지정 시간 후 `connect()` 재실행
4. 다중 서버 인스턴스가 동시에 close될 경우, 각 서버는 서로 다른 시각에 재연결 시도

### 예외 시나리오

| 시나리오 | 처리 방식 |
|----------|-----------|
| Jitter 추가 후에도 연결 실패 | 기존 Exponential Backoff 로직으로 재시도 |
| `destroyed = true` 상태 | reconnect 호출 자체를 건너뜀 (기존 로직과 동일) |

## 6. 비기능 요구사항

- **성능**: setTimeout 1회 추가 비용만 발생 — 무시 수준
- **동시성**: 단일 인스턴스 내 race condition 없음; Jitter 효과는 다중 인스턴스 환경에서 발현
- **외부 연동**: 업비트 (`wss://api.upbit.com/websocket/v1`), 바이낸스 (`wss://stream.binance.com:9443`) 재연결 부하 분산
