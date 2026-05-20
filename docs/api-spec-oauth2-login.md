# OAuth2 소셜 로그인 API 명세서

> Base URL: `http://localhost:3000`
> 인증 방식: OAuth2 Authorization Code Flow (Google / Kakao)
> 비고: 아래 엔드포인트는 `/api` 접두사 **없음** — OAuth2 표준 경로 구조

---

## 1. OAuth2 인가 시작

| 항목 | 내용 |
|------|------|
| **메서드** | `GET` |
| **경로** | `/oauth2/authorization/:provider` |
| **인증** | 불필요 (GUEST 접근 가능) |
| **설명** | 지정된 provider의 OAuth2 인가 URL로 브라우저를 리다이렉트한다. |

### Request

#### Path Parameters

| 파라미터 | 타입 | 필수 | 허용값 | 설명 |
|---------|------|------|--------|------|
| `provider` | `string` | ✅ | `google`, `kakao` | 소셜 로그인 제공자 |

### Response

#### 성공 응답 — `302 Found`

브라우저를 각 Provider의 인가 URL로 리다이렉트한다.

| Provider | 리다이렉트 대상 |
|----------|----------------|
| `google` | `https://accounts.google.com/o/oauth2/v2/auth?client_id=...&redirect_uri=...&scope=email+profile&response_type=code` |
| `kakao` | `https://kauth.kakao.com/oauth/authorize?client_id=...&redirect_uri=...&response_type=code` |

#### 에러 응답

| 상태 코드 | 발생 조건 |
|-----------|-----------|
| `404 Not Found` | `:provider` 값이 `google` 또는 `kakao` 이외인 경우 (Guard 미매칭) |

---

## 2. Google OAuth2 콜백

| 항목 | 내용 |
|------|------|
| **메서드** | `GET` |
| **경로** | `/oauth2/callback/google` |
| **인증** | 불필요 (Google 인가 서버가 직접 호출) |
| **설명** | Google 인가 서버로부터 authorization code를 받아 유저를 조회/생성하고 JWT를 발급한 뒤 프론트로 리다이렉트한다. |

### Request

#### Query Parameters (Google 인가 서버가 자동 전달)

| 파라미터 | 타입 | 설명 |
|---------|------|------|
| `code` | `string` | Google 인가 코드 |
| `state` | `string` | CSRF 방지용 state 값 (Passport가 자동 검증) |

### Response

#### 성공 응답 — `302 Found`

JWT 발급 후 프론트엔드 콜백 페이지로 리다이렉트.

```
Location: {OAUTH2_REDIRECT_URI}?accessToken={jwt_access_token}&refreshToken={jwt_refresh_token}
```

**예시:**
```
Location: http://localhost:5173/oauth2/callback?accessToken=eyJhbGci...&refreshToken=eyJhbGci...
```

#### 실패 응답 — `302 Found`

인가 취소 또는 오류 발생 시 로그인 페이지로 리다이렉트.

```
Location: /login?error=oauth_failed
```

| 실패 원인 | 처리 |
|-----------|------|
| 유저가 Google 인가 화면에서 취소 | `/login?error=oauth_failed` 리다이렉트 |
| Google API 오류 | `/login?error=oauth_failed` 리다이렉트 |
| DB 저장 실패 | `/login?error=oauth_failed` 리다이렉트 |

---

## 3. Kakao OAuth2 콜백

| 항목 | 내용 |
|------|------|
| **메서드** | `GET` |
| **경로** | `/oauth2/callback/kakao` |
| **인증** | 불필요 (Kakao 인가 서버가 직접 호출) |
| **설명** | Kakao 인가 서버로부터 authorization code를 받아 유저를 조회/생성하고 JWT를 발급한 뒤 프론트로 리다이렉트한다. |

### Request

#### Query Parameters (Kakao 인가 서버가 자동 전달)

