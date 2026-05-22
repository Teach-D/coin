# API 명세 — 캔들 차트 드로잉 도구

> 순수 프론트엔드 기능. 신규 HTTP 엔드포인트 없음.
> 기존 `GET /api/market/{ticker}/candles` 를 그대로 사용하며 서버 변경 불필요.

---

## 컴포넌트 인터페이스

### DrawingToolbar Props

```typescript
interface DrawingToolbarProps {
  activeTool: DrawingTool;          // 현재 선택된 도구
  onToolChange: (tool: DrawingTool) => void;
}
```

### CandleChart Props (추가)

```typescript
interface CandleChartProps {
  candles: CandleData[];
  height?: number;
  liveCandle?: CandleData;
  // 드로잉 도구 연동 (optional — 미전달 시 드로잉 비활성)
  drawingTool?: DrawingTool;
  onHLineCreate?: (price: number) => void;
  onTrendLineCreate?: (start: Point, end: Point) => void;
  onLineDelete?: (id: string) => void;
}

interface Point {
  time: UTCTimestamp;
  price: number;
}
```

### useDrawingTool 반환 타입

```typescript
interface UseDrawingToolReturn {
  activeTool: DrawingTool;
  setActiveTool: (tool: DrawingTool) => void;
  drawnLines: DrawnLine[];
  addHLine: (price: number, priceLine: IPriceLine) => void;
  addTrendLine: (line: Omit<TrendLine, 'id'>) => void;
  removeLine: (id: string) => void;
  clearTrendLines: () => void;   // 캔들 단위 변경 시 호출
  clearAll: () => void;          // 티커 변경 시 호출
}
```
