## 2026-05-11

### Backend — 배틀 종료 결과 처리

- [x] `BattleResult.kt` 엔티티 설계 + `BattleResultRepository.kt` (수익률, 승자, 참가자별 최종 평가금액 저장)
- [x] `BattleEndService.kt` 구현 — 배틀 종료 시 수익률 계산, 승자 결정, DB 저장, 랭킹 갱신 트리거
- [x] `GET /api/battles/{battleId}/result` 엔드포인트 추가 (`BattleController.kt`)

### Frontend — 배틀 결과 카드 UI

- [x] `BattleResultCard.tsx` 컴포넌트 — 수익률, 승패 표시, 참가자 순위 목록
- [x] `BattleRoom.tsx` 업데이트 — 배틀 종료 WebSocket 메시지 수신 시 결과 카드 전환
- [x] 결과 카드 공유 버튼 — Web Share API 활용 (`navigator.share`) + 이미지 다운로드 fallback

### Backend — 배틀 실시간 랭킹 브로드캐스트

- [x] `BattleRankingScheduler.kt` 생성 — 5초 간격으로 IN_PROGRESS 배틀 목록 조회
- [x] 참가자별 평가금액 계산 — `user.balance + Σ(openPositions.evaluatedValue(currentPrice))`
- [x] STOMP `/topic/battle/{battleId}` 에 `RANK_UPDATE` 메시지 브로드캐스트

### Frontend — 배틀 실시간 랭킹 확인

- [x] `BattleRoom.tsx` RANK_UPDATE 수신 동작 검증 — 기존 구독 로직 정상 작동 확인 및 필요 시 수정

### Backend — 바이낸스 WebSocket 시세 통합

- [x] `BinanceWebSocketClient.kt` 신규 생성 — 바이낸스 800개+ 글로벌 코인 실시간 수신
- [x] 기존 Pub/Sub 파이프라인 재사용 — `TickerPubSubPublisher` → Redis Pub/Sub → STOMP 브로드캐스트
- [x] 바이낸스 마켓 코드 변환 — `BTCUSDT` → `USDT-BTC` 별도 네임스페이스 처리

### Frontend — 바이낸스 시세 UI 대응

- [x] `MarketListPage.tsx` — USDT 마켓 코인 가격 표시 처리 (`$` 단위 포맷 분기)
- [x] 거래소 구분 배지 또는 마켓 필터 탭 추가 (업비트 / 바이낸스)

### Backend — 펀딩비 정산 구현

- [x] `FundingRateScheduler.kt` 생성 — `@Scheduled(cron = "0 0 0,8,16 * * *")` + `@Async` 8시간 주기
- [x] 오픈 LONG/SHORT 포지션에 펀딩비 부과 로직 구현 (바이낸스 펀딩비 기준 적용)
- [x] 정산 실패 시 로깅 후 계속 진행 (부분 실패 허용)

### Backend — 슬리피지 시뮬레이션

- [x] `OrderService.kt` 주문 금액별 슬리피지 보정 로직 구현 (100만 이하: 없음 / 100만~500만: ±0.05% / 500만~전액: ±0.1~0.3% 랜덤)
- [x] `OrderResponse.kt`에 `executedPrice` 필드 추가 — 슬리피지 적용 체결가 반환

### Backend — 강제청산 WebSocket 알림

- [x] `LiquidationScheduler.kt` 청산 실행 직후 STOMP `/user/{userId}/queue/notification` 에 청산 알림 메시지 발송 추가
- [x] `LiquidationNotificationMessage.kt` DTO 생성 — `ticker`, `liquidatedAt`, `lossAmount` 필드

### Frontend — 포트폴리오 페이지

- [x] `PortfolioPage.tsx` 생성 — 잔고, 오픈 포지션 목록, 평가금액, 거래 내역 표시 (`usePortfolio` 훅 활용)
- [x] `App.tsx` `/portfolio` 라우트에 `PortfolioPage` 연결 (현재 빈 `<div>` 대체)

