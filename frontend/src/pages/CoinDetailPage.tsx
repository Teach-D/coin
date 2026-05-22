// ============================================================================
// CUSTOMIZATION — 브랜드 컬러·텍스트만 이 구역에서 수정
// ============================================================================

const COLORS = {
  background: 'bg-[#0C0C0D]',
  header: 'bg-[#0C0C0D]/95 backdrop-blur border-b border-zinc-800',
  backButton: 'text-zinc-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-zinc-800',
  priceRise: 'text-[#2DD4BF]',
  priceFall: 'text-red-400',
  priceEven: 'text-zinc-400',
  badgeRise: 'bg-[#2DD4BF]/15 text-[#2DD4BF]',
  badgeFall: 'bg-red-500/15 text-red-400',
  badgeEven: 'bg-zinc-800 text-zinc-400',
  tabActive: 'text-white border-b-2 border-orange-500',
  tabInactive: 'text-zinc-500 border-b-2 border-transparent hover:text-zinc-300',
  chartTabActive: 'text-white border-b-2 border-orange-500',
  chartTabInactive: 'text-zinc-500 border-b-2 border-transparent hover:text-zinc-300',
} as const;

const CANDLE_UNITS = [
  { value: 1, label: '1분' },
  { value: 3, label: '3분' },
  { value: 5, label: '5분' },
  { value: 15, label: '15분' },
  { value: 60, label: '60분' },
  { value: 240, label: '240분' },
] as const;

// ============================================================================
// END CUSTOMIZATION
// ============================================================================

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft } from 'lucide-react';
import { useTickerStore } from '../store/tickerStore';
import { useTickerSubscription } from '../hooks/useTickerSubscription';
import { OrderPanel } from '../components/OrderPanel';
import { PortfolioWidget } from '../components/PortfolioWidget';
import { CandleChart } from '../components/CandleChart';
import { api } from '../lib/api';
import type { CandleData, CandleUnit, CandleResponse, ApiResponse } from '../types';

function getPagesForUnit(unit: CandleUnit): number {
  if (unit === 5 || unit === 15) return 5;
  return 10;
}

type MobileTab = 'order' | 'position';

function formatPrice(price: number): string {
  return price.toLocaleString('ko-KR');
}

function formatRate(rate: number): string {
  const sign = rate > 0 ? '+' : '';
  return `${sign}${(rate * 100).toFixed(2)}%`;
}

function getCoinSymbol(market: string): string {
  return market.replace('KRW-', '');
}

const KST_OFFSET_SECONDS = 9 * 3600;

function toUnixSeconds(utcString: string): number {
  return Math.floor(new Date(utcString + 'Z').getTime() / 1000) + KST_OFFSET_SECONDS;
}

function ChartSkeleton({ height }: { height: number }) {
  return (
    <div
      className="w-full animate-pulse rounded bg-zinc-800"
      style={{ height }}
    />
  );
}

export function CoinDetailPage() {
  const { ticker = '' } = useParams<{ ticker: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<MobileTab>('order');
  const [candleUnit, setCandleUnit] = useState<CandleUnit>(1);
  const [candles, setCandles] = useState<CandleData[]>([]);
  const [candlesLoading, setCandlesLoading] = useState(true);

  const tickers = useTickerStore((s) => s.tickers);
  const tickerData = tickers.get(ticker);
  const currentPrice = tickerData?.tradePrice ?? 0;
  const changeRate = tickerData?.changeRate ?? 0;
  const change = tickerData?.change ?? 'EVEN';

  useTickerSubscription([ticker]);

  useEffect(() => {
    if (!ticker) return;

    let cancelled = false;
    setCandlesLoading(true);

    api
      .get<ApiResponse<CandleResponse>>(`/api/market/${ticker}/candles`, {
        params: { unit: candleUnit, count: 200, pages: getPagesForUnit(candleUnit) },
      })
      .then((res) => {
        if (cancelled) return;
        const raw = res.data.data.candles;
        setCandles(
          raw.map((c) => ({
            time: toUnixSeconds(c.candleDateTimeUtc),
            open: c.openingPrice,
            high: c.highPrice,
            low: c.lowPrice,
            close: c.tradePrice,
          }))
        );
      })
      .catch(() => {
        if (!cancelled) setCandles([]);
      })
      .finally(() => {
        if (!cancelled) setCandlesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [ticker, candleUnit]);

  const priceColor =
    change === 'RISE' ? COLORS.priceRise : change === 'FALL' ? COLORS.priceFall : COLORS.priceEven;
  const badgeColor =
    change === 'RISE' ? COLORS.badgeRise : change === 'FALL' ? COLORS.badgeFall : COLORS.badgeEven;

  return (
    <div className={`min-h-screen ${COLORS.background} text-white`}>
      <header className={`sticky top-0 z-20 ${COLORS.header}`}>
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className={COLORS.backButton}
            aria-label="뒤로가기"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
              <h1 className="text-base font-bold text-white leading-none">
                {getCoinSymbol(ticker)}
              </h1>
              <span className="text-xs text-zinc-600">{ticker}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {currentPrice > 0 ? (
              <>
                <span className={`text-base font-bold font-mono ${priceColor}`}>
                  ₩{formatPrice(currentPrice)}
                </span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badgeColor}`}>
                  {formatRate(changeRate)}
                </span>
              </>
            ) : (
              <div className="h-5 w-32 bg-zinc-800 rounded animate-pulse" />
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-4">
        <motion.div
          className="mb-4"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="flex gap-1 border-b border-zinc-800 mb-0">
            {CANDLE_UNITS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setCandleUnit(value as CandleUnit)}
                className={`px-3 py-2 text-xs font-semibold transition-colors ${
                  candleUnit === value ? COLORS.chartTabActive : COLORS.chartTabInactive
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="rounded-b-xl overflow-hidden">
            {candlesLoading ? (
              <>
                <ChartSkeleton height={360} />
                <div className="md:hidden">
                  <ChartSkeleton height={220} />
                </div>
              </>
            ) : (
              <>
                <div className="hidden md:block">
                  <CandleChart candles={candles} height={360} />
                </div>
                <div className="md:hidden">
                  <CandleChart candles={candles} height={220} />
                </div>
              </>
            )}
          </div>
        </motion.div>

        <div className="hidden md:grid md:grid-cols-5 gap-4">
          <div className="md:col-span-3">
            <PortfolioWidget />
          </div>
          <div className="md:col-span-2">
            <OrderPanel ticker={ticker} currentPrice={currentPrice} />
          </div>
        </div>

        <div className="md:hidden">
          <div className="flex border-b border-zinc-800 mb-4">
            <button
              onClick={() => setActiveTab('order')}
              className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
                activeTab === 'order' ? COLORS.tabActive : COLORS.tabInactive
              }`}
            >
              주문
            </button>
            <button
              onClick={() => setActiveTab('position')}
              className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
                activeTab === 'position' ? COLORS.tabActive : COLORS.tabInactive
              }`}
            >
              포지션
            </button>
          </div>

          <AnimatePresence mode="wait">
            {activeTab === 'order' ? (
              <motion.div
                key="order"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 12 }}
                transition={{ duration: 0.18 }}
              >
                <OrderPanel ticker={ticker} currentPrice={currentPrice} />
              </motion.div>
            ) : (
              <motion.div
                key="position"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.18 }}
              >
                <PortfolioWidget />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
