# 요구사항 명세 — 유저 관리 3종 (배틀방 삭제 · 로그아웃 · 서비스 닉네임)

## 1. 개요

- **기능 목적**: 배틀 방장의 대기방 삭제, 인증 세션 종료(로그아웃), 서비스 전용 닉네임 일관 표시를 지원해 게임 진행 품질과 사용자 정체성을 개선한다.
- **핵심 사용자**: USER (인증된 플레이어)
- **범위**
  - In Scope:
    - WAITING 상태 배틀방을 방장(hostUserId)이 삭제
    - 클라이언트 토큰 전체 소거(로그아웃)
    - OAuth2 콜백 시 서비스 닉네임을 authStore에 즉시 반영
    - 배틀 목록에 hostUserId 노출(방장 식별 및 삭제 버튼 표시)
    - 닉네임 변경 후 실시간 authStore 갱신
  - Out of Scope:
    - 서버 측 토큰 블랙리스트(refresh token revocation)
    - 관리자에 의한 강제 배틀방 삭제
    - 닉네임 이력 관리

---

## 2. 도메인 모델 후보

### 기존 엔티티 재사용 — 신규 엔티티 없음

| 엔티티 | 변경 사항 |
|--------|-----------|
| `Battle` | 변경 없음 (hostUserId 이미 존재) |
| `BattleSession` | 변경 없음 |
| `User` | 변경 없음 (nickname 이미 존재) |

### DTO 변경

| DTO | 변경 사항 |
|-----|-----------|
| `BattleSummary` | `hostUserId: number` 필드 추가 |
| OAuth2 리다이렉트 URL | `nickname` 쿼리 파라미터 추가 |

### 상태 다이어그램 — Battle.status (기존, 삭제 규칙만 추가)

```
WAITING  →  [방장 DELETE]  →  (Hard Delete, DB 행 제거)
WAITING  →  IN_PROGRESS   →  FINISHED
```

---

## 3. 비즈니스 규칙

### 3-A. 배틀방 삭제

1. **BR-01** 방장 본인만 삭제 가능
   - 조건: `battle.hostUserId !== requestUserId`
   - 위반 시: 403 `BATTLE_NOT_HOST`

2. **BR-02** WAITING 상태에서만 삭제 가능
   - 조건: `battle.status !== WAITING`
   - 위반 시: 409 `BATTLE_ALREADY_STARTED`

3. **BR-03** 삭제 시 연관 BattleSession Hard Delete
   - 조건: 항상
   - 처리: `battle_sessions` → `battles` 순서로 삭제 (FK 제약 준수)

4. **BR-04** 삭제 완료 후 Socket.io 브로드캐스트
   - `battle:{battleId}` 룸에 `battle.deleted` 이벤트 발행
   - 이미 참가한 다른 유저가 있을 경우 방이 사라졌음을 즉시 인지

### 3-B. 로그아웃

5. **BR-05** 로그아웃은 클라이언트 토큰 전체 소거
   - `accessToken`, `refreshToken`, `nickname` — localStorage + Zustand 상태 초기화
   - 서버 측 토큰 검증 없음 (JWT stateless)

6. **BR-06** 로그아웃 후 `/login`으로 리다이렉트

### 3-C. 서비스 닉네임

7. **BR-07** OAuth2 로그인 완료 시 닉네임을 프론트엔드로 즉시 전달
   - 백엔드가 리다이렉트 URL에 `nickname` 쿼리 파라미터 추가
   - 프론트엔드 `OAuth2Callback`이 이를 파싱해 `authStore.setNickname()` 호출

8. **BR-08** 닉네임 변경 성공 시 authStore 즉시 갱신
   - `PATCH /api/users/me/nickname` 성공 응답에서 반환된 `nickname`을 `authStore.setNickname()` 호출

9. **BR-09** 닉네임은 2~20자, 공백 제거 후 검증
   - 위반 시: 400 `VALIDATION_FAILED`

10. **BR-10** 닉네임 중복 시 409 `DUPLICATE_NICKNAME`

---

