# 도메인 모델 — OAuth2 소셜 로그인 (Google / Kakao)

> 기반: docs/requirements-oauth2-login.md
> 작성일: 2026-05-19

---

## 1. 유비쿼터스 언어 (Ubiquitous Language)

| 용어 | 정의 |
|------|------|
| SocialLogin | Google 또는 Kakao OAuth2를 통한 CoinBattle 인증 진입 |
| Provider | 소셜 로그인 제공자 — `GOOGLE` 또는 `KAKAO` |
| ProviderId | Provider가 발급한 유저 고유 식별자 (Google: `sub`, Kakao: `id`) |
| FindOrCreate | `(provider, providerId)` 조합으로 User를 조회하고, 없으면 신규 생성하는 패턴 |
| OAuthProfile | Provider 인가 서버에서 수신한 유저 프로필 (email, name, providerId 포함) |
| SocialCallbackRedirect | 인증 완료 후 JWT를 쿼리파람으로 담아 프론트 `/oauth2/callback`으로 보내는 302 응답 |

---

## 2. 바운디드 컨텍스트

```
[ Auth Context ]
  OAuth2 소셜 로그인 진입 → FindOrCreate User → JWT 발급
  (기존 User 컨텍스트와 동일 — 별도 컨텍스트 분리 없음)
```

---

## 3. 애그리거트

### Aggregate: User

#### 책임
소셜 로그인으로 유입된 신규/기존 유저의 신원을 보장하고 게임 참여 자격(JWT)을 발급한다.

#### 애그리거트 루트
`User`

#### 엔티티 & 값 객체

| 구분 | 이름 | 핵심 속성 | 설명 |
|------|------|-----------|------|
| Entity (루트) | `User` | id, email(AES암호화), nickname, provider, providerId, role, balance, version | 기존 엔티티 — 신규 컬럼 없음 |

#### 비즈니스 불변식 (Invariants)

- **INV-01**: `(provider, providerId)` 조합은 유일해야 한다.
  - 위반 시: 기존 User를 반환 (예외 없음 — FindOrCreate 패턴으로 흡수)

- **INV-02**: `nickname`은 전체 유저 중 유일해야 한다.
  - 위반 시: `{base}_1`, `{base}_2` suffix 자동 부여 후 재시도

- **INV-03**: `email`은 반드시 AES 암호화 후 저장된다.
  - 위반 시: 허용 안 함 — 저장 전 항상 `AesEncryptor.encrypt()` 통과

- **INV-04**: 신규 User의 `balance`는 10,000,000원으로 초기화된다.
  - 위반 시: 허용 안 함 — entity 기본값으로 강제

#### 라이프사이클 & 상태 머신
OAuth2 로그인은 User 상태를 변경하지 않는다. User 상태 머신은 기존 정책 유지.

#### 트랜잭션 경계
`findOrCreateSocialUser()` 단일 트랜잭션 내에서 완결된다.
- 조회 → (없으면) INSERT 가 한 트랜잭션으로 처리

#### 동시성 고려사항

| 단계 | 방식 | 적용 여부 | 이유 |
|------|------|-----------|------|
| 1 | Redisson 분산 락 | N | 동일 유저의 동시 OAuth2 콜백은 현실적으로 발생하지 않음 |
| 2 | 낙관적 락 (`@VersionColumn`) | N | 신규 INSERT 경쟁 없음; 기존 User 조회 시 잔고 변경 없음 |
| 3 | 멱등성 키 | N | 브라우저 리다이렉트 기반으로 클라이언트 재요청이 없음 |

#### 도메인 이벤트
없음 — OAuth2 로그인은 비동기 팬아웃이 필요한 부수 효과가 없다.

---

## 4. 애그리거트 관계도

```
User (기존 애그리거트)
  └─── OAuth2 로그인으로 FindOrCreate
         └─── issueTokens() → JWT 반환
```

---

## 5. 도메인 이벤트

없음

---

## 6. 도메인 서비스

### OAuthAuthenticationService (= 기존 UserService로 흡수)

- **책임**: OAuthProfile을 받아 User를 FindOrCreate하고 JWT를 발급한다.
- **관여 애그리거트**: `User`
- **로직 요약**:
  1. `UserRepository.findByProviderAndProviderId(provider, providerId)`
  2. 없으면 `User` 신규 생성 (nickname 중복 자동 해소 포함)
  3. `JwtProvider.generateAccessToken()` + `generateRefreshToken()`
