// ============================================================================
// CUSTOMIZATION — 차트 색상·테마만 이 구역에서 수정
// ============================================================================

const CHART_COLORS = {
  background: '#0C0C0D',
  textColor: '#71717A',
  gridLines: '#27272A',
  crosshairLine: '#52525B',
  crosshairLabel: '#3F3F46',
  candleRise: '#2DD4BF',
  candleFall: '#f87171',
  hline: '#facc15',
  trendline: '#ffffff',
  trendlinePreview: 'rgba(255,255,255,0.5)',
} as const;

const MAX_LINES = 20;

// ============================================================================
// END CUSTOMIZATION
// ============================================================================

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
  type UTCTimestamp,
  type MouseEventParams,
} from 'lightweight-charts';
import type { CandleData } from '../types';
import type { DrawingTool } from '../hooks/useDrawingTool';

function formatKST(ts: number): string {
  const d = new Date(ts * 1000);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mi = String(d.getUTCMinutes()).padStart(2, '0');
  return `${yyyy}.${mm}.${dd} ${hh}:${mi}`;
}

interface HLineEntry {
  id: string;
  price: number;
  priceLine: IPriceLine;
}

interface TrendLineEntry {
  id: string;
  startTime: UTCTimestamp;
  startPrice: number;
  endTime: UTCTimestamp;
  endPrice: number;
  series: ISeriesApi<'Line'>;
}

type DrawnLine =
  | { type: 'hline'; data: HLineEntry }
  | { type: 'trendline'; data: TrendLineEntry };

interface PendingStart {
  time: UTCTimestamp;
  price: number;
}

export interface CandleChartProps {
  candles: CandleData[];
  height?: number;
  liveCandle?: CandleData;
  drawingTool?: DrawingTool;
  onClearTrendLines?: (clearFn: () => void) => void;
  onClearAll?: (clearFn: () => void) => void;
}

