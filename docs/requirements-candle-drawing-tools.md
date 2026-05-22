# 요구사항 명세서 — 캔들 차트 드로잉 도구

## 1. 개요

- **기능 목적**: CoinDetailPage의 lightweight-charts 캔들 차트 위에 사용자가 수평선·추세선을 직접 그려 분석 메모를 시각화할 수 있게 한다.
- **핵심 사용자**: USER (인증된 플레이어)
- **범위**
  - In Scope: 수평선 생성(클릭 1회), 추세선 생성(클릭 2회), 그려진 선 삭제(더블클릭), 도구 선택 툴바 UI
  - Out of Scope: 서버 저장/동기화, 색상·두께 커스터마이징, 피보나치·채널 등 고급 도형, 모바일 터치 제스처(핀치 드로잉)

---

## 2. UI 컴포넌트 구조

```
CoinDetailPage
└── DrawingToolbar          ← 신규: 도구 선택 버튼
└── CandleChart             ← 수정: 드로잉 이벤트 처리
    ├── lightweight-charts canvas
    └── 투명 오버레이 div   ← 마우스 이벤트 수신
```

### DrawingToolbar

| 도구 | 아이콘 | 동작 |
|------|--------|------|
| `cursor` (기본) | MousePointer | 차트 기본 조작 (pan/zoom) 유지 |
| `hline` | Minus | 클릭 1회 → 해당 가격에 수평선 생성 |
| `trendline` | TrendingUp | 클릭 1회 → 시작점, 클릭 2회 → 끝점, 직선 확정 |

활성 도구는 시각적으로 강조(배경색 변경). 도구 선택 시 차트 커서 모양 변경(`crosshair` → `pointer` 또는 `crosshair`).

---

## 3. 비즈니스 규칙

1. **BR-01** 커서 모드에서 드로잉 불가
   - 조건: `activeTool === 'cursor'` 상태에서 차트 클릭
   - 처리: lightweight-charts 기본 pan/zoom 동작 유지, 선 생성 없음

2. **BR-02** 수평선 — 클릭 시 해당 가격 고정
   - 조건: `activeTool === 'hline'`
   - 처리: `series.coordinateToPrice(y)` 로 가격 추출 → `series.createPriceLine()` 호출
   - 위반 시: 차트 영역 밖 클릭은 무시

3. **BR-03** 추세선 — 2-클릭 확정
   - 조건: `activeTool === 'trendline'`
   - 1차 클릭: 시작점(time, price) 저장, 미리보기 선 표시 (마우스 이동 따라 업데이트)
   - 2차 클릭: 끝점 확정, LineSeries 데이터 확정
   - ESC 키: 진행 중인 추세선 취소

4. **BR-04** 선 삭제 — 더블클릭
   - 조건: 기존에 그려진 선 위에서 더블클릭
   - 수평선: `series.removePriceLine(priceLine)`
   - 추세선: `chart.removeSeries(lineSeries)`
   - 구현 참고: 더블클릭 좌표 → 가장 가까운 선까지의 픽셀 거리 계산, 10px 이내이면 삭제 대상으로 판정

5. **BR-05** 선 개수 제한
   - 수평선 최대 20개, 추세선 최대 20개
   - 초과 시 가장 오래된 선 자동 삭제 (FIFO)

6. **BR-06** 캔들 단위 변경 시 선 유지
   - 조건: `CoinDetailPage`에서 캔들 단위 탭 변경
   - 수평선: 가격 기준이므로 유지 (lightweight-charts `createPriceLine` 은 시간 축 무관)
   - 추세선: 시간 좌표가 달라지므로 **초기화** (단위별 선 독립 관리)

7. **BR-07** 티커 변경 시 전체 초기화
   - 조건: 다른 코인 상세 페이지로 이동
   - 처리: 수평선·추세선 전체 제거 (컴포넌트 unmount 시 cleanup)

---

## 4. 사용자 & 권한

| 역할 | 접근 |
|------|------|
| `USER` (인증) | 드로잉 도구 사용 가능 |
| `GUEST` (비인증) | AuthGuard로 CoinDetailPage 진입 불가 — 해당 없음 |

---

## 5. 주요 시나리오

### Happy Path — 수평선 생성

1. 사용자가 DrawingToolbar에서 수평선(─) 버튼 클릭 → `activeTool = 'hline'`
2. 차트 위 원하는 가격대 클릭
3. `series.coordinateToPrice(y)` 로 가격 추출
4. `series.createPriceLine({ price, color: '#facc15', lineStyle: LineStyle.Dashed, lineWidth: 1 })` 호출
5. 황색 점선 수평선 차트에 표시됨

### Happy Path — 추세선 생성

1. 사용자가 DrawingToolbar에서 추세선(↗) 버튼 클릭 → `activeTool = 'trendline'`
2. 시작점 클릭 → `pendingStart = { time, price }` 저장, 마우스 이동 시 임시 선 미리보기
3. 끝점 클릭 → `chart.addSeries(LineSeries)` 에 `[start, end]` 데이터 설정
4. 흰색 직선 차트에 표시됨
5. `activeTool` 은 `'trendline'` 유지 (연속 드로잉 가능)

### Happy Path — 선 삭제

1. 사용자가 삭제할 선 위에서 더블클릭
2. 클릭 좌표 기준 10px 이내 선 탐색
3. 해당 선 제거 (`removePriceLine` 또는 `removeSeries`)
4. `drawnLines` 상태에서도 제거

### 예외 시나리오

| 시나리오 | 처리 방식 |
|----------|-----------|
| 차트 영역 밖 클릭 | 이벤트 무시 |
| 추세선 진행 중 ESC | `pendingStart` 초기화, 미리보기 선 제거 |
| 캔들 단위 변경 | 추세선 전체 초기화, 수평선 유지 |
| 선 20개 초과 | 가장 오래된 선 자동 삭제 후 신규 선 추가 |
| 컴포넌트 unmount | chart.remove() 시 모든 시리즈 자동 cleanup |

---

## 6. 비기능 요구사항

- **성능**: 마우스 이동 이벤트는 `requestAnimationFrame` 또는 throttle(16ms)로 처리해 60fps 미리보기 보장
- **반응형**: 모바일(md:hidden 영역, height=220)에서도 동일하게 동작. 터치 tap은 click 이벤트로 처리
- **접근성**: 툴바 버튼에 `aria-label`, `aria-pressed` 속성 부여
- **상태 관리**: 서버 저장 없음 — 로컬 `useState`로 관리, 페이지 새로고침 시 초기화됨

---

## 7. 미결 사항 (TBD)

- [ ] 모바일 터치 드로잉 지원 여부 (핀치 충돌 가능성 있음)
- [ ] 추세선 연장(extend) 옵션 — 양방향 무한 연장 여부
- [ ] 로컬스토리지 선 영속화 — 새로고침 후에도 유지할지