| 파라미터 | 타입 | 설명 |
|---------|------|------|
| `code` | `string` | Kakao 인가 코드 |
| `state` | `string` | CSRF 방지용 state 값 |
| `error` | `string` | 인가 실패 시 오류 코드 (예: `access_denied`) |

### Response

#### 성공 응답 — `302 Found`

Google 콜백과 동일한 형식으로 리다이렉트.

```
Location: {OAUTH2_REDIRECT_URI}?accessToken={jwt_access_token}&refreshToken={jwt_refresh_token}
```

#### 실패 응답 — `302 Found`

```
Location: /login?error=oauth_failed
```

---

## 4. JWT 토큰 구조 (참고)

콜백 성공 시 발급되는 토큰 형식.

### accessToken Payload

| 필드 | 타입 | 설명 |
|------|------|------|
| `sub` | `number` | User ID |
| `role` | `string` | `ROLE_USER` \| `ROLE_ADMIN` |
| `iat` | `number` | 발급 시각 (Unix timestamp) |
| `exp` | `number` | 만료 시각 (발급 후 1시간) |

### refreshToken Payload

| 필드 | 타입 | 설명 |
|------|------|------|
| `sub` | `number` | User ID |
| `iat` | `number` | 발급 시각 |
| `exp` | `number` | 만료 시각 (발급 후 7일) |

---

## 5. 환경변수 요구사항

| 변수명 | 예시 | 설명 |
|--------|------|------|
| `GOOGLE_CLIENT_ID` | `xxx.apps.googleusercontent.com` | Google Cloud Console 클라이언트 ID |
| `GOOGLE_CLIENT_SECRET` | `GOCSPX-...` | Google Cloud Console 클라이언트 시크릿 |
| `KAKAO_CLIENT_ID` | `abcdef1234...` | Kakao 개발자 콘솔 REST API 키 |
| `KAKAO_CLIENT_SECRET` | `...` | Kakao 개발자 콘솔 클라이언트 시크릿 (선택) |
| `OAUTH2_REDIRECT_URI` | `http://localhost:5173/oauth2/callback` | 프론트엔드 콜백 페이지 URL |

---

## 6. 전체 인증 흐름

```
[브라우저]                    [NestJS 서버]                [Google/Kakao]
   │                               │                            │
   │ GET /oauth2/authorization/google                          │
   │──────────────────────────────▶│                            │
   │◀──────────────────────────────│ 302 → Google 인가 URL      │
   │                               │                            │
   │ GET accounts.google.com/...   │                            │
   │──────────────────────────────────────────────────────────▶│
   │◀──────────────────────────────────────────────────────────│ 302 → /oauth2/callback/google?code=...
   │                               │                            │
   │ GET /oauth2/callback/google?code=...                       │
   │──────────────────────────────▶│                            │
   │                               │── code 교환 ─────────────▶│
   │                               │◀── access_token + profile ─│
   │                               │                            │
   │                               │ findOrCreateSocialUser()   │
   │                               │ issueTokens()              │
   │◀──────────────────────────────│ 302 → /oauth2/callback?accessToken=...&refreshToken=...
   │                               │                            │
   │ GET /oauth2/callback           │                            │
   │ (OAuth2Callback.tsx)           │                            │
   │ → setTokens() → navigate('/') │                            │
```

---

## 추론 항목

> 아래 항목은 코드에서 명시되지 않아 NestJS Passport 패턴 및 기존 코드 관례로 추론했습니다.

- Google Strategy의 `scope`: `['email', 'profile']` 추론 (passport-google-oauth20 기본값)
- Kakao Strategy의 프로필 매핑: `id`(providerId), `kakao_account.email`, `properties.nickname` 추론
- 실패 시 리다이렉트 처리: `handleRequest` 오버라이드 또는 `failureRedirect` 옵션으로 구현
- `OAUTH2_REDIRECT_URI` 환경변수: ConfigService 주입으로 Strategy 내에서 사용
