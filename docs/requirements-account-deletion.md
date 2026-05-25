# 요구사항 명세 — 회원탈퇴

## 1. 개요

- **기능 목적**: 로그인한 사용자가 CoinBattle 계정을 영구 탈퇴하여 개인정보를 삭제하고 서비스 이용을 종료할 수 있도록 한다.
- **핵심 사용자**: USER (인증된 플레이어)
- **범위**
  - In Scope:
    - 마이페이지(프로필 화면) 로그아웃 버튼 아래 회원탈퇴 버튼 노출
    - 탈퇴 확인 모달 표시 (실수 방지)
    - Soft Delete — `users.deleted_at` 설정 + 개인정보 즉시 익명화
    - OPEN 상태 포지션(비배틀) 강제 청산 후 마진 반환
    - IN_PROGRESS 배틀 VOID 처리 (탈퇴자 패배 처리 없이 배틀 무효화)
    - WAITING 배틀(방장) Hard Delete
    - Redis 랭킹 데이터 제거 (`leaderboard:daily`, `leaderboard:pvp-winrate`, `pvp:stats:{userId}`)
    - 클라이언트 토큰 소거 + 로그인 페이지 리다이렉트
  - Out of Scope:
    - 탈퇴 후 재가입 제한 (동일 OAuth 계정으로 즉시 재가입 가능)
    - 배틀 기록(BattleSession) 삭제 — 랭킹/통계 무결성 보존 목적으로 유지 (익명화)
    - 탈퇴 사유 수집
    - 쿨다운 기간(철회 가능 기간) 도입

---

## 2. 도메인 모델 후보

### 엔티티 변경

| 엔티티 | 변경 사항 |
|--------|-----------|
| `User` | `deletedAt: Date \| null` 컬럼 추가 (Soft Delete 마커) |
| `Battle` | 변경 없음 (기존 void() 메서드 재활용) |
| `Position` | 변경 없음 (기존 close() 메서드 재활용) |
| `BattleSession` | 변경 없음 (익명화된 nickname으로 표시) |

### 탈퇴 후 User 데이터 상태

| 필드 | 탈퇴 전 | 탈퇴 후 |
|------|---------|---------|
| `email` | 암호화된 이메일 | `null` |
| `profileImageUrl` | OAuth 프로필 이미지 URL | `null` |
| `nickname` | 사용자 닉네임 | `"(탈퇴한 사용자)"` |
| `providerId` | OAuth 제공자 ID | `null` (문자열 → null, 재가입 시 새 계정 생성) |
| `deletedAt` | `null` | 탈퇴 처리 시각 |
| `balance` | 보유 잔고 | 변경 없음 (소멸) |

> `providerId`를 null로 설정해 동일 OAuth 계정으로 재가입하면 신규 계정이 생성된다.

### 상태 전이

```
User.deletedAt = null  →  [DELETE /api/users/me]  →  User.deletedAt = NOW()
                                                       nickname = "(탈퇴한 사용자)"
                                                       email = null
                                                       profileImageUrl = null
                                                       providerId = null

Position(OPEN, battleId=null)  →  [탈퇴 처리 중]  →  Position(CLOSED)

Battle(WAITING, hostUserId=탈퇴자)  →  [탈퇴 처리 중]  →  Hard Delete
Battle(IN_PROGRESS, 탈퇴자 포함)   →  [탈퇴 처리 중]  →  Battle(VOID)
```

---

## 3. 비즈니스 규칙

1. **BR-01** 인증된 사용자만 탈퇴 가능
   - 조건: JWT 없이 요청
   - 위반 시: 401 `INVALID_TOKEN`

2. **BR-02** 이미 탈퇴한 사용자 재요청 차단
   - 조건: `user.deletedAt !== null`
   - 위반 시: 404 `USER_NOT_FOUND`

3. **BR-03** 탈퇴 전 OPEN 비배틀 포지션 강제 청산
   - 조건: `position.status === OPEN && position.battleId === null`
   - 처리: 마진 반환 없이 position.close() 호출 (잔고는 소멸하므로 PnL 정산 불필요)

4. **BR-04** IN_PROGRESS 배틀 VOID 처리
   - 조건: 탈퇴자가 참가 중인 `battle.status === IN_PROGRESS` 배틀
   - 처리: `battle.void()` 호출 → `battle:{battleId}` 룸에 `battle.voided` 이벤트 브로드캐스트

