# 도메인 모델 — 유저 관리 3종 (배틀방 삭제 · 로그아웃 · 서비스 닉네임)

> 기반: docs/requirements-user-management.md  
> 작성일: 2026-05-23

---

## 1. 유비쿼터스 언어 (Ubiquitous Language)

| 용어 | 정의 |
|------|------|
| 방장 (Host) | `Battle.hostUserId`와 JWT subject가 일치하는 유저. 대기방의 유일한 삭제 권한 보유자 |
| 대기방 | `Battle.status === WAITING` 상태의 배틀방. 아직 시작되지 않아 삭제 가능 |
| 서비스 닉네임 | DB `users.nickname` 컬럼 값. 구글 계정 이름과 무관하게 서비스 내에서 표시되는 고유 식별자 |
| authStore | 프론트엔드 Zustand 스토어. `accessToken` · `refreshToken` · `nickname`을 localStorage와 동기화 |
| 닉네임 전파 | OAuth2 로그인 완료 또는 닉네임 변경 직후 authStore를 갱신해 UI 전체에 반영하는 흐름 |

---

## 2. 바운디드 컨텍스트

```
┌─ Auth Context ──────────────────────┐  ┌─ Battle Context ──────────────────┐
│  User (nickname, OAuth2 identity)   │  │  Battle (hostUserId, status)      │
│  로그아웃 (client-side token clear) │  │  BattleSession (participantId)    │
└─────────────────────────────────────┘  └───────────────────────────────────┘
```

두 컨텍스트는 독립적. 배틀방 삭제는 Battle Context 내에서 완결. 닉네임·로그아웃은 Auth Context 내에서 완결.

---

## 3. 애그리거트

### Aggregate A: Battle (배틀방 삭제)

#### 책임
방장만이 WAITING 상태 배틀방을 삭제할 수 있다는 불변식을 보호한다.

#### 애그리거트 루트
`Battle`

#### 엔티티 & 값 객체

| 구분 | 이름 | 핵심 속성 | 설명 |
|------|------|-----------|------|
| Entity (Root) | `Battle` | battleId(UUID), hostUserId, status, currentParticipants | 배틀방 전체 생명주기 관리 |
| Entity | `BattleSession` | id(UUID), battleId, participantId, battleBalance | 참가자별 배틀 세션. 배틀 삭제 시 먼저 Hard Delete |

#### 비즈니스 불변식 (Invariants)

- **INV-01**: 삭제 요청자(`requestUserId`)가 `battle.hostUserId`와 일치해야 한다.
  - 위반 시: `BATTLE_NOT_HOST` (403)
- **INV-02**: `battle.status`가 `WAITING`일 때만 삭제할 수 있다.
  - 위반 시: `BATTLE_ALREADY_STARTED` (409)
- **INV-03**: `BattleSession` 전체 삭제 후 `Battle` 삭제 (FK 제약 순서 준수).
  - 위반 시: DB FK constraint error → 서비스 레이어에서 순서 보장

#### 신규 도메인 메서드 — `Battle.canDelete(requestUserId: number): void`

```
호출자: BattleService.deleteBattle()
내부 검증:
  1. requestUserId !== this.hostUserId  →  throw BATTLE_NOT_HOST
  2. this.status !== WAITING           →  throw BATTLE_ALREADY_STARTED
반환: void (검증 통과 시 무언가 반환하지 않음, 실패 시 예외)
```

> 기존 `canAddParticipant()`, `canStart()` 패턴과 동일하게 Entity 메서드로 귀속.

#### 라이프사이클 & 상태 머신

```
WAITING  ─[방장 DELETE]──→  (Hard Delete — DB 행 제거)
WAITING  ─[참가자 충족]──→  IN_PROGRESS
IN_PROGRESS  ─[시간 종료]──→  FINISHED
```

#### 트랜잭션 경계

단일 트랜잭션 내 완결:
1. `battle_sessions` WHERE `battle_id = ?` Hard Delete
2. `battles` WHERE `battle_id = ?` Hard Delete
3. 커밋 후 `@TransactionalEventListener(AFTER_COMMIT)`으로 Socket.io 이벤트 발행

#### 동시성 고려사항

| 단계 | 방식 | 적용 여부 | 이유 |
|------|------|-----------|------|
| 1 | Redisson 분산 락 (`battle:{battleId}:join`, TTL 3초) | **Y** | 삭제와 참가 요청이 동시에 올 때 순서 보장 필요 |
| 2 | 낙관적 락 (`@VersionColumn`) | N | Hard Delete이므로 버전 충돌 대신 존재 여부로 판단 |
| 3 | 멱등성 키 | N | DELETE는 멱등성 키 불필요 (재시도해도 404 반환) |

