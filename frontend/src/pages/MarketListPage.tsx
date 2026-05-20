import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { useMarketTickers } from '../hooks/useMarketTickers';
import { useTickerSubscription } from '../hooks/useTickerSubscription';
import { useTickerStore, type Ticker } from '../store/tickerStore';

type ExchangeFilter = 'ALL' | 'UPBIT' | 'BINANCE';

function formatPrice(market: string, price: number): string {
  if (market.startsWith('USDT-')) {
    if (price >= 1) {
      return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return `$${price.toFixed(6)}`;
  }
  return `₩${price.toLocaleString('ko-KR')}`;
}

function formatRate(rate: number): string {
  const sign = rate > 0 ? '+' : '';
  return `${sign}${(rate * 100).toFixed(2)}%`;
}

function formatVolume(market: string, volume: number): string {
  if (market.startsWith('USDT-')) {
    if (volume >= 1_000_000_000) return `$${(volume / 1_000_000_000).toFixed(1)}B`;
    if (volume >= 1_000_000) return `$${(volume / 1_000_000).toFixed(1)}M`;
    return `$${volume.toLocaleString('en-US')}`;
  }
  if (volume >= 1_000_000_000_000) return `${(volume / 1_000_000_000_000).toFixed(0)}조`;
  if (volume >= 100_000_000) return `${(volume / 100_000_000).toFixed(0)}억`;
  if (volume >= 10_000) return `${(volume / 10_000).toFixed(0)}만`;
  return volume.toLocaleString('ko-KR');
}

function getCoinSymbol(market: string): string {
  return market.split('-')[1] ?? market;
}

function TickerRow({ ticker }: { ticker: Ticker }) {
  const navigate = useNavigate();
  const prevPriceRef = useRef<number>(ticker.tradePrice);
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);

  useEffect(() => {
    if (ticker.tradePrice !== prevPriceRef.current) {
      setFlash(ticker.tradePrice > prevPriceRef.current ? 'up' : 'down');
      prevPriceRef.current = ticker.tradePrice;
      const id = setTimeout(() => setFlash(null), 500);
      return () => clearTimeout(id);
    }
  }, [ticker.tradePrice]);

  const changeColor =
    ticker.change === 'RISE'
      ? 'text-[#2DD4BF]'
      : ticker.change === 'FALL'
      ? 'text-red-500'
      : 'text-zinc-400';

  const flashBg =
    flash === 'up'
      ? 'bg-[#2DD4BF]/10'
      : flash === 'down'
      ? 'bg-red-500/10'
      : '';

  const isUsdt = ticker.market.startsWith('USDT-');

  return (
    <motion.div
      onClick={() => navigate(`/coin/${ticker.market}`)}
      className={`flex items-center px-4 py-3 border-b border-zinc-800 transition-colors duration-300 ${flashBg} hover:bg-zinc-800/50 cursor-pointer`}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-bold text-white text-sm">{getCoinSymbol(ticker.market)}</span>
          <span className="text-xs text-zinc-600">{ticker.market}</span>
          {isUsdt && (
            <span className="text-[10px] bg-yellow-500/15 text-yellow-400 px-1.5 py-0.5 rounded font-medium">
              USDT
            </span>
          )}
        </div>
      </div>
      <div className={`text-right w-36 font-mono font-semibold text-sm ${changeColor}`}>
        {formatPrice(ticker.market, ticker.tradePrice)}
      </div>
      <div className={`text-right w-24 font-mono text-sm ${changeColor}`}>
        {formatRate(ticker.changeRate)}
      </div>
      <div className="text-right w-28 text-zinc-500 font-mono text-xs hidden sm:block">
        {formatVolume(ticker.market, ticker.accTradePrice24h)}
      </div>
    </motion.div>
  );
}

function SkeletonRow() {
  return (
    <div className="flex items-center px-4 py-3 border-b border-zinc-800 animate-pulse">
      <div className="flex-1 space-y-1">
        <div className="h-4 bg-zinc-800 rounded w-16" />
        <div className="h-3 bg-zinc-900 rounded w-24" />
      </div>
      <div className="w-36 h-4 bg-zinc-800 rounded" />
      <div className="w-24 h-4 bg-zinc-800 rounded ml-4" />
      <div className="w-28 h-4 bg-zinc-800 rounded ml-4 hidden sm:block" />
    </div>
  );
}

const PAGE_SIZE = 20;

const EXCHANGE_TABS: { value: ExchangeFilter; label: string; badge: string | null }[] = [
  { value: 'ALL', label: '전체', badge: null },
  { value: 'UPBIT', label: '업비트', badge: 'KRW' },
  { value: 'BINANCE', label: '바이낸스', badge: 'USDT' },
];