5. **BR-05** WAITING 배틀(방장) Hard Delete
   - 조건: 탈퇴자가 `hostUserId`인 `battle.status === WAITING` 배틀
   - 처리: BattleSession Hard Delete → Battle Hard Delete → `battle:{battleId}` 룸에 `battle.deleted` 이벤트 브로드캐스트

6. **BR-06** Redis 랭킹 데이터 제거
   - 처리: `ZREM leaderboard:daily {userId}`, `ZREM leaderboard:pvp-winrate {userId}`, `DEL pvp:stats:{userId}`

7. **BR-07** 탈퇴 처리는 단일 트랜잭션으로 완결
   - 포지션 종료 → 배틀 처리 → User 익명화/Soft Delete → Redis 제거 순서
   - 트랜잭션 실패 시 전체 롤백 (Redis 제거는 트랜잭션 외부에서 실행, 실패 무시)

8. **BR-08** 탈퇴 후 기존 JWT는 만료 시까지 기술적으로 유효하나, 모든 인증 엔드포인트에서 `deletedAt` 체크로 차단
   - `JwtAuthGuard` 또는 `UserService` 메서드에서 `user.deletedAt !== null` 시 404 `USER_NOT_FOUND` 반환

---

## 4. 사용자 & 권한

| 역할 | JWT 인증 | 접근 가능 리소스 |
|------|----------|-----------------|
| `USER` | 필요 | 본인 계정 탈퇴 (`DELETE /api/users/me`) |
| `GUEST` (비인증) | 불필요 | 불가 |

---

## 5. 주요 시나리오

### Happy Path — 진행 중 배틀 없음

1. 유저가 마이페이지에서 "회원탈퇴" 버튼 클릭
2. 확인 모달 표시: "탈퇴하면 모든 데이터가 삭제되며 복구할 수 없습니다. 탈퇴하시겠습니까?"
3. 확인 버튼 클릭 → `DELETE /api/users/me` 요청 (JWT 포함)
4. 서버: OPEN 비배틀 포지션 close() 처리
5. 서버: User 익명화 + `deletedAt = NOW()` 저장
6. 서버: Redis 랭킹 데이터 제거
7. 응답 204 No Content
8. 클라이언트: localStorage 토큰 소거 + `/login` 리다이렉트

### Happy Path — IN_PROGRESS 배틀 참가 중

1~3 동일
4. 서버: `battle.void()` → `battle:{battleId}` 룸에 `battle.voided` 이벤트 발행
5. 상대방 클라이언트: 배틀 무효화 알림 수신
6~8 동일

### Happy Path — WAITING 배틀 방장인 경우

1~3 동일
4. 서버: BattleSession + Battle Hard Delete → `battle:{battleId}` 룸에 `battle.deleted` 이벤트 발행
5~8 동일

### 예외 시나리오

| 시나리오 | 처리 방식 |
|----------|-----------|
| 탈퇴 확인 모달에서 취소 | 아무 일도 하지 않음 |
| JWT 없이 요청 | 401 INVALID_TOKEN |
| 이미 탈퇴된 계정으로 요청 | 404 USER_NOT_FOUND |
| 탈퇴 처리 중 DB 오류 | 트랜잭션 롤백, 500 응답 |

---

## 6. 비기능 요구사항

- **성능**: DELETE 응답 목표 500ms 이내 (포지션/배틀 처리 포함, 건수 적어 충분)
- **동시성**: redlock 불필요 — 탈퇴는 본인만 가능하며 중복 요청은 BR-02로 차단
- **데이터 보존**: Soft Delete (`deletedAt`) + 개인정보 즉시 익명화 / BattleSession 보존 (익명 표시)
- **실시간**: 배틀 VOID/삭제 시 Socket.io `battle:{battleId}` 룸 브로드캐스트
- **Redis**: 랭킹 3개 키 제거 (트랜잭션 외부, 실패 시 로그만 기록)
- **보안**: `deletedAt !== null` 체크를 `UserService.getProfile` 등 모든 유저 조회 진입점에 추가

---

## 7. 미결 사항 (TBD)

- [ ] 배틀 VOID 시 상대방에게 별도 보상(잔고 회복 등) 지급 여부
- [ ] 동일 OAuth 계정 재가입 허용 여부 (현재 명세: `providerId = null`로 재가입 가능)
- [ ] 탈퇴 쿨다운(일정 기간 내 철회 가능) 도입 여부
