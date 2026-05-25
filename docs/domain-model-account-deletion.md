# 도메인 모델 — 회원탈퇴 (Account Deletion)

> 기반: docs/requirements-account-deletion.md  
> 작성일: 2026-05-25

---

## 1. 유비쿼터스 언어 (Ubiquitous Language)

| 용어 | 정의 |
|------|------|
| 회원탈퇴 (Withdrawal) | 사용자가 CoinBattle 계정을 영구 종료하는 행위. Soft Delete + 개인정보 익명화로 처리 |
| 익명화 (Anonymization) | 탈퇴 시 개인식별 정보(email, profileImageUrl, nickname, providerId)를 지워 재식별 불가 상태로 만드는 작업 |
| 탈퇴자 (WithdrawnUser) | `deletedAt != null`인 User. 모든 인증 엔드포인트에서 `USER_NOT_FOUND`로 간주 |
| 비배틀 포지션 (FreePosition) | `position.battleId === null`인 포지션. 탈퇴 시 강제 CLOSED |
| 배틀 무효화 (BattleVoid) | `battle.status === IN_PROGRESS`인 배틀을 VOID 상태로 전환. 탈퇴자 이탈로 진행 불가 판단 |

---

## 2. 바운디드 컨텍스트

```
┌─ Auth Context ──────────────────────────────┐
│  User (익명화 + Soft Delete)                 │
│  회원탈퇴 오케스트레이션                      │
└──────────────────────────────────────────────┘
        │ ID 참조              │ ID 참조
        ↓                      ↓
┌─ Order Context ──┐   ┌─ Battle Context ──────────────────┐
│  Position (OPEN  │   │  Battle (IN_PROGRESS → VOID)       │
│    → CLOSED)     │   │  Battle (WAITING → Hard Delete)    │
└──────────────────┘   └────────────────────────────────────┘
        │
        ↓
┌─ Ranking Context ──────────────────┐
│  Redis Sorted Set 엔트리 제거       │
└─────────────────────────────────────┘
```

단일 요청에서 Auth / Order / Battle / Ranking 컨텍스트 모두에 걸치는 오케스트레이션이므로 `AccountDeletionService` 도메인 서비스가 트랜잭션 경계를 책임진다.

---

## 3. 애그리거트

### Aggregate A: User (회원탈퇴 핵심)

#### 책임
개인정보를 즉시 익명화하고 `deletedAt`을 기록해 계정 비활성화 불변식을 보호한다.

#### 애그리거트 루트
`User`

#### 엔티티 & 값 객체

| 구분 | 이름 | 핵심 속성 | 설명 |
|------|------|-----------|------|
| Entity (Root) | `User` | id, email(nullable), nickname, profileImageUrl(nullable), provider, providerId(nullable→nullable 변경), role, balance, deletedAt(신규) | 탈퇴 시 개인정보 필드 null 처리 + deletedAt 기록 |

#### 스키마 변경

| 컬럼 | 변경 전 | 변경 후 |
|------|---------|---------|
| `provider_id` | `NOT NULL` | `NULL 허용` |
| `deleted_at` | 없음 | `TIMESTAMPTZ NULL` 추가 |

#### 비즈니스 불변식 (Invariants)

- **INV-01**: `deletedAt !== null`인 User는 인증이 필요한 모든 엔드포인트에서 `USER_NOT_FOUND` (404) 처리.
  - 위반 방지: `UserService`의 모든 `findById` 조회 결과에 `deletedAt` 체크 추가
- **INV-02**: 탈퇴 시 `email`, `profileImageUrl`, `providerId`는 반드시 `null`로 초기화되어야 한다.
  - 위반 시: 개인정보 잔류 — DB 트랜잭션 내에서 atomically 처리
- **INV-03**: 탈퇴 후 `nickname`은 `"(탈퇴한 사용자)"`로 고정되어야 한다.
  - BattleSession 등 참조 화면에서 탈퇴자를 식별 가능하게 함

