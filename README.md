# CoinBattle

> "코인 투자 시뮬레이터가 아니라 트레이딩 배틀 게임"

10분 안에 승부가 나는 실시간 트레이딩 PVP 게임입니다.
승리 카드로 자랑하고, 청산 카드로 웃고, SNS로 공유하세요.

- 원격 저장소: https://github.com/Teach-D/coin-battle.git
- 작성자: 김동현 (Backend Engineer)

## 어떤 게임인가요

- **10분 한 판 PVP** — 1v1 / 3인 / 5인, 10분·30분·1시간 모드
- **실시간 시세** — 업비트 원화 200개 + 바이낸스 800개 코인
- **레버리지 & 숏** — 1x ~ 10x, 공매도, 시장가/지정가, 분할매수
- **랭킹** — 시즌 / 데일리 / PVP 승률
- **결과 카드** — 승리·청산·시즌 결산 카드 자동 생성 후 SNS 공유

## 기술 스택

**Backend**

- NestJS 10 + TypeScript
- TypeORM + PostgreSQL 16
- ioredis + Redlock (분산 락)
- `@nestjs/event-emitter` (비동기 이벤트)
- `@nestjs/schedule` (Cron / Interval)
- Passport (JWT, Google OAuth2, Kakao OAuth2)
- Socket.io Gateway (WebSocket)
- 업비트·바이낸스 WebSocket 시세 수신

**Frontend**

- React 19 + Vite 8 + TypeScript
- TailwindCSS 3
- Zustand 5 (클라이언트 상태)
- TanStack Query 5 (서버 상태)
- `@stomp/stompjs` (실시간 구독)
- lightweight-charts (캔들 차트)
- Recharts (통계 차트)
- react-router-dom 7

**Infra**

- Docker / docker-compose
- GitHub Actions (`.github/workflows/backend.yml`, `frontend.yml`)
- Oracle Cloud Free Tier (VM 2대: 앱 / DB)
- Nginx + Let's Encrypt, Blue-Green 무중단 배포
- Prometheus + Grafana

## 프로젝트 구조

```
coin-battle-2/
├── backend/                NestJS API 서버
│   ├── src/
│   │   ├── common/         config, exception, guard, util
│   │   ├── domain/
│   │   │   ├── user/       회원, OAuth2 로그인, JWT
│   │   │   ├── market/     업비트/바이낸스 시세 수신 + Gateway
│   │   │   ├── order/      매수/매도, 레버리지, 청산, 포트폴리오
│   │   │   ├── battle/     PVP 매칭, 배틀 진행, 결과 카드
│   │   │   └── ranking/    Redis Sorted Set 랭킹
│   │   ├── app.module.ts
│   │   └── main.ts
│   ├── migrations/         TypeORM 마이그레이션
│   └── test/               unit / integration
├── frontend/               React (Vite) 클라이언트
│   └── src/
│       ├── lib/            axios, stomp 싱글턴
│       ├── store/          Zustand 스토어
│       ├── hooks/          TanStack Query / STOMP 훅
│       ├── components/     UI 컴포넌트
│       ├── pages/          라우트 페이지
│       └── types/          도메인 타입
├── docs/                   요구사항 / 도메인 모델 / API 명세
├── docker-compose.yml      로컬 인프라 (Postgres + Redis)
├── docker-compose.prod.yml 배포용
└── CLAUDE.md               프로젝트 컨벤션 & 설계 노트
```

## 시작하기

### 1. 인프라 (PostgreSQL + Redis)

```bash
docker-compose up -d
```

### 2. 백엔드

```bash
cd backend
cp .env.example .env      # DB / Redis / JWT / OAuth2 값 채우기
npm install
npm run migration:run     # 최초 1회
npm run start:dev         # http://localhost:8080
```

### 3. 프론트엔드

```bash
cd frontend
cp .env.example .env
npm install
npm run dev               # http://localhost:5173
```

### 환경변수 요약

- `backend/.env` — DB / Redis / JWT / AES / Google·Kakao OAuth2 / S3 (`backend/.env.example` 참조)
- `frontend/.env` — `VITE_API_URL`, `VITE_WS_URL`

## 개발 명령어

**Backend**

```bash
npm run start:dev         # 개발 서버 (hot reload)
npm run build             # TypeScript 컴파일
npm test                  # 단위 테스트 (test/unit/)
npm run test:integration  # 통합 테스트 (Docker 필요, testcontainers)
npm run test:cov          # 커버리지
npm run lint              # ESLint
npm run migration:run     # 마이그레이션 실행
npm run migration:revert  # 마이그레이션 롤백
```

**Frontend**

```bash
npm run dev
npm run build             # tsc -b && vite build
npm run lint
npm run preview
```

## 핵심 설계 포인트

### 동시성 3단계 방어

| 단계 | 방식 | 역할 |
|------|------|------|
| 1 | Redlock 분산 락 (`user:{id}:order`, TTL 3초) | 동시 주문 직렬화 |
| 2 | 낙관적 락 (`@VersionColumn`) | 잔고 이중 차감 방지 |
| 3 | 멱등성 키 (클라이언트 UUID) | 동일 요청 재처리 차단 |

### 레버리지별 강제청산 기준

```
청산 기준 손실률 = -(1 / 레버리지) × 0.9

2x → -45%   3x → -30%   5x → -18%   10x → -9%
```

### 슬리피지 시뮬레이션

| 주문 금액 | 체결가 보정 |
|-----------|------------|
| 100만원 이하 | 없음 |
| 100만 ~ 500만원 | ±0.05% |
| 500만원 초과 | ±0.1 ~ 0.3% |

### 실시간 채널

- `ticker:{ticker}` — 시세 브로드캐스트
- `battle:{battleId}` — 배틀 실시간 현황
- `user:{userId}` — 개인 알림

### 랭킹 (Redis Sorted Set)

```
leaderboard:season       시즌 랭킹 (영구)
leaderboard:daily        일별 랭킹 (자정 초기화)
leaderboard:pvp-winrate  PVP 승률 랭킹

ZREVRANK              → 본인 순위  O(log n)
ZREVRANGEBYSCORE 0 99 → Top 100
```

### 주요 설정값

- 초기 잔고: 10,000,000원
- JWT access 만료: 1시간
- JWT refresh 만료: 7일
- 펀딩비 주기: 8시간 (00:00 / 08:00 / 16:00 UTC)

## 배포

- **VM 1** — NestJS 백엔드 (2 OCPU, 12GB RAM)
- **VM 2** — Redis + PostgreSQL (2 OCPU, 12GB RAM)
- Nginx 리버스 프록시 + Let's Encrypt SSL
- GitHub Actions로 이미지 빌드 → Docker Hub 푸시 → 원격 배포
- Blue-Green 무중단 배포
- Health check: `GET /health`

## 문서

세부 컨벤션·설계는 각 문서 참조:

- [`CLAUDE.md`](CLAUDE.md) — 프로젝트 전체 개요와 설계 결정
- [`backend/CLAUDE.md`](backend/CLAUDE.md) — 백엔드 패키지 구조, 구현 패턴, Redis 키
- [`frontend/CLAUDE.md`](frontend/CLAUDE.md) — 프론트엔드 폴더 구조, 훅 패턴, 라우팅
- [`docs/`](docs/) — 기능별 `requirements-*` / `domain-model-*` / `api-spec-*`
