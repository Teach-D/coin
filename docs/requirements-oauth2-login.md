# Requirements — OAuth2 소셜 로그인 (Google / Kakao)

> 작성일: 2026-05-19
> 담당 도메인: auth (user)

---

## 1. 개요

- **기능 목적**: Google/Kakao OAuth2를 통해 CoinBattle 신규 유저를 자동 가입시키고 JWT를 발급하여 게임에 진입하게 한다.
- **핵심 사용자**: GUEST (비인증 상태의 방문자)
- **범위**
  - In Scope: GoogleStrategy / KakaoStrategy 구현, OAuth2 인가 엔드포인트, 콜백 엔드포인트, JWT 발급 후 프론트 리다이렉트
  - Out of Scope: 이메일/비밀번호 로그인, 소셜 계정 연동 해제, 실제 결제, 외부 거래소 실주문

---

## 2. 도메인 모델 후보

### 엔티티 목록

| 엔티티 | 핵심 속성 | 기존 엔티티 참조 |
|--------|-----------|-----------------|
| `User` | id, email(암호화), nickname, provider(`GOOGLE`\|`KAKAO`), providerId, role, balance | 기존 User 엔티티 재사용 — 신규 컬럼 없음 |

### 엔티티 간 관계

- 신규 엔티티 없음. 소셜 로그인 시 `User`를 `findOrCreate` 패턴으로 처리.

---

## 3. 비즈니스 규칙

1. **BR-01** 동일 소셜 계정 중복 가입 방지
   - 조건: `(provider, providerId)` 조합이 이미 DB에 존재하는 경우
   - 처리: 기존 `User`를 그대로 반환 (재가입 아닌 로그인 처리)

2. **BR-02** 닉네임 중복 자동 해소
   - 조건: 소셜 프로필 닉네임이 이미 사용 중인 경우
   - 처리: `{nickname}_1`, `{nickname}_2` ... 순서로 suffix 자동 부여 (이미 구현됨)

3. **BR-03** 이메일 암호화 저장
   - 조건: 항상
   - 처리: AesEncryptor로 암호화 후 저장 (이미 구현됨)

4. **BR-04** 초기 잔고 설정
   - 조건: 신규 가입(first-time OAuth2 로그인)
   - 처리: `balance = 10_000_000` (1천만 원) 자동 부여

5. **BR-05** OAuth2 콜백 실패 처리
   - 조건: Google/Kakao 인가 서버에서 오류 응답(`error` 쿼리파람)을 받은 경우
   - 처리: 프론트 `/login?error=oauth_failed` 로 리다이렉트

---

## 4. 사용자 & 권한

| 역할 | JWT 인증 | 접근 가능 리소스 |
|------|----------|-----------------|
| `GUEST` (비인증) | 불필요 | `GET /oauth2/authorization/:provider` (OAuth2 인가 시작), 콜백 URL |
| `USER` | 필요 | 기존 게임 기능 전체 |

---

## 5. 주요 시나리오

### Happy Path

1. 유저가 `LoginPage`에서 "Google로 계속하기" 클릭
2. 프론트가 `GET /oauth2/authorization/google` 요청
3. 서버가 Google 인가 URL로 302 리다이렉트
4. Google 로그인 완료 후 `GET /oauth2/callback/google?code=...` 콜백 도착
5. GoogleStrategy가 `code`로 Google에서 프로필(email, name, sub) 수신
6. `UserService.findOrCreateSocialUser()` 호출 → 신규 가입 or 기존 유저 반환
7. `UserService.issueTokens()` 호출 → JWT accessToken / refreshToken 생성
8. 서버가 `OAUTH2_REDIRECT_URI?accessToken=...&refreshToken=...` 로 302 리다이렉트
9. 프론트 `OAuth2Callback.tsx`가 토큰을 저장 후 `/` 로 이동

### 예외 시나리오

| 시나리오 | 처리 방식 |
|----------|-----------|
| 유저가 Google 인가 화면에서 취소 | Google이 `error=access_denied` 와 함께 콜백 → `/login?error=oauth_failed` 리다이렉트 |
| Kakao 인가 서버 오류 | 동일하게 `/login?error=oauth_failed` 리다이렉트 |
| `providerId`는 같지만 email이 변경된 경우 | 기존 `User` 반환 (email 업데이트 하지 않음 — BR-01 우선) |
| 환경변수 미설정 상태로 기동 | Strategy 생성 시점 NestJS DI 오류로 서버 기동 실패 — 배포 전 필수 확인 |

---

## 6. 비기능 요구사항

- **성능**: OAuth2 콜백은 외부 I/O(Google/Kakao API 호출) 포함 — 목표 응답 2초 이내
- **동시성**: 동일 유저의 동시 OAuth2 콜백은 현실적으로 없음 — 분산 락 불필요
- **Redis 캐시**: 해당 없음 (OAuth2 상태는 Google/Kakao 서버에서 관리)
- **실시간**: 해당 없음
- **비동기 팬아웃**: 해당 없음
- **데이터 보존**: User 엔티티 — Hard delete 없음, 기존 정책 유지
- **외부 연동**: Google OAuth2 API, Kakao OAuth2 API — 각각 client_id / client_secret 필요

---

## 7. 미결 사항 (TBD)

- [ ] Kakao 개발자 콘솔에서 Redirect URI 등록 필요 (배포 URL 확정 후)
- [ ] Google Cloud Console에서 Redirect URI 허용 목록 추가 필요 (배포 URL 확정 후)
- [ ] 소셜 계정 탈퇴(회원 탈퇴) 처리는 별도 기능으로 분리