> `battle:{battleId}:join` 락을 재활용함으로써 삭제 중 다른 유저의 참가 완료를 차단한다.

#### 도메인 이벤트

- **`BattleDeletedEvent`**: `Battle.canDelete()` 통과 + Hard Delete 커밋 후 발행
  - payload: `{ battleId: string }`
  - 구독: `BattleGateway` → `battle:{battleId}` Socket.io 룸에 `battle.deleted` 브로드캐스트
  - 처리 방식: `@OnEvent('battle.deleted')` + Socket.io emit

---

### Aggregate B: User (서비스 닉네임 · 로그아웃)

#### 책임
서비스 닉네임의 고유성과 형식 규칙을 보호한다. 로그아웃은 클라이언트 전용이므로 도메인 변경 없음.

#### 애그리거트 루트
`User`

#### 엔티티 & 값 객체

| 구분 | 이름 | 핵심 속성 | 설명 |
|------|------|-----------|------|
| Entity (Root) | `User` | id, nickname(2~20자), email(암호화), provider, providerId | 기존 엔티티 그대로 사용 |

#### 비즈니스 불변식 (Invariants)

- **INV-04**: `nickname`은 공백 제거 후 2~20자여야 한다.
  - 위반 시: `VALIDATION_FAILED` (400)
- **INV-05**: `nickname`은 서비스 내에서 고유해야 한다 (본인 제외).
  - 위반 시: `DUPLICATE_NICKNAME` (409)

> INV-04, INV-05 모두 기존 `UserService.updateNickname()`에 이미 구현됨. 신규 로직 없음.

#### 닉네임 전파 흐름 (도메인 이벤트 아님, 애플리케이션 레이어)

```
[OAuth2 로그인 완료]
  백엔드: OAuth2Controller → userService.issueTokens() → redirect URL에 nickname 쿼리 파라미터 추가
  프론트엔드: OAuth2Callback → authStore.setTokens() + authStore.setNickname()

[닉네임 변경]
  백엔드: UserService.updateNickname() → UserProfileResponse(nickname) 반환
  프론트엔드: useUpdateProfile 훅 → mutate 성공 콜백에서 authStore.setNickname()
```

#### 동시성 고려사항

| 단계 | 방식 | 적용 여부 | 이유 |
|------|------|-----------|------|
| 1 | 분산 락 | N | 닉네임 변경은 개인 자원, 충돌 빈도 극히 낮음 |
| 2 | 낙관적 락 (`@VersionColumn`) | Y (기존) | User 엔티티에 이미 적용됨, 그대로 활용 |
| 3 | 멱등성 키 | N | 닉네임 변경은 멱등 (동일 닉네임 재전송 시 DB에서 중복 감지) |

---

## 4. 애그리거트 관계도

```
Battle (Root) ──1:N──→ BattleSession  (battle_id FK)
User   (Root) ──────   Battle.hostUserId  (ID 참조, 직접 연관 없음)
User   (Root) ──────   BattleSession.participantId  (ID 참조)
```

---

## 5. 도메인 이벤트

| 이벤트명 | 발행 주체 | 발행 시점 | 구독 주체 | 처리 내용 |
|----------|-----------|-----------|-----------|-----------|
| `BattleDeletedEvent` | `BattleService` | 배틀 Hard Delete 커밋 후 | `BattleGateway` | `battle:{battleId}` 룸에 `battle.deleted` Socket.io 브로드캐스트 |

> 로그아웃과 닉네임 변경은 도메인 이벤트 없음. 프론트엔드 authStore 갱신은 애플리케이션 레이어 관심사.

---

## 6. 도메인 서비스

### BattleService.deleteBattle(userId, battleId)

- **책임**: 권한 검증 + Hard Delete + 이벤트 발행 오케스트레이션
- **관여 애그리거트**: `Battle`, `BattleSession`
- **로직 요약**:
  1. `battle:{battleId}:join` redlock 획득
  2. `BattleRepository.findById(battleId)` — 없으면 `BATTLE_NOT_FOUND`
  3. `battle.canDelete(userId)` — INV-01, INV-02 검증
  4. `BattleSessionRepository.deleteByBattleId(battleId)` Hard Delete
  5. `BattleRepository.delete(battleId)` Hard Delete
  6. 커밋 후 `eventEmitter.emit('battle.deleted', { battleId })`
  7. redlock 해제
- **트랜잭션 전략**: 단일 트랜잭션 (4, 5번 스텝). 이벤트는 커밋 후 발행.

---

## 7. 크로스-애그리거트 상호작용