export function MarketListPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [exchangeFilter, setExchangeFilter] = useState<ExchangeFilter>('ALL');
  const { isLoading, isError, refetch } = useMarketTickers();
  const tickers = useTickerStore((s) => s.tickers);

  const filtered = Array.from(tickers.values())
    .filter((t) => {
      if (exchangeFilter === 'UPBIT') return t.market.startsWith('KRW-');
      if (exchangeFilter === 'BINANCE') return t.market.startsWith('USDT-');
      return true;
    })
    .filter((t) => getCoinSymbol(t.market).toLowerCase().includes(search.toLowerCase()));

  const sorted = [...filtered].sort((a, b) => b.accTradePrice24h - a.accTradePrice24h);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paginated = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useTickerSubscription(paginated.map((t) => t.market));

  const handleSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleExchangeFilter = (value: ExchangeFilter) => {
    setExchangeFilter(value);
    setPage(1);
  };

  return (
    <div className="min-h-screen bg-[#0C0C0D] text-white">
      <header className="sticky top-0 z-10 bg-[#0C0C0D]/95 backdrop-blur border-b border-zinc-800 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <h1 className="text-lg font-extrabold bg-gradient-to-r from-orange-400 to-yellow-400 bg-clip-text text-transparent">
            CoinBattle
          </h1>
          <span className="text-xs bg-[#2DD4BF]/20 text-[#2DD4BF] px-2 py-0.5 rounded-full font-medium">
            실시간
          </span>
          {!isLoading && sorted.length > 0 && (
            <span className="text-xs text-zinc-600 ml-auto">{sorted.length}개</span>
          )}
        </div>
      </header>

      <main className="max-w-2xl mx-auto">
        <div className="px-4 pt-3 pb-2">
          <div className="flex items-center gap-1.5">
            {EXCHANGE_TABS.map((tab) => (
              <motion.button
                key={tab.value}
                onClick={() => handleExchangeFilter(tab.value)}
                whileTap={{ scale: 0.96 }}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  exchangeFilter === tab.value
                    ? 'bg-orange-500 text-white'
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
                }`}
              >
                {tab.label}
                {tab.badge && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                      exchangeFilter === tab.value
                        ? 'bg-white/20 text-white'
                        : tab.value === 'BINANCE'
                        ? 'bg-yellow-500/15 text-yellow-400'
                        : 'bg-[#2DD4BF]/15 text-[#2DD4BF]'
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </motion.button>
            ))}
          </div>
        </div>

        <div className="px-4 pb-3">
          <input
            type="text"
            placeholder="코인 검색..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
          />
        </div>

        <div className="flex items-center px-4 py-2 text-xs text-zinc-600 border-b border-zinc-800">
          <div className="flex-1">코인</div>
          <div className="w-36 text-right">현재가</div>
          <div className="w-24 text-right">등락률</div>
          <div className="w-28 text-right hidden sm:block">거래대금</div>
        </div>

        {isError && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <p className="text-zinc-500 text-sm">시세를 불러올 수 없습니다</p>
            <button
              onClick={() => refetch()}
              className="px-5 py-2 bg-orange-500 hover:bg-orange-400 active:bg-orange-600 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              다시 시도
            </button>
          </div>
        )}

        {isLoading && (
          <div>
            {Array.from({ length: PAGE_SIZE }).map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        )}

        {!isLoading && !isError && (
          <AnimatePresence>
            {paginated.map((ticker) => (
              <TickerRow key={ticker.market} ticker={ticker} />
            ))}
          </AnimatePresence>
        )}

        {!isLoading && !isError && sorted.length === 0 && search && (
          <p className="text-center py-20 text-zinc-600 text-sm">
            "{search}"에 대한 결과가 없습니다
          </p>
        )}

        {!isLoading && !isError && sorted.length === 0 && !search && exchangeFilter !== 'ALL' && (
          <p className="text-center py-20 text-zinc-600 text-sm">
            {exchangeFilter === 'UPBIT' ? '업비트' : '바이낸스'} 마켓 시세를 불러오는 중입니다
          </p>
        )}

        {!isLoading && !isError && totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 px-4 py-4 border-t border-zinc-800">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 text-xs rounded-lg bg-zinc-800 text-zinc-400 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              이전
            </button>
            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
                .reduce<(number | '...')[]>((acc, p, idx, arr) => {
                  if (idx > 0 && (arr[idx - 1] as number) + 1 < p) acc.push('...');
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, i) =>
                  p === '...' ? (
                    <span key={`ellipsis-${i}`} className="px-1 text-xs text-zinc-600">…</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setPage(p as number)}
                      className={`w-7 h-7 text-xs rounded-lg transition-colors ${
                        page === p
                          ? 'bg-orange-500 text-white font-semibold'
                          : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                      }`}
                    >
                      {p}
                    </button>
                  )
                )}
            </div>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 text-xs rounded-lg bg-zinc-800 text-zinc-400 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              다음
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
