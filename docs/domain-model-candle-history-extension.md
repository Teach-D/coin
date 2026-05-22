# 도메인 모델 — 캔들 차트 과거 데이터 확장

> 기반: docs/requirements-candle-history-extension.md
> 작성일: 2026-05-22

---

## 1. 유비쿼터스 언어 (Ubiquitous Language)

| 용어 | 정의 |
|------|------|
| CandlePage | 업비트 REST API 단일 호출로 수신하는 최대 200개의 캔들 묶음 |
| pages | 연속으로 호출하는 CandlePage 수. 봉 단위(unit)별로 상한이 결정된다 |
| unit | 캔들 봉 단위 (분). 1 / 3 / 5 / 15 / 60 / 240 |
| PageDelay | 연속 API 요청 사이에 삽입하는 고정 대기 시간 (100ms) |
| RateLimit | 업비트 비인증 API의 분당 최대 요청 수 제한 (600 req/min) |
| PagesUpperBound | 봉 단위별로 정의된 서버 측 pages 상한값 |

---

## 2. 바운디드 컨텍스트

단일 컨텍스트: **Market**

외부 연동: 업비트 REST API (읽기 전용, 비인증)

---

## 3. 애그리거트

### Aggregate: Market (기존 — 변경 없음)

이 기능은 새로운 애그리거트를 도입하지 않는다.
기존 `Market` 컨텍스트의 **도메인 서비스** (`MarketService`) 내부 로직을 변경한다.

---

## 6. 도메인 서비스

### CandleFetcher (MarketService 내 비즈니스 로직)

- **책임**: 봉 단위별 PagesUpperBound를 초과하는 요청을 클램핑하고, 연속 페이지 호출 사이에 PageDelay를 삽입해 RateLimit 위반을 방지한다.
- **관여 애그리거트**: 없음 (읽기 전용, 외부 API 프록시)
- **로직 요약**:
  1. 요청된 `pages`를 봉 단위별 `PagesUpperBound`로 클램핑한다.
  2. 첫 번째 페이지를 호출한다.
  3. 두 번째 페이지부터 호출 전 100ms 대기한다.
  4. 응답이 빈 배열이면 루프를 종료한다.
  5. 병합된 전체 캔들 배열을 반환한다.
- **트랜잭션 전략**: 트랜잭션 불필요 (외부 읽기 전용)

---

## 10. 설계 결정 사항 (ADR)

### ADR-01: PageDelay를 서버 사이드에 삽입

- **결정**: 딜레이를 백엔드 `MarketService.fetchAllCandles()` 내부에서 관리한다.
- **이유**: 클라이언트가 딜레이를 알 필요가 없으며, 업비트 API 호출 주체가 서버이므로 서버에서 제어하는 것이 자연스럽다.
- **trade-off**: 응답 시간이 pages × 100ms만큼 증가한다. skeleton UI로 보정한다.

### ADR-02: PagesUpperBound를 서버에서 클램핑

- **결정**: 클라이언트가 pages를 임의로 크게 요청해도 서버에서 상한으로 잘라낸다.
- **이유**: 과도한 업비트 API 호출로 인한 RateLimit 위반을 서버에서 통제한다.
- **trade-off**: 클라이언트에서 pages를 동적으로 늘려 무한 스크롤을 구현하는 확장이 서버 정책에 묶인다. (현재 Out of Scope)

### ADR-03: 봉 단위별 PagesUpperBound 값

| unit (분) | PagesUpperBound | 커버 범위 |
|----------|----------------|---------|
| 1 | 20 | ~2.8일 |
| 3 | 15 | ~6.3일 |
| 5 | 10 | ~7일 |
| 15 | 8 | ~16.7일 |
| 60 | 10 | ~83일 |
| 240 | 10 | ~11개월 |

- **이유**: 짧은 봉일수록 데이터 포인트가 조밀해 많은 pages가 필요하지만 총 API 호출 수 상한(20회)을 설정해 최대 지연을 2초 이내로 제한한다.

---

## 11. 아키텍처 위험 요소

- **RateLimit 누적**: 다수 사용자가 동시에 긴 pages를 요청하면 업비트 IP 기반 RateLimit에 걸릴 수 있다. 현재 `pendingCandles` 맵으로 동일 요청 중복을 차단하지만, 다른 market/unit 조합은 독립적으로 발생한다. 향후 트래픽이 늘면 Redis 기반 요청 큐 또는 업비트 인증 키 도입을 검토한다.
- **메모리 캐시 무한 증가**: `candleCache` Map이 market × unit × count × pages 조합별로 항목을 보유한다. pages 상한 변경으로 캐시 항목 수가 증가하지 않으나(동일 파라미터 조합), TTL 만료 후 명시적 삭제가 없어 장시간 운영 시 메모리가 누적된다. LRU 제한 도입을 TBD로 기록한다.

---

## 12. TBD

- [ ] 캐시 항목 수 상한 (LRU eviction) 도입 여부
- [ ] 업비트 인증 API 키 사용으로 RateLimit 상향 여부 (유료)
- [ ] 무한 스크롤 방식 동적 페이지 로딩 (Out of Scope → 향후 검토)
