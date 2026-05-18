# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

**CoinBattle** — 트레이딩 배틀 게임

> "코인 투자 시뮬레이터가 아니라 트레이딩 배틀 게임"

핵심 루프: 10분 PVP 한 판 → 결과 카드 자동 생성 → SNS 공유 → 바이럴 유입

우리가 주는 것: 경쟁 / 자랑 / 승부 / 짧은 도파민
우리가 주지 않는 것: 투자 연습 / 실력 측정 / 리스크 교육

- 원격 저장소: https://github.com/Teach-D/coin-battle.git
- 작성자: 김동현 (Backend Engineer)

## 로컬 개발 환경

```bash
# 인프라 (PostgreSQL + Redis) 시작
docker-compose up -d

# 백엔드
cd backend
npm run start:dev

# 프론트엔드
cd frontend
npm run dev
```

환경변수:
- `backend/.env` — DB/Redis 연결, JWT 시크릿, OAuth2 클라이언트 설정 (`.env.example` 참조)
- `frontend/.env` — `VITE_API_URL`, `VITE_WS_URL`

## 기술 스택

| 영역 | 기술 |
|------|------|
| 프론트엔드 | React 18 (Vite), TailwindCSS, Recharts, Zustand, TanStack Query |
| 모바일 | React 웹뷰 (PWA + 앱 래핑), FCM 푸시 |
| 백엔드 | NestJS 10.x + TypeScript + TypeORM |
| 실시간 통신 | Socket.io Gateway, Redis Pub/Sub |
| 데이터베이스 | PostgreSQL, Redis 7.x |
| 비동기 처리 | @nestjs/event-emitter + EventEmitter2 |
| 외부 시세 | 업비트 WebSocket (원화 200개+), 바이낸스 WebSocket (글로벌 800개+) |
| 배포 | Oracle Cloud Free Tier + Docker + GitHub Actions |
| 모니터링 | Prometheus + Grafana |

## 기술 스택 매핑 (Spring Boot → NestJS)

| Spring Boot / Kotlin | NestJS / TypeScript |
|---|---|
| JPA Entity + @Version | TypeORM Entity + @VersionColumn |
| Spring Security + JWT | @nestjs/passport + passport-jwt |
| Redisson 분산 락 | redlock (ioredis 기반) |
| ApplicationEventPublisher + @Async | @nestjs/event-emitter + EventEmitter2 |
| @Scheduled + Coroutine | @nestjs/schedule + @Cron/@Interval |
| SimpMessagingTemplate (STOMP) | @nestjs/websockets + socket.io rooms |
| Flyway migration | TypeORM migration |
| MockK 단위 테스트 | Jest + mock 단위 테스트 |
| Testcontainers 통합 테스트 | @testcontainers/postgresql + supertest |

## MVP 핵심 기능 5가지

1. **실시간 코인 시세** — 업비트 200개 + 바이낸스 800개+ 동시 수신, 1~3초 브로드캐스트
2. **매수/매도 + 레버리지 + 숏** — 레버리지 1x~10x, 공매도, 시장가/지정가, 분할매수
3. **PVP 배틀 모드** — 1v1/3인/5인, 10분/30분/1시간, 랜덤 매칭 + 친구 초대
4. **단순 수익률 랭킹** — Redis Sorted Set, 전체/데일리/PVP 승률
5. **결과 공유 카드** — 승리 카드, 청산 카드(밈), 데일리/시즌 결산 카드

## 동시성 3단계 방어

| 단계 | 방식 | 역할 |
|------|------|------|
| 1 | redlock 분산 락 (`user:{id}:order`, TTL 3초) | 동시 주문 직렬화 |
| 2 | 낙관적 락 (`@VersionColumn`) | DB 레벨 잔고 이중 차감 방지 |
| 3 | 멱등성 키 (클라이언트 UUID) | 동일 요청 재처리 차단 |

## 주요 설계 결정

### 레버리지별 차등 강제청산
```
청산 기준 손실률 = -(1 / 레버리지) × 0.9

2x → -45%  /  3x → -30%  /  5x → -18%  /  10x → -9%
```

### 슬리피지 시뮬레이션
| 주문 금액 | 체결가 보정 |
|----------|------------|
| 100만원 이하 | 없음 (즉시 체결가) |
| 100만 ~ 500만원 | ±0.05% |
| 500만원 ~ 전액 | ±0.1~0.3% (랜덤) |

### Socket.io Room 기반 실시간
- `ticker:{ticker}` — 시세 브로드캐스트
- `battle:{battleId}` — 배틀 실시간 현황
- `user:{userId}` — 개인 알림

### 랭킹 (Redis Sorted Set)
```
ZADD leaderboard:season {평가금액} {userId}
ZADD leaderboard:daily  {평가금액} {userId}   # 자정 초기화
ZREVRANK  → O(log n) 본인 순위
ZREVRANGEBYSCORE 0 99 → Top 100
```

## 코딩 규칙

- 주석 없음 — 코드로 의도 표현

## 개발 가이드

각 영역별 상세 개발 가이드는 하위 디렉토리 CLAUDE.md 참조:
- `backend/CLAUDE.md` — npm 빌드/테스트 명령어, 패키지 구조, 구현 패턴
- `frontend/CLAUDE.md` — Vite 명령어, 컴포넌트/훅 패턴, 상태 관리

현재 Phase: **Phase 1** (회원/인증, 업비트 시세, 매수/매도, 레버리지+숏, 기본 랭킹)

## 배포 환경

- **VM 1** (NestJS 백엔드): 2 OCPU, 12GB RAM
- **VM 2** (Redis + PostgreSQL): 2 OCPU, 12GB RAM
- Nginx 리버스 프록시 + Let's Encrypt SSL
- Blue-Green 무중단 배포
