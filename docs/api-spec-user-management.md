# 유저 관리 3종 API 명세서

> Base URL: `http://localhost:8080`  
> 모든 응답은 `ApiResponse<T>` 래퍼: `{ success: boolean, data: T | null, message: string | null }`

---

## 1. 배틀방 삭제

| 항목 | 내용 |
|------|------|
| **메서드** | `DELETE` |
| **경로** | `/api/battles/:battleId` |
| **인증** | Bearer Token (JWT) 필수 |
| **설명** | 방장(hostUserId)만 WAITING 상태인 배틀방을 삭제한다. 연관 BattleSession 포함 Hard Delete. |

### Request

#### Path Parameters

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `battleId` | `string (UUID)` | ✅ | 삭제할 배틀방 ID |

#### Request Body
없음

### Response

#### 성공 응답 — `204 No Content`

```json
{
  "success": true,
  "data": null,
  "message": null
}
```

#### 에러 응답

| 상태 코드 | ErrorCode | 발생 조건 |
|-----------|-----------|-----------|
| `401 Unauthorized` | `INVALID_TOKEN` | JWT 누락 또는 유효하지 않음 |
| `403 Forbidden` | `BATTLE_NOT_HOST` | 요청 유저가 방장이 아님 |
| `404 Not Found` | `BATTLE_NOT_FOUND` | 해당 battleId 존재하지 않음 |
| `409 Conflict` | `BATTLE_ALREADY_STARTED` | 배틀이 이미 IN_PROGRESS 또는 FINISHED 상태 |
| `423 Locked` | `BATTLE_LOCK_TIMEOUT` | 동시 참가 요청과 충돌, 잠시 후 재시도 필요 |

```json
{
  "success": false,
  "data": null,
  "message": "배틀 방장만 삭제할 수 있습니다"
}
```

### 삭제 후 Socket.io 브로드캐스트

삭제 성공 후 서버가 `battle:{battleId}` 룸에 다음 이벤트를 발행합니다.

```json
// event: "battle.deleted"
{
  "battleId": "550e8400-e29b-41d4-a716-446655440000"
}
```

프론트엔드는 이 이벤트 수신 시 `/battles`로 리다이렉트합니다.

---

## 2. 로그아웃

> **백엔드 엔드포인트 없음.** 로그아웃은 순수 클라이언트 처리입니다.

### 프론트엔드 처리 흐름

```
사용자 → [로그아웃 버튼 클릭]
       → authStore.clearAuth()
           localStorage.removeItem('accessToken')
           localStorage.removeItem('refreshToken')
           localStorage.removeItem('nickname')
           Zustand state = { accessToken: null, refreshToken: null, nickname: null }
       → navigate('/login', { replace: true })
```

### clearAuth() 인터페이스 (authStore.ts)

```typescript
clearAuth: () => void
// 멱등성 보장: 이미 토큰이 없는 상태에서 호출해도 오류 없음
```

### UI 배치

- 위치: `ProfilePage` 하단 "로그아웃" 버튼
- 확인 다이얼로그(선택적)
- 소셜 로그인 세션은 별도 해제 없음 (다음 로그인 시 OAuth2 재인증)

---

## 3. 서비스 닉네임

### 3-A. OAuth2 콜백 — nickname 파라미터 추가

> 기존 엔드포인트 변경: `GET /oauth2/callback/google`  
> 백엔드가 redirect URL에 `nickname` 쿼리 파라미터를 추가로 전달합니다.

#### 변경 전 → 변경 후

```
# 변경 전
{OAUTH2_REDIRECT_URI}?accessToken={jwt}&refreshToken={jwt}

# 변경 후
{OAUTH2_REDIRECT_URI}?accessToken={jwt}&refreshToken={jwt}&nickname={nickname}
```

#### 프론트엔드 OAuth2Callback 처리

```typescript
// OAuth2Callback.tsx 변경
const accessToken = searchParams.get('accessToken');
const refreshToken = searchParams.get('refreshToken');
const nickname = searchParams.get('nickname');   // ← 신규

if (accessToken && refreshToken) {
  setTokens(accessToken, refreshToken);
  if (nickname) setNickname(decodeURIComponent(nickname));  // ← 신규
  navigate('/', { replace: true });
}
```

---

### 3-B. 닉네임 변경

| 항목 | 내용 |
|------|------|
| **메서드** | `PATCH` |
| **경로** | `/api/users/me/nickname` |
| **인증** | Bearer Token (JWT) 필수 |
| **설명** | 서비스 전용 닉네임을 변경한다. 성공 시 프론트엔드는 authStore.nickname도 즉시 갱신한다. |