export function CandleChart({
  candles,
  height = 360,
  liveCandle,
  drawingTool = 'cursor',
  onClearTrendLines,
  onClearAll,
}: CandleChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const timeLabelRef = useRef<HTMLDivElement>(null);
  const drawnLinesRef = useRef<DrawnLine[]>([]);
  const pendingStartRef = useRef<PendingStart | null>(null);
  const previewSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const rafRef = useRef<number | null>(null);
  const drawingToolRef = useRef<DrawingTool>(drawingTool);
  const lineIdCounterRef = useRef(0);
  const selectedLineIdRef = useRef<string | null>(null);

  const nextId = useCallback(() => `line-${++lineIdCounterRef.current}`, []);

  const [pendingStart, setPendingStart] = useState<PendingStart | null>(null);
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [deleteButtonPos, setDeleteButtonPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    drawingToolRef.current = drawingTool;
  }, [drawingTool]);

  useEffect(() => {
    pendingStartRef.current = pendingStart;
  }, [pendingStart]);

  useEffect(() => {
    selectedLineIdRef.current = selectedLineId;
  }, [selectedLineId]);

  const removePreviewSeries = useCallback(() => {
    if (previewSeriesRef.current && chartRef.current) {
      try {
        chartRef.current.removeSeries(previewSeriesRef.current);
      } catch (err) {
        if (import.meta.env.DEV) console.warn('[CandleChart] series remove failed', err);
      }
      previewSeriesRef.current = null;
    }
  }, []);

  const clearTrendLines = useCallback(() => {
    if (!chartRef.current) return;
    drawnLinesRef.current = drawnLinesRef.current.filter((line) => {
      if (line.type === 'trendline') {
        try {
          chartRef.current!.removeSeries(line.data.series);
        } catch (err) {
          if (import.meta.env.DEV) console.warn('[CandleChart] series remove failed', err);
        }
        return false;
      }
      return true;
    });
    removePreviewSeries();
    setPendingStart(null);
    setSelectedLineId(null);
    setDeleteButtonPos(null);
  }, [removePreviewSeries]);

  const clearAll = useCallback(() => {
    if (!chartRef.current || !seriesRef.current) return;
    drawnLinesRef.current.forEach((line) => {
      if (line.type === 'hline') {
        try {
          seriesRef.current!.removePriceLine(line.data.priceLine);
        } catch (err) {
          if (import.meta.env.DEV) console.warn('[CandleChart] series remove failed', err);
        }
      } else {
        try {
          chartRef.current!.removeSeries(line.data.series);
        } catch (err) {
          if (import.meta.env.DEV) console.warn('[CandleChart] series remove failed', err);
        }
      }
    });
    drawnLinesRef.current = [];
    removePreviewSeries();
    setPendingStart(null);
    setSelectedLineId(null);
    setDeleteButtonPos(null);
  }, [removePreviewSeries]);

  useEffect(() => {
    onClearTrendLines?.(clearTrendLines);
  }, [clearTrendLines, onClearTrendLines]);

  useEffect(() => {
    onClearAll?.(clearAll);
  }, [clearAll, onClearAll]);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height,
      layout: {
        background: { color: CHART_COLORS.background },
        textColor: CHART_COLORS.textColor,
      },
      grid: {
        vertLines: { color: CHART_COLORS.gridLines },
        horzLines: { color: CHART_COLORS.gridLines },
      },
      crosshair: {
        vertLine: {
          color: CHART_COLORS.crosshairLine,
          labelBackgroundColor: CHART_COLORS.crosshairLabel,
          labelVisible: false,
        },
        horzLine: {
          color: CHART_COLORS.crosshairLine,
          labelBackgroundColor: CHART_COLORS.crosshairLabel,
        },
      },
      rightPriceScale: {
        borderColor: CHART_COLORS.gridLines,
      },
      timeScale: {
        borderColor: CHART_COLORS.gridLines,
        timeVisible: true,
        secondsVisible: false,
      },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: CHART_COLORS.candleRise,
      downColor: CHART_COLORS.candleFall,
      borderUpColor: CHART_COLORS.candleRise,
      borderDownColor: CHART_COLORS.candleFall,
      wickUpColor: CHART_COLORS.candleRise,
      wickDownColor: CHART_COLORS.candleFall,
    });

    chartRef.current = chart;
    seriesRef.current = series;

    chart.subscribeCrosshairMove((param: MouseEventParams) => {
      const el = timeLabelRef.current;
      const container = containerRef.current;
      if (!el || !container) return;
      if (!param.time || !param.point) {
        el.style.display = 'none';
        return;
      }
      const containerWidth = container.clientWidth;
      const halfWidth = 55;
      const x = Math.max(halfWidth, Math.min(param.point.x, containerWidth - halfWidth));
      el.textContent = formatKST(param.time as number);
      el.style.left = `${x}px`;
      el.style.display = 'block';
    });

    let lastWidth = containerRef.current.clientWidth;
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry || !chartRef.current) return;
      const newWidth = entry.contentRect.width;
      chartRef.current.applyOptions({ width: newWidth });
      if (lastWidth === 0 && newWidth > 0 && seriesRef.current) {
        chartRef.current.timeScale().fitContent();
      }
      lastWidth = newWidth;
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      previewSeriesRef.current = null;
      drawnLinesRef.current = [];
      pendingStartRef.current = null;
    };
  }, [height]);

  useEffect(() => {
    if (!seriesRef.current || !liveCandle) return;
    seriesRef.current.update({
      time: liveCandle.time as UTCTimestamp,
      open: liveCandle.open,
      high: liveCandle.high,
      low: liveCandle.low,
      close: liveCandle.close,
    });
  }, [liveCandle]);

  useEffect(() => {
    if (!seriesRef.current || candles.length === 0) return;

    const seen = new Set<number>();
    const sorted = [...candles]
      .sort((a, b) => a.time - b.time)
      .filter((c) => {
        if (!isFinite(c.time) || seen.has(c.time)) return false;
        seen.add(c.time);
        return true;
      })
      .map((c) => ({
        time: c.time as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));

    if (sorted.length === 0) return;

    seriesRef.current.setData(sorted);
    chartRef.current?.timeScale().fitContent();
  }, [candles]);

  const getCoordinates = useCallback(
    (offsetX: number, offsetY: number): { time: UTCTimestamp; price: number } | null => {
      const chart = chartRef.current;
      const series = seriesRef.current;
      if (!chart || !series) return null;

      const time = chart.timeScale().coordinateToTime(offsetX) as UTCTimestamp | null;
      const price = series.coordinateToPrice(offsetY);
      if (time === null || price === null) return null;

      return { time, price };
    },
    []
  );

  const deselectLine = useCallback(() => {
    const id = selectedLineIdRef.current;
    if (id) {
      const line = drawnLinesRef.current.find((l) => l.data.id === id);
      if (line?.type === 'hline') {
        line.data.priceLine.applyOptions({ color: CHART_COLORS.hline });
      }
      if (line?.type === 'trendline') {
        line.data.series.applyOptions({ color: CHART_COLORS.trendline });
      }
    }
    setSelectedLineId(null);
    setDeleteButtonPos(null);
  }, []);

  const selectLine = useCallback(
    (id: string, clickX: number, clickY: number) => {
      const line = drawnLinesRef.current.find((l) => l.data.id === id);
      if (!line) return;

      setSelectedLineId(id);

      if (line.type === 'hline') {
        line.data.priceLine.applyOptions({ color: '#f97316' });
        const y = seriesRef.current?.priceToCoordinate(line.data.price) ?? clickY;
        const x = containerRef.current?.clientWidth ? containerRef.current.clientWidth - 30 : clickX;
        setDeleteButtonPos({ x, y: y as number });
      }

      if (line.type === 'trendline') {
        line.data.series.applyOptions({ color: '#f97316' });
        setDeleteButtonPos({ x: clickX, y: clickY - 16 });
      }
    },
    []
  );

  const deleteSelectedLine = useCallback(() => {
    const id = selectedLineIdRef.current;
    if (!id) return;
    const line = drawnLinesRef.current.find((l) => l.data.id === id);
    if (!line) return;
    try {
      if (line.type === 'hline' && seriesRef.current) {
        seriesRef.current.removePriceLine(line.data.priceLine);
      }
      if (line.type === 'trendline' && chartRef.current) {
        chartRef.current.removeSeries(line.data.series);
      }
    } catch (err) {
      if (import.meta.env.DEV) console.warn('[CandleChart] delete failed', err);
    }
    drawnLinesRef.current = drawnLinesRef.current.filter((l) => l.data.id !== id);
    setSelectedLineId(null);
    setDeleteButtonPos(null);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        removePreviewSeries();
        setPendingStart(null);
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedLineIdRef.current) {
        deleteSelectedLine();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [removePreviewSeries, deleteSelectedLine]);

  const addHLine = useCallback((price: number) => {
    const series = seriesRef.current;
    if (!series) return;

    const hlines = drawnLinesRef.current.filter((l) => l.type === 'hline');
    if (hlines.length >= MAX_LINES) {
      const oldest = hlines[0] as { type: 'hline'; data: HLineEntry };
      try {
        series.removePriceLine(oldest.data.priceLine);
      } catch (err) {
        if (import.meta.env.DEV) console.warn('[CandleChart] series remove failed', err);
      }
      drawnLinesRef.current = drawnLinesRef.current.filter(
        (l) => l.type !== 'hline' || l.data.id !== oldest.data.id
      );
    }

    const priceLine = series.createPriceLine({
      price,
      color: CHART_COLORS.hline,
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
    });

    drawnLinesRef.current = [
      ...drawnLinesRef.current,
      { type: 'hline', data: { id: nextId(), price, priceLine } },
    ];
  }, []);

  const addTrendLine = useCallback(
    (start: PendingStart, end: { time: UTCTimestamp; price: number }) => {
      const chart = chartRef.current;
      if (!chart) return;

      const trendlines = drawnLinesRef.current.filter((l) => l.type === 'trendline');
      if (trendlines.length >= MAX_LINES) {
        const oldest = trendlines[0] as { type: 'trendline'; data: TrendLineEntry };
        try {
          chart.removeSeries(oldest.data.series);
        } catch (err) {
          if (import.meta.env.DEV) console.warn('[CandleChart] series remove failed', err);
        }
        drawnLinesRef.current = drawnLinesRef.current.filter(
          (l) => l.type !== 'trendline' || l.data.id !== oldest.data.id
        );
      }

      const lineSeries = chart.addSeries(LineSeries, {
        color: CHART_COLORS.trendline,
        lineWidth: 1,
        lineStyle: LineStyle.Solid,
        crosshairMarkerVisible: false,
        priceLineVisible: false,
        lastValueVisible: false,
      });

      const [t1, t2] = start.time <= end.time ? [start, end] : [end, start];
      lineSeries.setData([
        { time: t1.time, value: t1.price },
        { time: t2.time, value: t2.price },
      ]);

      drawnLinesRef.current = [
        ...drawnLinesRef.current,
        {
          type: 'trendline',
          data: {
            id: nextId(),
            startTime: t1.time,
            startPrice: t1.price,
            endTime: t2.time,
            endPrice: t2.price,
            series: lineSeries,
          },
        },
      ];
    },
    []
  );

  const findNearestLine = useCallback(
    (offsetX: number, offsetY: number): DrawnLine | null => {
      const chart = chartRef.current;
      const series = seriesRef.current;
      if (!chart || !series) return null;

      const THRESHOLD_PX = 10;
      let nearest: DrawnLine | null = null;
      let minDist = Infinity;

      for (const line of drawnLinesRef.current) {
        if (line.type === 'hline') {
          const yCoord = series.priceToCoordinate(line.data.price);
          if (yCoord === null) continue;
          const dist = Math.abs(offsetY - yCoord);
          if (dist < THRESHOLD_PX && dist < minDist) {
            minDist = dist;
            nearest = line;
          }
        } else {
          const { startTime, startPrice, endTime, endPrice } = line.data;
          const x1 = chart.timeScale().timeToCoordinate(startTime);
          const x2 = chart.timeScale().timeToCoordinate(endTime);
          const y1 = series.priceToCoordinate(startPrice);
          const y2 = series.priceToCoordinate(endPrice);
          if (x1 === null || x2 === null || y1 === null || y2 === null) continue;

          const dx = x2 - x1;
          const dy = y2 - y1;
          const len2 = dx * dx + dy * dy;
          if (len2 === 0) continue;

          const t = Math.max(0, Math.min(1, ((offsetX - x1) * dx + (offsetY - y1) * dy) / len2));
          const projX = x1 + t * dx;
          const projY = y1 + t * dy;
          const dist = Math.sqrt((offsetX - projX) ** 2 + (offsetY - projY) ** 2);

          if (dist < THRESHOLD_PX && dist < minDist) {
            minDist = dist;
            nearest = line;
          }
        }
      }
      return nearest;
    },
    []
  );

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const tool = drawingToolRef.current;

      if (tool === 'cursor') {
        const clicked = findNearestLine(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
        if (clicked) {
          deselectLine();
          selectLine(clicked.data.id, e.nativeEvent.offsetX, e.nativeEvent.offsetY);
        } else {
          deselectLine();
        }
        return;
      }

      e.stopPropagation();

      const coords = getCoordinates(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
      if (!coords) return;

      if (tool === 'hline') {
        addHLine(coords.price);
        return;
      }

      if (tool === 'trendline') {
        const pending = pendingStartRef.current;
        if (!pending) {
          setPendingStart(coords);
          return;
        }

        if (pending.time === coords.time) return;

        removePreviewSeries();
        addTrendLine(pending, coords);
        setPendingStart(null);
      }
    },
    [getCoordinates, addHLine, addTrendLine, removePreviewSeries, findNearestLine, deselectLine, selectLine]
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const tool = drawingToolRef.current;
      if (tool !== 'cursor') {
        e.stopPropagation();
        return;
      }

      const nearest = findNearestLine(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
      if (!nearest) return;

      if (nearest.type === 'hline' && seriesRef.current) {
        try {
          seriesRef.current.removePriceLine(nearest.data.priceLine);
        } catch (err) {
          if (import.meta.env.DEV) console.warn('[CandleChart] series remove failed', err);
        }
      } else if (nearest.type === 'trendline' && chartRef.current) {
        try {
          chartRef.current.removeSeries(nearest.data.series);
        } catch (err) {
          if (import.meta.env.DEV) console.warn('[CandleChart] series remove failed', err);
        }
      }

      drawnLinesRef.current = drawnLinesRef.current.filter((l) => l !== nearest);
    },
    [findNearestLine]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (drawingToolRef.current !== 'trendline') return;
      const pending = pendingStartRef.current;
      if (!pending) return;

      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }

      const offsetX = e.nativeEvent.offsetX;
      const offsetY = e.nativeEvent.offsetY;

      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const chart = chartRef.current;
        if (!chart) return;

        const coords = getCoordinates(offsetX, offsetY);
        if (!coords) return;

        if (!previewSeriesRef.current) {
          previewSeriesRef.current = chart.addSeries(LineSeries, {
            color: CHART_COLORS.trendlinePreview,
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            crosshairMarkerVisible: false,
            priceLineVisible: false,
            lastValueVisible: false,
          });
        }

        const [t1, t2] =
          pending.time <= coords.time
            ? [pending, coords]
            : [coords, pending];

        if (t1.time === t2.time) return;

        previewSeriesRef.current.setData([
          { time: t1.time, value: t1.price },
          { time: t2.time, value: t2.price },
        ]);
      });
    },
    [getCoordinates]
  );

  const cursorStyle = drawingTool === 'cursor' ? 'default' : 'crosshair';

  return (
    <div
      ref={containerRef}
      style={{ height, cursor: cursorStyle }}
      className="w-full relative"
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onMouseMove={handleMouseMove}
    >
      <div
        ref={timeLabelRef}
        style={{
          display: 'none',
          position: 'absolute',
          bottom: 2,
          transform: 'translateX(-50%)',
          zIndex: 10,
          pointerEvents: 'none',
          fontSize: 11,
          color: '#ffffff',
          backgroundColor: CHART_COLORS.crosshairLabel,
          padding: '2px 5px',
          borderRadius: 2,
          whiteSpace: 'nowrap',
        }}
      />
      {pendingStart && (
        <div
          style={{
            position: 'absolute',
            top: 4,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10,
            pointerEvents: 'none',
            fontSize: 11,
            color: '#ffffff',
            backgroundColor: 'rgba(12,12,13,0.8)',
            padding: '2px 8px',
            borderRadius: 4,
            whiteSpace: 'nowrap',
            border: '1px solid #3f3f46',
          }}
        >
          끝점을 클릭하세요 (ESC 취소)
        </div>
      )}
      {deleteButtonPos && selectedLineId && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            deleteSelectedLine();
          }}
          style={{
            position: 'absolute',
            left: deleteButtonPos.x,
            top: deleteButtonPos.y,
            transform: 'translate(-50%, -50%)',
            zIndex: 20,
            pointerEvents: 'auto',
          }}
          className="w-5 h-5 flex items-center justify-center rounded-full bg-red-500 hover:bg-red-600 text-white text-xs font-bold"
          aria-label="선 삭제"
        >
          ×
        </button>
      )}
    </div>
  );
}