- **트랜잭션 전략**: 단일 트랜잭션 (`findOrCreateSocialUser`) + 트랜잭션 외 JWT 발급

---

## 7. 크로스-애그리거트 상호작용

없음 — User 단일 애그리거트로 완결.

---

## 8. 레포지토리 인터페이스

### UserRepository (기존 — 추가 메서드만)

```typescript
findByProviderAndProviderId(provider: AuthProvider, providerId: string): Promise<User | null>
// 이미 구현되어 있음
```

---

## 9. 패키지 구조 제안

```
src/domain/user/
├── entity/
│   └── user.entity.ts           ← 기존 (변경 없음)
├── service/
│   ├── user.service.ts          ← 기존 (findOrCreateSocialUser 이미 구현)
│   ├── jwt.strategy.ts          ← 기존
│   ├── google.strategy.ts       ← 신규
│   └── kakao.strategy.ts        ← 신규
├── guard/
│   ├── google-auth.guard.ts     ← 신규 (AuthGuard('google') 래퍼)
│   └── kakao-auth.guard.ts      ← 신규 (AuthGuard('kakao') 래퍼)
├── controller/
│   └── auth.controller.ts       ← 기존 + OAuth2 엔드포인트 추가
└── user.module.ts               ← 신규 Strategy/Guard 등록
```

---

## 10. 설계 결정 사항 (ADR)

### ADR-01: 콜백 URL — 프로바이더별 분리 vs 공통 파라미터
- **결정**: 프로바이더별 분리 — `/oauth2/callback/google`, `/oauth2/callback/kakao`
- **이유**: Passport strategy 별로 Guard가 분리되어 있어 단일 라우트로 공유하려면 커스텀 로직이 필요. 프로바이더별 분리가 NestJS passport 패턴에 자연스럽다.
- **trade-off**: 라우트 수가 늘어나지만 각 전략이 독립적으로 테스트 가능.

### ADR-02: JWT 전달 방식 — 쿼리파람 vs httpOnly 쿠키
- **결정**: 쿼리파람 (`?accessToken=...&refreshToken=...`)
- **이유**: 프론트엔드 `OAuth2Callback.tsx`가 이미 쿼리파람 방식으로 구현되어 있어 변경하지 않음.
- **trade-off**: 쿼리파람 토큰은 브라우저 히스토리/로그에 노출 위험. 향후 httpOnly 쿠키 방식 전환 고려.

### ADR-03: 실패 리다이렉트
- **결정**: 콜백 실패 시 서버에서 직접 `/login?error=oauth_failed` 로 리다이렉트
- **이유**: Passport 예외를 NestJS 필터로 잡아 JSON을 반환하면 브라우저 리다이렉트 흐름이 깨짐. 302 redirect가 자연스럽다.
- **trade-off**: 에러 상세 메시지를 클라이언트에 노출하지 않는 대신 디버깅이 어려울 수 있음 — 서버 로그에 기록.

---

## 11. 아키텍처 위험 요소

- **환경변수 미설정 시 서버 기동 실패**: `GOOGLE_CLIENT_ID` 등 4개 환경변수가 없으면 Passport Strategy DI 초기화 실패. 배포 전 `.env.example` 기반 체크리스트 확인 필수.
- **콜백 URL 불일치**: Google/Kakao 개발자 콘솔에 등록된 Redirect URI와 `OAUTH2_REDIRECT_URI` + 서버 콜백 경로가 일치해야 함. 로컬/스테이징/프로덕션 환경별 각각 등록 필요.
- **JWT 토큰 URL 노출**: 쿼리파람 방식이므로 브라우저 히스토리에 토큰이 남음. `OAuth2Callback.tsx`에서 `history.replaceState`로 URL 정리 권장.

---

## 12. TBD

- [ ] Kakao 개발자 콘솔 Redirect URI 등록 (배포 URL 확정 후)
- [ ] Google Cloud Console Redirect URI 허용 목록 추가 (배포 URL 확정 후)
- [ ] `OAuth2Callback.tsx`에서 `history.replaceState`로 URL에서 토큰 제거 (보안 개선)
- [ ] 소셜 계정 탈퇴(회원 탈퇴) 기능은 별도 이슈로 분리