### Frontend — 배틀 결과 공유 페이지

- [x] `BattleResultPage.tsx` 생성 — `/result/:battleId` 라우트, `BattleResultCard.tsx` 재사용 + `GET /api/battles/{battleId}/result` 호출
- [x] `App.tsx` `/result/:battleId` 라우트에 `BattleResultPage` 연결 (현재 빈 `<div>` 대체)

### Backend — 사용자 프로필 API

- [x] `UserController.kt` `PATCH /api/users/me` 추가 — 닉네임 변경 엔드포인트 (`UpdateProfileRequest.kt` DTO 포함, 닉네임 중복 체크)
- [x] `GET /api/users/me/stats` 추가 — PVP 전적(승/패/승률), 시즌 최고 수익률 반환 (`UserStatsResponse.kt`)

### Frontend — 사용자 프로필 페이지

- [x] `ProfilePage.tsx` 생성 — 닉네임 수정 폼, PVP 전적(승/패/승률), 시즌 최고 수익률 표시
- [x] `App.tsx` `/profile` 라우트 추가 + 상단 네비게이션에 프로필 링크 연결

### Backend — 결과 카드 이미지 생성 파이프라인

- [ ] `BattleCardImageService.kt` 생성 — AWT/BufferedImage 기반 결과 카드 PNG 생성 (수익률, 승패, 참가자 순위 렌더링)
- [ ] `S3StorageService.kt` 생성 — Oracle Object Storage 또는 AWS S3 업로드, CDN 공개 URL 반환
- [ ] `BattleEndService.kt` 수정 — 배틀 종료 후 `@Async` 이미지 생성 트리거 → Redis Pub/Sub `CARD_READY` 메시지로 유저에게 URL 발송

## 2026-05-16

### Backend — 결과 카드 이미지 생성 파이프라인 (이어서)

- [x] `BattleCardImageService.kt` 생성 — AWT/BufferedImage 기반 결과 카드 PNG 생성 (수익률, 승패, 참가자 순위 렌더링)
- [x] `S3StorageService.kt` 생성 — Oracle Object Storage 또는 AWS S3 업로드, CDN 공개 URL 반환
- [x] `BattleEndService.kt` 수정 — 배틀 종료 후 `@Async` 이미지 생성 트리거 → Redis Pub/Sub `CARD_READY` 메시지로 유저에게 URL 발송

### Frontend — 결과 카드 이미지 수신 및 표시

- [x] `BattleRoom.tsx` STOMP `/user/{userId}/queue/notification` 구독 추가 — `CARD_READY` 메시지 수신 시 서버 생성 이미지 URL 저장
- [x] `BattleResultCard.tsx` 수정 — 서버 생성 이미지 URL 있을 경우 `<img>` 태그로 표시, Web Share API에 이미지 URL 포함

### Backend — 친구 초대 배틀 API

- [x] `InviteService.kt` 생성 — UUID 기반 초대 코드 생성, Redis 저장 (TTL 10분), 배틀 상태 검증 (IN_PROGRESS 배틀만 초대 가능)
- [x] `POST /api/battles/{battleId}/invite` 엔드포인트 추가 (`BattleController.kt`) — 초대 코드 생성, `InviteCodeResponse.kt` DTO 반환
- [x] `POST /api/battles/join/{inviteCode}` 엔드포인트 추가 (`BattleController.kt`) — 코드 검증, 배틀 참가 처리 (`BattleMatchingService.kt` 재사용)

### Frontend — 친구 초대 UI

- [x] `BattleRoom.tsx` 초대 버튼 추가 — `POST /api/battles/{battleId}/invite` 호출 후 초대 링크 클립보드 복사 + Web Share API 공유
- [x] `JoinByInvitePage.tsx` 생성 — `/join/:inviteCode` 라우트, 자동 `POST /api/battles/join/{inviteCode}` 호출 후 BattleRoom으로 이동
- [x] `App.tsx` `/join/:inviteCode` 라우트 추가