| 상황 | 관여 애그리거트 | 일관성 전략 | 이유 |
|------|----------------|-------------|------|
| 배틀방 삭제 | Battle → BattleSession | 강한 일관성 (단일 트랜잭션) | 세션 없는 배틀 또는 배틀 없는 세션은 데이터 오염 |
| 닉네임 변경 | User 단독 | 강한 일관성 | 단일 애그리거트 |
| 로그아웃 | 없음 | 해당 없음 | 클라이언트 전용 |

---

## 8. 레포지토리 인터페이스

### BattleRepository (기존 + 신규)

```typescript
// 기존
findById(battleId: string): Promise<Battle | null>
save(battle: Battle): Promise<Battle>

// 신규
delete(battleId: string): Promise<void>
```

### BattleSessionRepository (기존 + 신규)

```typescript
// 기존
save(session: BattleSession): Promise<BattleSession>
existsByParticipantIdAndBattleId(participantId: number, battleId: string): Promise<boolean>

// 신규
deleteByBattleId(battleId: string): Promise<void>
```

---

## 9. 패키지 구조 제안

```
src/
└── domain/
    ├── battle/
    │   ├── entity/
    │   │   └── battle.entity.ts          ← canDelete() 메서드 추가
    │   ├── event/
    │   │   └── battle.event.ts           ← BattleDeletedEvent 추가
    │   ├── service/
    │   │   └── battle.service.ts         ← deleteBattle() 추가
    │   ├── repository/
    │   │   ├── battle.repository.ts      ← delete() 추가
    │   │   └── battle-session.repository.ts  ← deleteByBattleId() 추가
    │   ├── dto/
    │   │   └── battle-response.dto.ts    ← BattleSummary에 hostUserId 추가
    │   └── gateway/
    │       └── battle.gateway.ts         ← battle.deleted 이벤트 핸들러 추가
    └── user/
        ├── controller/
        │   └── oauth2.controller.ts      ← redirect URL에 nickname 추가
        └── (나머지 기존 파일 변경 없음)
```

---

## 10. 설계 결정 사항 (ADR)

### ADR-01: 배틀방 삭제 — Hard Delete 채택
- **결정**: Soft Delete가 아닌 Hard Delete
- **이유**: WAITING 상태 배틀은 게임 이력에 포함되지 않음. `BattleSession.rank`, `finalValuation` 등이 미기록 상태이므로 보존 가치 없음
- **trade-off**: 삭제 후 복구 불가. 단, 배틀 대기방은 사용자가 자발적으로 생성/삭제하는 단기 자원이므로 수용 가능

### ADR-02: 배틀방 삭제 락 — join 락 재활용
- **결정**: 신규 락 키 대신 기존 `battle:{battleId}:join` 재활용
- **이유**: 삭제와 참가는 상호 배타적이어야 하므로 동일 락으로 직렬화가 적절. 락 키 증가를 최소화
- **trade-off**: join 요청이 삭제 중 최대 3초 대기. 대기방 삭제는 드문 케이스이므로 UX 영향 미미

### ADR-03: 닉네임 전파 — redirect URL 파라미터 방식
- **결정**: OAuth2 콜백 redirect URL에 `nickname` 파라미터 추가 (프론트엔드 `/api/users/me` 추가 호출 없음)
- **이유**: 추가 API 라운드트립 없이 로그인 직후 닉네임 즉시 사용 가능. 구현 단순
- **trade-off**: URL에 닉네임 노출. 단, 민감 정보가 아니며 HTTPS 환경에서 허용 수준

---

## 11. 아키텍처 위험 요소

- **삭제-참가 레이스**: 방장이 삭제하는 동시에 다른 유저가 참가 API를 호출하면 세션은 생성되고 배틀은 삭제될 수 있음. → redlock으로 해결
- **BattleRoom 잔류**: 이미 배틀룸 화면에 있는 참가자가 방 삭제 이벤트를 받지 못하면 유령 화면 잔류 → `battle.deleted` Socket.io 브로드캐스트 + 프론트엔드에서 수신 시 `/battles` 리다이렉트 처리 필요
- **닉네임 authStore 스탈레**: 토큰은 있는데 서버 닉네임이 변경된 경우 authStore가 구닉네임 표시 → 닉네임 변경 API 성공 콜백에서 즉시 `setNickname()` 호출로 해결

---

## 12. TBD

- [ ] refresh token 블랙리스트(서버 측 로그아웃) 도입 여부
- [ ] 배틀방 삭제 시 참가자에게 Push 알림 전송 여부
- [ ] 최초 로그인 유저에게 닉네임 설정 강제 화면 표시 여부