#### 신규 도메인 메서드 — `User.withdraw(): void`

```
호출자: AccountDeletionService.withdraw()
처리:
  this.email = null
  this.profileImageUrl = null
  this.providerId = null
  this.nickname = "(탈퇴한 사용자)"
  this.deletedAt = new Date()
반환: void
```

#### 라이프사이클 & 상태 머신

```
[ACTIVE] deletedAt = null
   │
   └─[withdraw()]──→  [WITHDRAWN] deletedAt = NOW()
                         nickname = "(탈퇴한 사용자)"
                         email = null
                         profileImageUrl = null
                         providerId = null
                         (복구 불가)
```

#### 동시성 고려사항

| 단계 | 방식 | 적용 여부 | 이유 |
|------|------|-----------|------|
| 1 | Redisson 분산 락 | N | 탈퇴는 본인 계정만 가능, 중복 요청은 INV-01로 차단 |
| 2 | 낙관적 락 (`@VersionColumn`) | Y (기존) | User 엔티티에 이미 `@VersionColumn` 존재, 추가 작업 불필요 |
| 3 | 멱등성 키 | N | DELETE는 멱등성 키 불필요 (재시도 시 INV-01 → 404 반환) |

#### 도메인 이벤트

- **`UserWithdrawnEvent`**: `User.withdraw()` 호출 + DB 커밋 후 발행
  - payload: `{ userId: number, battleIdsToVoid: string[], battleIdsToDelete: string[] }`
  - 구독: `BattleGateway` → 각 배틀룸에 Socket.io 이벤트 브로드캐스트
  - 처리 방식: `@OnEvent('user.withdrawn')` — 트랜잭션 외부 실행 (Socket.io는 롤백 불필요)

---

### Aggregate B: Position (비배틀 포지션 강제 청산)

#### 책임
탈퇴 시 `battleId === null`인 OPEN 포지션을 트랜잭션 내에서 즉시 CLOSED로 전환한다.

#### 애그리거트 루트
`Position`

#### 비즈니스 불변식 (Invariants)

- **INV-04**: 탈퇴 처리 중 `position.battleId === null && position.status === OPEN`인 포지션은 모두 CLOSED 처리되어야 한다.
  - 처리: 기존 `position.close()` 메서드 재활용
  - 잔고(balance) PnL 정산 불필요 — 계정 소멸로 인해 잔고 의미 없음

#### 동시성 고려사항

| 단계 | 방식 | 적용 여부 | 이유 |
|------|------|-----------|------|
| 1 | Redisson 분산 락 (`user:{id}:order`) | Y (재활용 고려) | 탈퇴와 동시 주문 입력 레이스 방지. 탈퇴 트랜잭션 시작 전 order 락 획득 권장 |
| 2 | 낙관적 락 | Y (기존) | Position에 `@VersionColumn` 이미 존재 |
| 3 | 멱등성 키 | N | 탈퇴는 단방향 처리 |

---

### Aggregate C: Battle (배틀 정리)

#### 책임
탈퇴자가 연루된 배틀을 상태에 따라 VOID 또는 Hard Delete로 처리한다.

#### 애그리거트 루트
`Battle`

#### 비즈니스 불변식 (Invariants)

- **INV-05**: 탈퇴자가 `hostUserId`인 `WAITING` 배틀은 Hard Delete.
  - 처리: 기존 `BattleService.deleteBattle()` 로직 재활용 (redlock, 세션 삭제 → 배틀 삭제)
- **INV-06**: 탈퇴자가 참가 중인 `IN_PROGRESS` 배틀은 VOID.
  - 처리: `battle.void()` 메서드 재활용
- **INV-07**: 탈퇴자가 참가자(비방장)인 `WAITING` 배틀은 BattleSession만 삭제.
  - 처리: 해당 참가자의 BattleSession만 Hard Delete, Battle 자체는 유지 (`currentParticipants--`)

