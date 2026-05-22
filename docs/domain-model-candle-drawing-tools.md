# 도메인 모델 — 캔들 차트 드로잉 도구

> 순수 프론트엔드 기능. DB 엔티티 없음. 상태는 컴포넌트 로컬 메모리에만 존재.

---

## 클라이언트 상태 모델

```typescript
type DrawingTool = 'cursor' | 'hline' | 'trendline';

interface HLine {
  id: string;           // nanoid
  price: number;
  priceLine: IPriceLine; // lightweight-charts 핸들
}

interface TrendLine {
  id: string;
  startTime: UTCTimestamp;
  startPrice: number;
  endTime: UTCTimestamp;
  endPrice: number;
  series: ISeriesApi<'Line'>; // lightweight-charts 핸들
}

type DrawnLine = { type: 'hline'; data: HLine } | { type: 'trendline'; data: TrendLine };

interface DrawingState {
  activeTool: DrawingTool;
  drawnLines: DrawnLine[];
  pendingStart: { time: UTCTimestamp; price: number } | null; // 추세선 1차 클릭 후
}
```

---

## 상태 전이

```
activeTool: cursor → hline → trendline → cursor (순환 선택)

추세선 드로잉:
  idle → [1차 클릭] → pending(startPoint 저장) → [2차 클릭] → confirmed → idle
       ↑←←←←←←←←←←←←←←←←←←← [ESC] ←←←←←←←←←←←←←←←←←←←↑
```

---

## 컴포넌트 의존 관계

```
CoinDetailPage
├── useDrawingTool()          ← 상태 관리 훅 (activeTool, drawnLines, handlers)
├── DrawingToolbar            ← activeTool 표시, setActiveTool 호출
└── CandleChart
    ├── chartRef (IChartApi)
    ├── seriesRef (ISeriesApi<'Candlestick'>)
    └── onChartClick(x, y)    ← DrawingState 기반 분기 처리
        onChartDblClick(x, y) ← 삭제 처리
        onMouseMove(x, y)     ← 추세선 미리보기
```

---

## lightweight-charts API 매핑

| 드로잉 | API | 비고 |
|--------|-----|------|
| 수평선 생성 | `series.createPriceLine({ price, color, lineStyle, lineWidth })` | `IPriceLine` 핸들 반환 |
| 수평선 삭제 | `series.removePriceLine(priceLine)` | |
| 추세선 생성 | `chart.addSeries(LineSeries, options)` + `.setData([p1, p2])` | `ISeriesApi<'Line'>` 반환 |
| 추세선 삭제 | `chart.removeSeries(lineSeries)` | |
| 좌표 → 가격 | `series.coordinateToPrice(y)` | |
| 좌표 → 시간 | `chart.timeScale().coordinateToTime(x)` | |
