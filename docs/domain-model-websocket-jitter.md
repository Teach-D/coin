# 도메인 모델 — WebSocket 재연결 Jitter

> 기반: docs/requirements-websocket-jitter.md
> 작성일: 2026-05-20

---

## 1. 유비쿼터스 언어 (Ubiquitous Language)

| 용어 | 정의 |
|------|------|
| Reconnect Jitter | 재연결 대기 시간에 추가하는 랜덤 지연. 여러 클라이언트가 동시에 재연결을 시도해 서버에 부하가 집중되는 Thundering Herd를 방지한다. |
| Exponential Backoff | 재연결 실패 횟수에 따라 대기 시간을 지수적으로 늘리는 전략 (`reconnectDelays`). |
| Thundering Herd | 다수의 클라이언트가 동시에 재연결을 시도해 외부 API에 요청이 집중되는 현상. |
| Stale Connection | TCP 연결은 살아있으나 데이터 수신이 없는 좀비 연결 (이번 범위 밖). |

---

## 2. 바운디드 컨텍스트

`market` 컨텍스트 내 인프라 레이어 단독 변경.
도메인 레이어(엔티티, 이벤트)와 애플리케이션 레이어(서비스)는 영향 없음.

---

## 3. 애그리거트

이번 변경에 신규 애그리거트 없음.

기존 `market` 컨텍스트 내 인프라 클라이언트만 수정:
- `UpbitWebSocketClient` (`backend/src/domain/market/client/upbit-websocket.client.ts`)
- `BinanceWebSocketClient` (`backend/src/domain/market/client/binance-websocket.client.ts`)

### 수정 대상 메서드

#### `scheduleReconnect()` — 두 클라이언트 공통

**현재 로직**:
```
delay = reconnectDelays[min(attempt, maxIndex)]
attempt++
setTimeout(connect, delay)
```

**변경 후 로직**:
```
delay = reconnectDelays[min(attempt, maxIndex)] + random(0, 500)
attempt++
setTimeout(connect, delay)
```

#### 비즈니스 불변식 (Invariants)
- INV-01: Jitter는 항상 0 이상 500 미만 (ms)
- INV-02: Exponential Backoff 단계(reconnectDelays)는 변경하지 않음
- INV-03: `destroyed = true` 상태에서는 reconnect 호출 자체를 건너뜀 (기존 유지)

---

## 5. 도메인 이벤트

해당 없음 — 재연결 스케줄링은 인프라 레이어 내부 동작이며 도메인 이벤트를 발행하지 않음.

---

## 9. 패키지 구조 제안

변경 파일 위치 (신규 파일 없음):
```
backend/src/domain/market/client/
├── upbit-websocket.client.ts    ← scheduleReconnect() 수정
└── binance-websocket.client.ts  ← scheduleReconnect() 수정
```

---

## 10. 설계 결정 사항 (ADR)

### ADR-01: Jitter 상한값 500ms 고정
- **결정**: `Math.random() * 500` 사용
- **이유**: reconnectDelays 최솟값(1000ms)의 절반 이하로 유지해 지연이 두 배를 넘지 않도록 함
- **trade-off**: 더 큰 Jitter는 분산 효과가 크지만 첫 재연결 지연이 길어짐

### ADR-02: Full Jitter 전략 선택
- **결정**: `[0, maxJitter)` 균등 분포 사용
- **이유**: 구현 단순성. Equal Jitter(`delay/2 + random(0, delay/2)`)는 최솟값을 보장하지만 이 맥락에서 필요하지 않음
- **trade-off**: 이론적으로 Full Jitter가 집계 재연결 비용 최소화에 더 효과적

---

## 11. 아키텍처 위험 요소

- 단일 인스턴스 환경에서는 Jitter 효과 미미 — 다중 인스턴스(수평 확장) 배포 시 효과 발현
- 두 클라이언트(업비트/바이낸스)가 동일 패턴이므로 향후 중복 제거(추상 기반 클래스 도입) 검토 가능 (이번 범위 밖)