#### 라이프사이클 (탈퇴 영향)

```
WAITING (hostUserId=탈퇴자) ──[탈퇴]──→ Hard Delete
WAITING (participantId=탈퇴자) ──[탈퇴]──→ BattleSession Hard Delete, Battle 유지
IN_PROGRESS (참가자=탈퇴자) ──[탈퇴]──→ VOID
```

#### 동시성 고려사항

| 단계 | 방식 | 적용 여부 | 이유 |
|------|------|-----------|------|
| 1 | Redisson 분산 락 (`battle:{battleId}:join`) | Y (재활용) | 탈퇴 중 다른 유저의 참가 차단 |
| 2 | 낙관적 락 (`@VersionColumn`) | Y (기존) | Battle에 이미 존재 |
| 3 | 멱등성 키 | N | |

---

## 4. 애그리거트 관계도

```
User (Root) ──ID 참조──→ Position.userId    (비배틀 포지션 강제 청산)
User (Root) ──ID 참조──→ Battle.hostUserId  (WAITING 배틀 Hard Delete)
User (Root) ──ID 참조──→ BattleSession.participantId  (IN_PROGRESS 배틀 탐색)
Battle (Root) ──1:N──→ BattleSession  (battle_id FK)
```

---

## 5. 도메인 이벤트

| 이벤트명 | 발행 주체 | 발행 시점 | 구독 주체 | 처리 내용 |
|----------|-----------|-----------|-----------|-----------|
| `UserWithdrawnEvent` | `AccountDeletionService` | DB 커밋 후 (`@TransactionalEventListener(AFTER_COMMIT)`) | `BattleGateway` | VOID 배틀: `battle:{id}` 룸에 `battle.voided` 브로드캐스트 / 삭제 배틀: `battle:{id}` 룸에 `battle.deleted` 브로드캐스트 |
| `UserWithdrawnEvent` | `AccountDeletionService` | DB 커밋 후 | `RankingService` | `leaderboard:daily`, `leaderboard:pvp-winrate`, `pvp:stats:{userId}` Redis 키 제거 |

> Redis 제거와 Socket.io 브로드캐스트는 트랜잭션 외부 — 실패해도 DB 롤백 없음. 실패 시 로그 기록.

---

## 6. 도메인 서비스

### AccountDeletionService.withdraw(userId: number): Promise\<void\>

- **책임**: User 탈퇴 처리의 전체 오케스트레이션 — 포지션 청산 → 배틀 정리 → 사용자 익명화 → 이벤트 발행
- **관여 애그리거트**: `User`, `Position`, `Battle`, `BattleSession`
- **로직 요약**:
  1. `user:{userId}:order` redlock 획득 (동시 주문 차단)
  2. `UserRepository.findById(userId)` — 없거나 `deletedAt != null` 이면 `USER_NOT_FOUND`
  3. `PositionRepository.findOpenNonBattleByUserId(userId)` → 각 포지션에 `position.close()`
  4. `BattleRepository.findWaitingByHostUserId(userId)` → 각 배틀에 BattleSession 삭제 + 배틀 Hard Delete
  5. `BattleRepository.findWaitingByParticipantId(userId)` → 해당 BattleSession 삭제 + `battle.currentParticipants--`
  6. `BattleSessionRepository.findInProgressBattleIdsByParticipantId(userId)` → 각 배틀에 `battle.void()`
  7. `user.withdraw()` 호출 → `UserRepository.save(user)`
  8. 커밋 → `eventEmitter.emit('user.withdrawn', event)` 발행
  9. redlock 해제
- **트랜잭션 전략**: 3~7번 스텝은 단일 트랜잭션. Redis 제거와 Socket.io는 커밋 후 이벤트 리스너에서 처리.

---

## 7. 크로스-애그리거트 상호작용