## 2026-05-19

### Backend — NestJS 빌드 & 기동 검증

- [x] `npm run build` 실행 — TypeScript 컴파일 오류 0건 확인 및 수정 (`backend/`)
- [x] `npm run start:dev` 실행 — 업비트 WebSocket 연결 로그 확인 후 `npm test` 로 단위 테스트 4종 (`order.service.spec.ts`, `position.entity.spec.ts`, `ranking.service.spec.ts`, `battle.service.spec.ts`) 통과 확인

### Frontend — STOMP → Socket.io 전환 (NestJS 연동)

- [x] `frontend/src/lib/stomp.ts` 삭제 → `socket.ts` 신규 생성 — `io(import.meta.env.VITE_WS_URL)` 싱글턴, `connectSocket()` / `disconnectSocket()` / `getSocket()` 익스포트
- [x] `useTickerSubscription.ts` 수정 — STOMP `client.subscribe('/topic/coin/{ticker}')` → `socket.on('ticker', ...)` + `socket.emit('subscribeToTickers', { markets })` 패턴 전환
- [x] `BattleRoom.tsx` 수정 — STOMP `StompSubscription` → Socket.io 이벤트 기반(`rankUpdate`, `battleStarted`, `battleFinished`, `notification`) 수신으로 전환
- [x] `frontend/.env` 수정 — `VITE_WS_URL=http://localhost:3000` (NestJS 포트 3000, Socket.io http:// 프로토콜)

### Backend — OAuth2 소셜 로그인 (Google / Kakao)

- [ ] `google.strategy.ts` 생성 — `passport-google-oauth20` 기반 GoogleStrategy, `UserService.findOrCreateSocialUser()` 호출
- [ ] `kakao.strategy.ts` 생성 — `passport-kakao` 기반 KakaoStrategy, `UserService.findOrCreateSocialUser()` 호출
- [ ] `auth.controller.ts` OAuth2 엔드포인트 추가 — `GET /oauth2/authorization/:provider` (OAuth2Guard 적용) + 콜백 → `/oauth2/callback?accessToken=...&refreshToken=...` 리다이렉트

### Backend — 배틀 매칭 완료 Socket.io 알림

- [x] `market.gateway.ts` 수정 — `handleConnection` 시 JWT 파싱 후 `user:{userId}` room join, `emitToUser(userId, event, data)` 메서드 추가
- [x] `BattleMatchingService.createMatchedBattle()` 수정 — 매칭된 각 참가자에게 EventEmitter `socket.user.matchFound` 이벤트 emit (`{ battleId }` 페이로드)

### Frontend — BattlePage.tsx STOMP 잔재 제거

- [x] `BattlePage.tsx` `MatchQueueModal` 수정 — `connectStomp`/`getStompClient` import 제거, `getSocket()` + `socket.on('matchFound', ...)` 패턴으로 전환 (`useBattleStore.setMatchedBattle(battleId)` 호출)

### Backend — OAuth2 패키지 설치 (선행 작업)

- [ ] `npm install passport-google-oauth20 passport-kakao` + `npm install -D @types/passport-google-oauth20 @types/passport-kakao` 실행
- [ ] `backend/.env` — `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `KAKAO_CLIENT_ID`, `KAKAO_CLIENT_SECRET`, `OAUTH2_REDIRECT_URI` 환경변수 추가 (`.env.example` 동기화)

## 2026-05-20

### Frontend — 전역 바텀 내비게이션 바

- [x] `BottomNavBar.tsx` 컴포넌트 생성 — 4탭 (시세 `/`, 배틀 `/battles`, 랭킹 `/ranking`, 마이페이지 `/profile`), 현재 경로 기준 활성 탭 강조
- [x] `App.tsx` 레이아웃 래퍼 적용 — `/coin/`, `/battles/:id`, `/result/` 딥링크 라우트에서 바텀 바 숨김 처리 (`useLocation` 기반)
- [x] `MarketListPage.tsx` 헤더 정리 — 프로필 아이콘 버튼 제거 (바텀 바 마이페이지 탭으로 대체), 헤더 단순화

### Frontend — 로그인 페이지 리디자인

- [x] `LoginPage.tsx` 수정 — `gray-*` → `zinc-*` + `bg-[#0C0C0D]` 앱 전체 톤으로 통일, 브랜드 로고 스타일을 `MarketListPage` 헤더 gradient와 동일하게 맞춤

### Frontend — BattleResultPage 완료 동선 개선

- [x] `BattleResultPage.tsx` 수정 — 승자 닉네임 강조 UI 추가 (1위에 왕관/뱃지), "다시 배틀" 버튼 (`/battles` 이동) + "시세 보기" 버튼 (`/` 이동) CTA 2개로 구성

### Frontend — ProfilePage 포트폴리오 진입

- [x] `ProfilePage.tsx` 수정 — "내 포트폴리오" 섹션 카드 추가 (`ChevronRight` 아이콘 + `/portfolio` navigate), 시즌 기록 섹션 위에 배치

### Backend — WebSocket 재연결 안정성 개선

- [x] `upbit-websocket.client.ts` / `binance-websocket.client.ts` — `reconnectDelays` 사용 지점에 `Math.random() * 500` Jitter 추가, Thundering Herd 방지

## 2026-05-21

### Backend — LiquidationScheduler: DB 폴링 → Redis Sorted Set + 이벤트 기반 전환

- [ ] `ticker-redis.repository.ts` — 청산 인덱스 메서드 3개 추가: `addLiquidationIndex(positionId, ticker, direction, liquidationPrice)` (ZADD), `removeLiquidationIndex(positionId, ticker, direction)` (ZREM), `getLiquidationCandidates(ticker, direction, currentPrice)` (ZRANGEBYSCORE)
- [ ] `order.service.ts` `executeBuy()` / `upsertPosition()` 수정 — 포지션 저장 후 `addLiquidationIndex` 호출 (신규 생성 시 등록, 평균단가 갱신 시 기존 인덱스 재등록)
- [ ] `order.service.ts` `executeSell()` / `forceClose()` 수정 — `position.close()` 직후 `removeLiquidationIndex` 호출
- [ ] `liquidation.service.ts` 신규 생성 — `OnModuleInit`에서 기존 오픈 포지션 전체를 Redis Sorted Set에 재적재 (서버 재시작 대응), `TickerPubSubSubscriber.onMessage()` 콜백 등록 후 시세 수신 시 `getLiquidationCandidates` → `forceClose` 실행 + Socket.io 청산 알림
- [ ] `liquidation.scheduler.ts` 폴링 제거 — `setInterval` / `checkLiquidations()` 삭제, `liquidation.service.ts`로 역할 이전
- [ ] `order.module.ts` DI 업데이트 — `LiquidationService` provider 등록, 불필요해진 `LiquidationScheduler` 의존성 정리

## 2026-05-22

### Frontend — 캔들 차트 드로잉 도구 구현

- [ ] `DrawingToolbar.tsx` 생성 — 커서/수평선/추세선 도구 선택 버튼 UI (active 상태 강조)
- [ ] `useDrawingTool.ts` 생성 — 활성 도구 상태 + 그려진 선 목록 관리 (`useState` 기반)
- [ ] `CandleChart.tsx` 수정 — `onMouseDown`/`onMouseMove`/`onMouseUp` 이벤트 핸들러 추가, `chart.timeScale().coordinateToTime()` + `series.coordinateToPrice()` 로 픽셀 → 가격/시간 변환
- [ ] 수평선 구현 — `series.createPriceLine({ price, color, lineStyle, lineWidth })` API 활용, 클릭 한 번으로 생성
- [ ] 추세선 구현 — `chart.addSeries(LineSeries)` 두 점 데이터로 직선 렌더링, 클릭 두 번으로 시작점/끝점 지정
- [ ] `CoinDetailPage.tsx` 수정 — `DrawingToolbar` + `CandleChart` 통합, 그려진 선 삭제 버튼(더블클릭 또는 X 버튼) 추가

## 2026-05-23

### Backend — 배틀 격리 자금: DB + 엔티티

- [ ] `1700000005-BattleIsolatedFunds.ts` 마이그레이션 생성 — `battle_sessions.battle_balance BIGINT NOT NULL DEFAULT 0`, `positions.battle_id UUID nullable` 컬럼 추가 + `idx_positions_user_battle` 인덱스
- [ ] `BattleSession` 엔티티에 `battleBalance: number` 필드 추가, `Position` 엔티티에 `battleId: string | null` 필드 추가
- [ ] `BattleSessionRepository.findByParticipantAndBattle(userId, battleId)` 메서드 추가, `PositionRepository.findOpenByUserIdAndBattleId(userId, battleId)` 메서드 추가

### Backend — 배틀 격리 자금: 주문 흐름

- [ ] `BattleMatchingService` — 배틀 참가 세션 저장 시 `session.battleBalance = battle.seedMoney` 초기화
- [ ] `BuyOrderRequest` / `SellOrderRequest` DTO에 `battleId?: string` 추가, `OrderService.executeBuy()` / `executeSell()` — `battleId` 있을 때 `user.balance` 대신 `session.battleBalance` 차감, 생성되는 `position.battleId` 세팅

### Backend — 배틀 격리 자금: 종료 처리

- [ ] `BattleEndService.finishBattleInTransaction()` — 종료 전 배틀 오픈 포지션 시장가 강제 청산 (`position.battleId = battleId` 기준), 청산 손익을 `session.battleBalance`에 반영
- [ ] `BattleEndService.calculateFinalValuation()` 시그니처 변경 → `(session, battle)` — `session.battleBalance + 해당 배틀 포지션 평가금액` 기준으로 수정

### Frontend — 배틀룸 전용 거래 패널

- [ ] `BattleRoom.tsx` — 진행 중 뷰에 코인 선택 드롭다운 + `OrderPanel` 통합, 주문 시 `battleId` 자동 주입
- [ ] `BattleRoom.tsx` — 상단에 배틀 전용 잔고(`battleBalance`) 표시 (`GET /api/battles/:battleId/my-balance` 또는 배틀 상세 응답에 포함)

## 2026-05-24

### DevOps — GCP 백엔드 CI/CD (GitHub Actions + Docker)

- [ ] `backend/Dockerfile` 생성 — NestJS 멀티스테이지 빌드 (`node:20-alpine` builder → runner, `npm ci --only=production` + `dist/` 복사, `EXPOSE 3000`)
- [ ] `backend/.dockerignore` + `docker-compose.prod.yml` 생성 — `node_modules/.env/dist/test` 제외, prod 서비스 정의 (`backend`, `postgres`, `redis`) + `.env.prod` 바인드 마운트
- [ ] GCP VM 환경 세팅 — Docker Engine + Docker Compose v2 설치, `deploy` 유저 생성 + SSH 키 등록, GitHub Secrets(`GCP_SSH_KEY`, `GCP_HOST`, `GCP_USER`) 등록
- [ ] `.github/workflows/backend-deploy.yml` 생성 — `dev` 브랜치 push 트리거 → `docker build & push` (GitHub Container Registry) → GCP VM SSH 접속 → `docker compose -f docker-compose.prod.yml pull && up -d` 무중단 배포

### DevOps — Vercel 프론트엔드 배포

- [ ] `frontend/vercel.json` 생성 — SPA fallback 라우팅 (`"rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]`), Root Directory `frontend/`, Build Command `npm run build`, Output Directory `dist` 설정
- [ ] Vercel 프로젝트 연결 + 환경변수 등록 — GitHub 저장소 import, `VITE_API_URL` (GCP 백엔드 도메인) / `VITE_WS_URL` (Socket.io 도메인) Production·Preview 분리 등록