## 4. 사용자 & 권한

| 역할 | JWT 인증 | 접근 가능 리소스 |
|------|----------|-----------------|
| `USER` | 필요 | 본인이 만든 WAITING 배틀방 삭제, 닉네임 변경, 로그아웃 |
| `GUEST` (비인증) | 불필요 | OAuth2 콜백 |

---

## 5. 주요 시나리오

### 5-A. 배틀방 삭제

**Happy Path**

1. 방장 유저가 BattlePage에서 자신이 만든 WAITING 배틀 카드의 삭제 버튼 클릭
2. `DELETE /api/battles/{battleId}` 요청 (JWT 포함)
3. 서버: hostUserId 검증 → WAITING 상태 확인 → 세션 Hard Delete → 배틀 Hard Delete
4. 서버: `battle:{battleId}` 룸에 `battle.deleted` 이벤트 브로드캐스트
5. 응답 204 No Content → 프론트엔드 배틀 목록 자동 갱신

**예외 시나리오**

| 시나리오 | 처리 방식 |
|----------|-----------|
| 방장이 아닌 유저가 삭제 시도 | 403 BATTLE_NOT_HOST |
| 이미 IN_PROGRESS 배틀 삭제 시도 | 409 BATTLE_ALREADY_STARTED |
| 존재하지 않는 battleId | 404 BATTLE_NOT_FOUND |
| 삭제 중 다른 유저가 참가 완료 | redlock으로 직렬화 (join lock 재활용) |

### 5-B. 로그아웃

**Happy Path**

1. 유저가 ProfilePage에서 로그아웃 버튼 클릭
2. 확인 다이얼로그 표시 (선택적)
3. `clearAuth()` 호출 → localStorage + Zustand 초기화
4. `/login` 리다이렉트

**예외 시나리오**

| 시나리오 | 처리 방식 |
|----------|-----------|
| 이미 토큰이 없는 상태에서 로그아웃 | clearAuth() 멱등 처리 후 /login 이동 |

### 5-C. 서비스 닉네임 반영

**Happy Path (최초 로그인)**

1. 유저가 구글 OAuth2 로그인 완료
2. 백엔드가 `?accessToken=...&refreshToken=...&nickname=...` URL로 리다이렉트
3. `OAuth2Callback` 컴포넌트가 세 값을 파싱 → `setTokens()` + `setNickname()` 호출
4. 이후 어디서나 `authStore.nickname`으로 닉네임 표시 가능

**Happy Path (닉네임 변경)**

1. ProfilePage에서 닉네임 수정 후 저장
2. `PATCH /api/users/me/nickname` 성공 응답 수신
3. `updateProfile` 훅이 `authStore.setNickname(response.nickname)` 호출
4. 헤더/프로필 영역에 새 닉네임 즉시 반영

---

## 6. 비기능 요구사항

- **성능**: DELETE 응답 목표 200ms 이내 (세션 삭제는 건수 적어 인덱스 활용으로 충분)
- **동시성**: 배틀방 삭제는 `battle:{battleId}:join` redlock 재활용(삭제 중 참가 차단). 낙관적 락(@VersionColumn)은 삭제에 불필요
- **실시간**: 배틀 삭제 시 `battle:{battleId}` Socket.io 룸 브로드캐스트 → 이미 입장한 참가자에게 즉시 알림
- **데이터 보존**: Hard Delete (배틀 대기방은 게임 이력과 무관)
- **토큰 보안**: 로그아웃은 클라이언트 소거만으로 충분 (서버 블랙리스트 미도입, TBD)

---

## 7. 미결 사항 (TBD)

- [ ] 서버 측 refresh token 블랙리스트 도입 여부 (보안 강화 vs 구현 복잡도)
- [ ] 배틀방 삭제 시 이미 참가한 다른 유저에게 별도 알림 (Push 알림 등) 필요 여부
- [ ] 최초 로그인 시 닉네임 커스텀 설정 강제 화면 도입 여부 (현재: 구글 이름 기반 자동 생성 후 프로필에서 변경)
