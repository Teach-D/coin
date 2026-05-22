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
} as const;

// ============================================================================
// END CUSTOMIZATION
// ============================================================================

import { useEffect, useRef } from 'react';
import {
  createChart,
  CandlestickSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
  type MouseEventParams,
} from 'lightweight-charts';
import type { CandleData } from '../types';

function formatUTC(ts: number): string {
  const d = new Date(ts * 1000);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mi = String(d.getUTCMinutes()).padStart(2, '0');
  return `${yyyy}.${mm}.${dd} ${hh}:${mi}`;
}

interface CandleChartProps {
  candles: CandleData[];
  height?: number;
}

export function CandleChart({ candles, height = 360 }: CandleChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const timeLabelRef = useRef<HTMLDivElement>(null);

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
      el.textContent = formatUTC(param.time as number);
      el.style.left = `${x}px`;
      el.style.display = 'block';
    });

    // width=0 으로 생성된 경우(display:none 컨테이너 등) ResizeObserver가
    // 처음 non-zero 폭을 감지할 때 fitContent를 재호출해 데이터를 보정한다.
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
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [height]);

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

  return (
    <div ref={containerRef} style={{ height }} className="w-full relative">
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
    </div>
  );
}