| 상황 | 관여 애그리거트 | 일관성 전략 | 이유 |
|------|----------------|-------------|------|
| 포지션 강제 청산 | User → Position | 강한 일관성 (단일 트랜잭션) | 포지션 미청산 상태로 계정 소멸 방지 |
| WAITING 배틀 삭제 | User → Battle → BattleSession | 강한 일관성 (단일 트랜잭션) | FK 제약 순서 보장 |
| IN_PROGRESS 배틀 VOID | User → Battle | 강한 일관성 (단일 트랜잭션) | 배틀 상태 일관성 |
| Redis 랭킹 제거 | User → Ranking | 최종 일관성 (이벤트) | Redis는 롤백 불가, 실패 허용 |
| Socket.io 브로드캐스트 | User → BattleGateway | 최종 일관성 (이벤트) | 커밋 후 통지, 실패 무시 가능 |

---

## 8. 레포지토리 인터페이스

### UserRepository (기존 + 신규)

```typescript
// 기존
findById(id: number): Promise<User | null>
save(user: User): Promise<User>

// 신규 — deletedAt 필터 포함
findActiveById(id: number): Promise<User | null>  // deletedAt IS NULL 조건 추가
```

### PositionRepository (기존 + 신규)

```typescript
// 신규
findOpenNonBattleByUserId(userId: number): Promise<Position[]>
// WHERE user_id = ? AND status = 'OPEN' AND battle_id IS NULL
```

### BattleRepository (기존 + 신규)

```typescript
// 기존
findById(battleId: string): Promise<Battle | null>
save(battle: Battle): Promise<Battle>
delete(battleId: string): Promise<void>

// 신규
findWaitingByHostUserId(hostUserId: number): Promise<Battle[]>
// WHERE host_user_id = ? AND status = 'WAITING'

findInProgressByParticipantId(userId: number): Promise<Battle[]>
// JOIN battle_sessions ON battle_id WHERE participant_id = ? AND status = 'IN_PROGRESS'

findWaitingByParticipantId(userId: number): Promise<Battle[]>
// JOIN battle_sessions ON battle_id WHERE participant_id = ? AND status = 'WAITING' AND host_user_id != userId
```

### BattleSessionRepository (기존 + 신규)

```typescript
// 기존
deleteByBattleId(battleId: string): Promise<void>

// 신규
deleteByParticipantIdAndBattleId(participantId: number, battleId: string): Promise<void>
```

---

## 9. 패키지 구조 제안

```
src/
└── domain/
    ├── user/
    │   ├── entity/
    │   │   └── user.entity.ts              ← deletedAt 컬럼, providerId nullable, withdraw() 메서드 추가
    │   ├── service/
    │   │   ├── user.service.ts             ← findById 계열에 deletedAt 체크 추가
    │   │   ├── account-deletion.service.ts ← 신규: Phase 1 탈퇴 오케스트레이션
    │   │   └── account-purge.scheduler.ts  ← 신규: Phase 2 완전 삭제 스케줄러
    │   ├── controller/
    │   │   └── auth.controller.ts          ← DELETE /api/users/me 엔드포인트 추가
    │   ├── event/
    │   │   └── user.event.ts               ← UserWithdrawnEvent 신규
    │   └── repository/
    │       └── user.repository.ts          ← findActiveById(), findWithdrawnBefore() 추가
    ├── order/
    │   └── repository/
    │       ├── position.repository.ts      ← findOpenNonBattleByUserId(), deleteByUserIds() 추가
    │       └── order.repository.ts         ← deleteByUserIds() 추가
    └── battle/
        ├── repository/
        │   ├── battle.repository.ts        ← findWaitingByHostUserId 등 추가
        │   └── battle-session.repository.ts ← deleteByParticipantIdAndBattleId() 추가
        └── gateway/
            └── battle.gateway.ts           ← user.withdrawn 이벤트 → battle.voided 브로드캐스트 추가
```

---

## 10. 설계 결정 사항 (ADR)

### ADR-01: 2단계 삭제 전략 (Soft Delete → 완전 삭제)

