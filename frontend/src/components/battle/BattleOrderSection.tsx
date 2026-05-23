// ============================================================================
// CUSTOMIZATION — 브랜드 컬러·텍스트만 이 구역에서 수정
// ============================================================================

const COLORS = {
  card: 'bg-zinc-900 border border-zinc-800',
  dropdown: 'bg-zinc-800 border border-zinc-700 text-white',
  dropdownItem: 'hover:bg-zinc-700',
  pricePositive: 'text-[#2DD4BF]',
  priceNegative: 'text-red-400',
  priceNeutral: 'text-zinc-300',
  searchInput: 'bg-zinc-700 border border-zinc-600 text-white placeholder-zinc-500',
} as const;

// ============================================================================
// END CUSTOMIZATION
// ============================================================================

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, Search } from 'lucide-react';
import { useMarketTickers } from '../../hooks/useMarketTickers';
import { useTickerStore } from '../../store/tickerStore';
import { BattleOrderPanel } from './BattleOrderPanel';

interface BattleOrderSectionProps {
  battleId: string;
  battleBalance: number;
  disabled?: boolean;
}

const formatKRW = (n: number) => new Intl.NumberFormat('ko-KR').format(Math.round(n));

export function BattleOrderSection({ battleId, battleBalance, disabled = false }: BattleOrderSectionProps) {
  useMarketTickers();
  const tickers = useTickerStore((s) => s.tickers);

  const [selectedTicker, setSelectedTicker] = useState('KRW-BTC');
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const tickerList = Array.from(tickers.values());
  const filtered = tickerList.filter((t) =>
    t.market.toLowerCase().includes(search.toLowerCase()),
  );

  const currentTicker = tickers.get(selectedTicker);
  const currentPrice = currentTicker?.tradePrice ?? 0;
  const isPositive = (currentTicker?.changeRate ?? 0) >= 0;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={`${COLORS.card} rounded-2xl p-4 space-y-3 ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
      {disabled && (
        <div className="text-center py-1 text-xs font-semibold text-zinc-500">
          배틀이 종료되어 거래가 불가합니다
        </div>
      )}
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setIsOpen((v) => !v)}
          className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl ${COLORS.dropdown} text-sm font-semibold transition-colors`}
        >
          <div className="flex items-center gap-2">
            <span className="text-white">{selectedTicker.replace('KRW-', '')}</span>
            {currentPrice > 0 && (
              <span className={`font-mono text-xs ${isPositive ? COLORS.pricePositive : COLORS.priceNegative}`}>
                {formatKRW(currentPrice)} KRW
              </span>
            )}
          </div>
          <ChevronDown
            className={`w-4 h-4 text-zinc-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          />
        </button>

        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              transition={{ duration: 0.15 }}
              className="absolute z-20 top-full mt-1 w-full rounded-xl bg-zinc-800 border border-zinc-700 shadow-xl overflow-hidden"
            >
              <div className="p-2 border-b border-zinc-700">
                <div className={`flex items-center gap-2 px-2 py-1.5 rounded-lg ${COLORS.searchInput} border`}>
                  <Search className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="코인 검색..."
                    className="flex-1 bg-transparent text-xs outline-none text-white placeholder:text-zinc-500"
                    autoFocus
                  />
                </div>
              </div>
              <div className="max-h-52 overflow-y-auto">
                {filtered.length === 0 ? (
                  <p className="text-center py-4 text-xs text-zinc-600">검색 결과 없음</p>
                ) : (
                  filtered.map((t) => {
                    const pos = (t.changeRate ?? 0) >= 0;
                    return (
                      <button
                        key={t.market}
                        onClick={() => {
                          setSelectedTicker(t.market);
                          setIsOpen(false);
                          setSearch('');
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2 text-xs transition-colors ${COLORS.dropdownItem} ${
                          t.market === selectedTicker ? 'bg-zinc-700' : ''
                        }`}
                      >
                        <span className="font-semibold text-white">
                          {t.market.replace('KRW-', '')}
                        </span>
                        <span className={`font-mono ${pos ? COLORS.pricePositive : COLORS.priceNegative}`}>
                          {formatKRW(t.tradePrice)} KRW
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <BattleOrderPanel
        battleId={battleId}
        ticker={selectedTicker}
        currentPrice={currentPrice}
        battleBalance={battleBalance}
        disabled={disabled}
      />
    </div>
  );
}