### Request

#### Request Body

Content-Type: `application/json`

| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|------|------|------|
| `nickname` | `string` | ✅ | 2~20자, 공백 제거 후 검증 | 변경할 닉네임 |

```json
{
  "nickname": "코인왕철수"
}
```

### Response

#### 성공 응답 — `200 OK`

| 필드 | 타입 | 설명 |
|------|------|------|
| `userId` | `number` | 유저 ID |
| `nickname` | `string` | **변경된 서비스 닉네임** |
| `profileImageUrl` | `string \| null` | 프로필 이미지 URL |
| `email` | `string \| null` | 마스킹된 이메일 |

```json
{
  "success": true,
  "data": {
    "userId": 42,
    "nickname": "코인왕철수",
    "profileImageUrl": "https://lh3.googleusercontent.com/...",
    "email": "co***@gmail.com"
  },
  "message": null
}
```

#### 에러 응답

| 상태 코드 | ErrorCode | 발생 조건 |
|-----------|-----------|-----------|
| `400 Bad Request` | `VALIDATION_FAILED` | nickname이 공백이거나 2자 미만 또는 20자 초과 |
| `401 Unauthorized` | `INVALID_TOKEN` | JWT 누락 또는 유효하지 않음 |
| `404 Not Found` | `USER_NOT_FOUND` | 토큰 유저가 DB에 없음 (비정상 케이스) |
| `409 Conflict` | `DUPLICATE_NICKNAME` | 이미 타인이 사용 중인 닉네임 |

```json
{
  "success": false,
  "data": null,
  "message": "이미 사용 중인 닉네임입니다"
}
```

#### 프론트엔드 성공 콜백

```typescript
// useUpdateProfile.ts 변경
onSuccess: (data) => {
  authStore.setNickname(data.nickname);   // ← 신규: authStore 즉시 갱신
  queryClient.invalidateQueries({ queryKey: ['userProfile'] });
}
```

---

## 4. 배틀 목록 — hostUserId 필드 추가

> 기존 엔드포인트 응답 스키마 변경: `GET /api/battles`  
> 프론트엔드가 방장 식별 후 삭제 버튼 표시에 사용합니다.

### BattleSummary 변경

| 필드 | 타입 | 신규 여부 | 설명 |
|------|------|-----------|------|
| `battleId` | `string` | 기존 | 배틀 ID |
| `status` | `string` | 기존 | WAITING / IN_PROGRESS / FINISHED |
| `seedMoney` | `number` | 기존 | 시드머니 |
| `duration` | `number` | 기존 | 진행 시간(분) |
| `maxParticipants` | `number` | 기존 | 최대 참가자 수 |
| `currentParticipants` | `number` | 기존 | 현재 참가자 수 |
| `startTime` | `string \| null` | 기존 | 시작 시각 (ISO 8601) |
| `createdAt` | `string` | 기존 | 생성 시각 (ISO 8601) |
| **`hostUserId`** | **`number`** | **신규** | **방장 유저 ID** |

```json
{
  "success": true,
  "data": {
    "content": [
      {
        "battleId": "550e8400-e29b-41d4-a716-446655440000",
        "hostUserId": 42,
        "status": "WAITING",
        "seedMoney": 1000000,
        "duration": 10,
        "maxParticipants": 2,
        "currentParticipants": 1,
        "startTime": null,
        "createdAt": "2026-05-23T14:00:00Z"
      }
    ],
    "totalElements": 1,
    "totalPages": 1,
    "page": 0,
    "size": 20
  },
  "message": null
}
```

---

## 5. 신규 ErrorCode 목록

| ErrorCode | HTTP | 메시지 | 추가 위치 |
|-----------|------|--------|-----------|
| `BATTLE_NOT_HOST` | 403 | 배틀 방장만 삭제할 수 있습니다 | `error-code.enum.ts` |

---

## 추론 항목

> 코드에 명시되지 않아 설계 문서 및 코드 패턴으로 추론한 항목입니다.

- `DELETE /api/battles/:battleId` 응답 코드: 도메인 문서 기준 204 No Content (기존 삭제 API 없어 관례 기준)
- `nickname` URL 인코딩: 한글 닉네임은 `encodeURIComponent`로 인코딩 후 전달 필요 (브라우저 자동 처리 여부에 따라 명시적 처리 권장)
- `BATTLE_NOT_HOST` HTTP 상태 403: 기존 `BATTLE_ACCESS_DENIED` (403) 패턴과 동일 레벨로 설정
