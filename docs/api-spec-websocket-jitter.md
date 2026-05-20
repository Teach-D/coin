# WebSocket 재연결 Jitter API 명세서

> 이 변경은 HTTP API 엔드포인트를 추가·수정·삭제하지 않습니다.
> 클라이언트(프론트엔드/모바일)가 호출하는 인터페이스에 변화 없음.

---

## 변경 영향 범위

| 구분 | 변경 여부 | 비고 |
|------|-----------|------|
| HTTP 엔드포인트 | 없음 | — |
| WebSocket 이벤트 (`ticker`, `notification` 등) | 없음 | 수신 데이터 포맷 동일 |
| Redis Pub/Sub 채널 | 없음 | — |
| 환경변수 | 없음 | — |

---

## 내부 동작 변경 (참고용)

### 수정 대상

| 파일 | 메서드 | 변경 내용 |
|------|--------|-----------|
| `backend/src/domain/market/client/upbit-websocket.client.ts` | `scheduleReconnect()` | delay에 `Math.random() * 500` 추가 |
| `backend/src/domain/market/client/binance-websocket.client.ts` | `scheduleReconnect()` | delay에 `Math.random() * 500` 추가 |

### 재연결 타이밍 (변경 후)

| attempt | reconnectDelays | Jitter 범위 | 실제 대기 시간 |
|---------|----------------|-------------|---------------|
| 0 | 1,000ms | 0 ~ 500ms | 1,000 ~ 1,500ms |
| 1 | 2,000ms | 0 ~ 500ms | 2,000 ~ 2,500ms |
| 2 | 4,000ms | 0 ~ 500ms | 4,000 ~ 4,500ms |
| 3 | 8,000ms | 0 ~ 500ms | 8,000 ~ 8,500ms |
| 4 | 16,000ms | 0 ~ 500ms | 16,000 ~ 16,500ms |
| 5+ | 30,000ms | 0 ~ 500ms | 30,000 ~ 30,500ms |
