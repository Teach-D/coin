# CoinBattle Backend — CLAUDE.md

> 전체 프로젝트 개요, 아키텍처 흐름, 설계 결정은 루트 `../CLAUDE.md`를 참조하라.

## 빌드 및 실행

```bash
npm run build            # TypeScript 컴파일
npm run start:dev        # 개발 서버 (hot reload)
npm run start            # 프로덕션 실행
npm test                 # 단위 테스트 (test/unit/)
npm run test:integration # 통합 테스트 (test/integration/, Docker 필요)
npm run test:cov         # 커버리지 포함 단위 테스트
```

## 패키지 구조

```
src/
├── main.ts
├── app.module.ts
├── common/
│   ├── config/
│   │   ├── database.config.ts   ← TypeORM DataSource (migration CLI용)
│   │   └── redis.config.ts      ← ioredis RedisService
│   ├── dto/
│   │   └── api-response.dto.ts
│   ├── exception/
│   │   ├── error-code.enum.ts
│   │   ├── coin-battle.exception.ts
│   │   └── global-exception.filter.ts
│   ├── guard/
│   │   └── jwt-auth.guard.ts
│   └── util/
│       ├── aes-encryptor.ts
│       └── jwt-provider.ts
└── domain/
    ├── user/
    ├── market/
    ├── order/
    ├── battle/
    └── ranking/
```

## 클래스명 규칙

| 역할 | 규칙 | 예시 |
|------|------|------|
| 엔티티 (TypeORM) | `{Domain}` (파일: `{domain}.entity.ts`) | `User`, `Order` |
| Enum | 파일: `{domain}.entity.ts` 내 inline | `OrderStatus`, `BattleStatus` |
| Repository | `{Domain}Repository` | `OrderRepository` |
| Service | `{Domain}Service` | `OrderService` |
| Controller | `{Domain}Controller` | `OrderController` |
| Gateway | `{Domain}Gateway` | `BattleGateway` |
| Scheduler | `{Domain}Scheduler` | `LiquidationScheduler` |
| Request DTO | `{동사}{Domain}Request` | `BuyOrderRequest` |
| Response DTO | `{Domain}Response` | `BattleResponse` |
| 이벤트 | `{Domain}{과거형}Event` | `OrderFilledEvent`, `BattleFinishedEvent` |
| 리스너 | `{Domain}{과거형}Listener` | `OrderFilledListener` |

## Redis 키 네이밍

| 키 | 용도 | TTL |
|---|---|---|
| `coin:price:{ticker}` | 시세 캐시 | 3초 |
| `user:{id}:order` | redlock 분산 락 | 3초 |
| `order:idempotency:{key}` | 중복 주문 방지 | 주문 TTL |
| `leaderboard:season` | 시즌 랭킹 Sorted Set | 영구 |
| `leaderboard:daily` | 일별 랭킹 Sorted Set | 하루 |
| `leaderboard:pvp-winrate` | PVP 승률 랭킹 | 영구 |
| `battle:{id}:snapshot` | 배틀 기준가 스냅샷 | 배틀 종료 후 |
| `battle:invite:{code}` | 초대 코드 → battleId 매핑 | 10분 |

## 핵심 구현 패턴

### 분산 락 (redlock)
```typescript
const lock = await this.redlock.acquire([`user:${userId}:order`], 3000);
try {
  return await this.executeBuy(userId, request);
} finally {
  await lock.release().catch(() => {});
}
```

### 이벤트 발행/수신 (EventEmitter2)
```typescript
// 발행
this.eventEmitter.emit('order.filled', new OrderFilledEvent(...));

// 수신
@OnEvent('order.filled')
async handle(event: OrderFilledEvent) { ... }
```

### Socket.io Room 기반 브로드캐스트
```typescript
// 시세
this.server.to(`ticker:KRW-BTC`).emit('ticker', tickerData);
// 배틀
this.server.to(`battle:${battleId}`).emit('battleUpdate', data);
// 개인 알림
this.server.to(`user:${userId}`).emit('notification', data);
```

## TypeORM 마이그레이션

```bash
# 마이그레이션 실행
npm run migration:run
# 마이그레이션 롤백
npm run migration:revert
```

마이그레이션 파일: `migrations/`
- `1700000001-InitSchema.ts` — users 테이블
- `1700000002-OrderPositionSchema.ts` — orders, positions 테이블
- `1700000003-BattleSchema.ts` — battles, battle_sessions 테이블
- `1700000004-BattleResultColumns.ts` — final_valuation, rank 컬럼 추가

## 테스트 전략

### 테스트 소스셋

| 경로 | 태스크 | Docker | 속도 |
|------|--------|--------|------|
| `test/unit/` | `npm test` | 불필요 | 빠름 |
| `test/integration/` | `npm run test:integration` | 필요 | 느림 |

### 단위 테스트 대상
- `OrderService` — 슬리피지 계산, 잔고 검증, 멱등성 키 중복 처리
- `Position` entity — liquidationPrice(), unrealizedPnl()
- `RankingService` — Redis Sorted Set 점수 계산 로직
- `BattleService` — 매칭 로직, 배틀 종료 조건

### 통합 테스트 대상
- `OrderService` — 분산 락 + 낙관적 락 동시성 시나리오
- `AuthController` — 회원가입/로그인 전체 흐름
- `MarketService` — Redis 시세 캐시 저장/조회

## 주요 설정값

- 초기 잔고: 10,000,000원
- JWT access 만료: 1시간 (3600000ms)
- JWT refresh 만료: 7일 (604800000ms)
- 펀딩비 주기: 8시간 (00:00/08:00/16:00 UTC)

## 코딩 규칙

- 주석 없음 — 코드로 의도 표현
- TypeScript strict null checks 활성화
- 비즈니스 로직은 Entity 또는 Service — Controller는 얇게 유지
- `@nestjs/event-emitter`의 `@OnEvent`로 이벤트 처리 (비동기)
