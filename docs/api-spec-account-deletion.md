# 회원탈퇴 API 명세서

> Base URL: `https://{host}/api`  
> 스택: NestJS 10.x + TypeScript

---

## 회원탈퇴

| 항목 | 내용 |
|------|------|
| **메서드** | `DELETE` |
| **경로** | `/api/users/me` |
| **인증** | Bearer Token (JWT Access Token 필수) |
| **설명** | 인증된 사용자의 계정을 탈퇴 처리한다. 개인정보 즉시 익명화(Soft Delete), 비배틀 OPEN 포지션 강제 청산, 진행 중 배틀 VOID, 대기 중 배틀(방장) Hard Delete, Redis 랭킹 데이터 제거를 단일 트랜잭션으로 수행한다. |

### Request

#### Headers

| 헤더 | 필수 | 설명 |
|------|------|------|
| `Authorization` | ✅ | `Bearer {accessToken}` |

#### Request Body

없음

---

### Response

#### 성공 응답 — `204 No Content`

응답 바디 없음.

---

#### 에러 응답

CoinBattle 공통 에러 형식:

```json
{
  "success": false,
  "data": null,
  "message": "에러 메시지",
  "errorCode": "ERROR_CODE"
}
```

| 상태 코드 | errorCode | 발생 조건 | message |
|-----------|-----------|-----------|---------|
| `401 Unauthorized` | `INVALID_TOKEN` | Authorization 헤더 없음 또는 JWT 서명 불일치 | `유효하지 않은 토큰입니다` |
| `401 Unauthorized` | `EXPIRED_TOKEN` | JWT 만료 | `만료된 토큰입니다` |
| `404 Not Found` | `USER_NOT_FOUND` | 이미 탈퇴한 계정(`deletedAt != null`)으로 재요청 | `사용자를 찾을 수 없습니다` |
| `500 Internal Server Error` | — | DB 트랜잭션 실패 | `서버 내부 오류가 발생했습니다` |

---

### 서버 처리 흐름

```
1. JWT 검증 → userId 추출
2. User 조회 (deletedAt IS NULL) — 없으면 USER_NOT_FOUND (404)
3. user:{userId}:order redlock 획득 (동시 주문 차단, TTL 3초)
4. [트랜잭션 시작]
   4-1. OPEN 비배틀 포지션(battleId IS NULL) → position.close() 일괄 처리
   4-2. WAITING 배틀 (hostUserId = userId) → BattleSession Hard Delete → Battle Hard Delete
   4-3. WAITING 배틀 (참가자 = userId, 비방장) → 해당 BattleSession만 Hard Delete, Battle 유지
   4-4. IN_PROGRESS 배틀 (참가자 = userId) → battle.void()
   4-5. user.withdraw() 실행
        - email = null
        - profileImageUrl = null
        - providerId = null
        - nickname = "(탈퇴한 사용자)"
        - deletedAt = NOW()
   4-6. UserRepository.save(user)
5. [트랜잭션 커밋]
6. UserWithdrawnEvent 발행 (비동기, 트랜잭션 외부)
   - BattleGateway: battle:{id} 룸에 battle.voided / battle.deleted 브로드캐스트
   - RankingService: leaderboard:daily, leaderboard:pvp-winrate, pvp:stats:{userId} 제거
7. redlock 해제
8. 204 No Content 반환
```

---

### 클라이언트 처리

204 응답 수신 후:

1. `localStorage`에서 `accessToken`, `refreshToken` 소거
2. Zustand `authStore` 초기화
3. `/login` 페이지로 리다이렉트

---

---

## Phase 2 — 완전 삭제 스케줄러 (AccountPurgeScheduler)

| 항목 | 내용 |
|------|------|
| **트리거** | `@Cron('0 2 * * *')` — 매일 새벽 2시 |
| **대상** | `deletedAt IS NOT NULL AND deletedAt < NOW() - INTERVAL '30 days'` |
| **처리 순서** | `orders` 하드 딜리트 → `positions` 하드 딜리트 → `users` 하드 딜리트 |
| **BattleSession** | 유지 (통계 목적, `participantId`는 orphan으로 잔존) |
| **실패 처리** | 에러 로그 기록, 다음 실행 시 재처리 |

### 탈퇴 후 User 데이터 상태

| 필드 | 탈퇴 전 | 탈퇴 후 |
|------|---------|---------|
| `email` | 암호화된 이메일 | `null` |
| `profileImageUrl` | OAuth 프로필 이미지 URL | `null` |
| `nickname` | 사용자 닉네임 | `"(탈퇴한 사용자)"` |
| `providerId` | OAuth 제공자 ID | `null` |
| `deletedAt` | `null` | 탈퇴 처리 시각 (ISO 8601) |
| `balance` | 보유 잔고 | 변경 없음 (소멸) |

> `providerId = null` 설정으로 동일 OAuth 계정으로 재가입하면 신규 계정이 생성됩니다.