- **결정**: Phase 1(즉시) — User 익명화 + `deletedAt` 설정. Phase 2(30일 후) — Orders/Positions/User 하드 딜리트 스케줄러
- **이유**: 즉시 개인정보 제거(GDPR 준수) + BattleSession 통계 보존(개인정보 제거로 익명화) + 일정 기간 후 DB 정리
- **Phase 2 처리 순서**: `orders` 삭제 → `positions` 삭제 → `users` 삭제 (FK 의존 순서). `battle_sessions`는 `participantId`가 orphan이 되지만 FK 제약 없으므로 보존
- **trade-off**: 30일간 익명화된 User 레코드가 DB에 잔류. 스케줄러 실패 시 별도 재처리 필요

### ADR-02: providerId를 null로 초기화 (재가입 허용)

- **결정**: 탈퇴 시 `providerId = null`로 초기화하여 동일 OAuth 계정으로 재가입 시 신규 계정 생성
- **이유**: 재가입 제한은 Out of Scope. `providerId`를 null로 만들면 `findByProviderAndProviderId`가 기존 탈퇴 계정을 찾지 못해 신규 생성 흐름으로 진입
- **trade-off**: `provider_id` 컬럼 nullable 변경 필요 (마이그레이션 필요). 동일 OAuth 계정의 과거 기록과 새 계정 연결 불가

### ADR-03: 탈퇴 오케스트레이션을 별도 서비스로 분리

- **결정**: `UserService`에 메서드 추가 대신 `AccountDeletionService` 신규 생성
- **이유**: 탈퇴는 User / Position / Battle / Ranking 4개 컨텍스트를 넘나드는 복잡한 오케스트레이션. `UserService`의 단일 책임 원칙 유지
- **trade-off**: 서비스 파일 하나 추가. 순환 의존성 주의 (AccountDeletionService ← UserService 역참조 금지)

### ADR-04: IN_PROGRESS 배틀 VOID 처리 (패배 처리 없음)

- **결정**: 탈퇴자의 IN_PROGRESS 배틀은 패배/승리 결산 없이 VOID
- **이유**: 탈퇴로 인한 강제 종료를 한쪽의 패배로 처리하는 것은 불공정. VOID로 중립 처리
- **trade-off**: 상대방 입장에서 진행 중이던 배틀이 무효화됨. 보상(잔고 회복 등) 미도입 (TBD)

---

## 11. 아키텍처 위험 요소

- **탈퇴-주문 레이스**: 탈퇴 트랜잭션 시작 직전 주문이 들어오면 포지션이 OPEN된 채 탈퇴될 수 있음 → `user:{userId}:order` redlock으로 해결
- **deletedAt 체크 누락**: `UserService.findById`가 이미 여러 곳에서 사용 중. 기존 `findById`에 deletedAt 체크를 추가하면 탈퇴 처리 자체에서도 사용자를 못 찾는 모순 발생 → `findActiveById` (deletedAt IS NULL)와 `findById` (필터 없음)를 분리해서 사용
- **findAll deletedAt 필터 누락**: `RankingService.buildAllUserAssets()`에서 `userRepository.findAll()`을 사용 중 — 탈퇴 사용자도 랭킹에 포함될 수 있음 → `findAll`에도 `deletedAt IS NULL` 필터 추가 필요
- **Socket.io 브로드캐스트 실패**: 커밋 후 이벤트 리스너에서 실패해도 DB는 이미 커밋됨 → try/catch + 로그 기록으로 수용

---

## 12. TBD

- [ ] IN_PROGRESS 배틀 VOID 시 상대방 잔고 회복 등 보상 지급 여부
- [ ] 탈퇴 쿨다운(일정 기간 내 철회 가능) 도입 여부
- [ ] 동일 OAuth 계정 재가입 시 과거 기록 연결 여부 (현재: 연결 불가)
- [ ] `findAll()`을 사용하는 다른 서비스에서 탈퇴 사용자 필터링 여부 검토
