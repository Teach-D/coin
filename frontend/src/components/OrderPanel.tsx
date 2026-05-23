// ============================================================================
// CUSTOMIZATION — 브랜드 컬러·텍스트만 이 구역에서 수정
// ============================================================================

const COLORS = {
  long: {
    tab: 'bg-[#2DD4BF] text-black',
    button: 'bg-[#2DD4BF] hover:bg-teal-400 text-black shadow-[0_4px_20px_rgba(45,212,191,0.25)]',
    inputBorder: 'focus-within:border-[#2DD4BF]/50',
    activeBorder: 'border-[#2DD4BF]/40 bg-[#2DD4BF]/10',
  },
  short: {
    tab: 'bg-red-500 text-white',
    button: 'bg-red-500 hover:bg-red-400 text-white shadow-[0_4px_20px_rgba(239,68,68,0.25)]',
    inputBorder: 'focus-within:border-red-500/50',
    activeBorder: 'border-red-500/40 bg-red-500/10',
  },
  leverageActive: 'bg-[#FF6B35]/15 border-[#FF6B35]/40 text-[#FF6B35]',
  leverageInactive: 'bg-zinc-800 border-transparent text-zinc-400 hover:bg-zinc-700',
  orderTypeActive: 'bg-zinc-600 text-white',
  orderTypeInactive: 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700',
  card: 'bg-zinc-900 border border-zinc-800',
  input: 'bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500',
  quickRatio: 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100',
} as const;

const LEVERAGE_OPTIONS = [1, 2, 3, 5, 10] as const;
const QUICK_RATIOS = [0.25, 0.5, 0.75, 1.0] as const;
const QUICK_LABELS = ['25%', '50%', '75%', '100%'] as const;

// ============================================================================
// END CUSTOMIZATION
// ============================================================================

import { useEffect } from 'react';
import { motion } from 'motion/react';
import { Loader2 } from 'lucide-react';
import { useOrderStore } from '../store/orderStore';
import { useBuyOrder } from '../hooks/useOrder';
import { usePortfolio } from '../hooks/usePortfolio';

interface OrderPanelProps {
  ticker: string;
  currentPrice: number;
}

const formatKRW = (n: number) => new Intl.NumberFormat('ko-KR').format(Math.round(n));

function calcLiquidationPrice(
  currentPrice: number,
  direction: 'LONG' | 'SHORT',
  leverage: number,
): number | null {
  if (leverage <= 1) return null;
  const ratio = (1 / leverage) * 0.9;
  return direction === 'LONG'
    ? currentPrice * (1 - ratio)
    : currentPrice * (1 + ratio);
}

export function OrderPanel({ ticker, currentPrice }: OrderPanelProps) {
  usePortfolio();

  const direction = useOrderStore((s) => s.direction);
  const orderType = useOrderStore((s) => s.orderType);
  const amount = useOrderStore((s) => s.amount);
  const leverage = useOrderStore((s) => s.leverage);
  const limitPrice = useOrderStore((s) => s.limitPrice);
  const balance = useOrderStore((s) => s.balance);
  const isSubmitting = useOrderStore((s) => s.isSubmitting);

  const setTicker = useOrderStore((s) => s.setTicker);
  const setDirection = useOrderStore((s) => s.setDirection);
  const setOrderType = useOrderStore((s) => s.setOrderType);
  const setAmount = useOrderStore((s) => s.setAmount);
  const setLeverage = useOrderStore((s) => s.setLeverage);
  const setLimitPrice = useOrderStore((s) => s.setLimitPrice);

  const buyOrder = useBuyOrder();

  useEffect(() => {
    setTicker(ticker);
  }, [ticker, setTicker]);

  useEffect(() => {
    if (orderType === 'LIMIT' && !limitPrice) {
      setLimitPrice(String(currentPrice));
    }
  }, [orderType]);

  const isLong = direction === 'LONG';
  const dirColors = isLong ? COLORS.long : COLORS.short;
  const parsedAmount = parseFloat(amount) || 0;
  const parsedLimitPrice = parseFloat(limitPrice) || 0;
  const positionSize = parsedAmount * leverage;
  const liquidationPrice = calcLiquidationPrice(currentPrice, direction, leverage);

  const isLimitValid = orderType === 'MARKET' || parsedLimitPrice > 0;
  const canSubmit = parsedAmount > 0 && parsedAmount <= balance && isLimitValid && !isSubmitting;

  const handleQuickAmount = (ratio: number) => {
    const value = Math.floor(balance * ratio);
    setAmount(value > 0 ? String(value) : '');
  };

  const handleSubmit = () => {
    if (!canSubmit) return;
    buyOrder.mutate({
      ticker,
      orderType,
      direction,
      amount: parsedAmount,
      leverage,
      limitPrice: orderType === 'LIMIT' && parsedLimitPrice > 0 ? parsedLimitPrice : null,
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={`${COLORS.card} rounded-2xl p-4 space-y-4`}
    >
      <div className="flex rounded-xl overflow-hidden border border-zinc-700">
        <button
          onClick={() => setDirection('LONG')}
          className={`flex-1 py-2.5 text-sm font-bold transition-colors ${
            isLong ? COLORS.long.tab : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
          }`}
        >
          LONG (매수)
        </button>
        <button
          onClick={() => setDirection('SHORT')}
          className={`flex-1 py-2.5 text-sm font-bold transition-colors ${
            !isLong ? COLORS.short.tab : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
          }`}
        >
          SHORT (공매도)
        </button>
      </div>

      <div className="flex rounded-lg overflow-hidden border border-zinc-700 text-xs font-semibold">
        <button
          onClick={() => setOrderType('MARKET')}
          className={`flex-1 py-2 transition-colors ${
            orderType === 'MARKET' ? COLORS.orderTypeActive : COLORS.orderTypeInactive
          }`}
        >
          시장가
        </button>
        <button
          onClick={() => setOrderType('LIMIT')}
          className={`flex-1 py-2 transition-colors ${
            orderType === 'LIMIT' ? COLORS.orderTypeActive : COLORS.orderTypeInactive
          }`}
        >
          지정가
        </button>
      </div>

      {orderType === 'LIMIT' && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2 }}
        >
          <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">
            주문가격
          </label>
          <div className={`flex items-center rounded-xl border px-3 py-2.5 transition-colors bg-zinc-800 border-zinc-700 ${dirColors.inputBorder}`}>
            <input
              type="number"
              value={limitPrice}
              onChange={(e) => setLimitPrice(e.target.value)}
              placeholder={formatKRW(currentPrice)}
              className="flex-1 bg-transparent text-sm font-semibold text-white outline-none placeholder:text-zinc-600"
            />
            <span className="ml-2 text-xs font-semibold text-zinc-500">KRW</span>
          </div>
        </motion.div>
      )}

      <div>
        <div className="flex justify-between items-center mb-1.5">
          <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
            투자금액
          </label>
          <span className="text-xs text-zinc-500">
            잔고{' '}
            <span className="font-semibold text-zinc-300">{formatKRW(balance)} KRW</span>
          </span>
        </div>
        <div className={`flex items-center rounded-xl border px-3 py-2.5 transition-colors bg-zinc-800 border-zinc-700 ${dirColors.inputBorder}`}>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            className="flex-1 bg-transparent text-sm font-semibold text-white outline-none placeholder:text-zinc-600"
          />
          <span className="ml-2 text-xs font-semibold text-zinc-500">KRW</span>
        </div>
        <div className="flex gap-1.5 mt-1.5">
          {QUICK_RATIOS.map((ratio, i) => (
            <button
              key={ratio}
              onClick={() => handleQuickAmount(ratio)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${COLORS.quickRatio}`}
            >
              {QUICK_LABELS[i]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
          레버리지
        </label>
        <div className="flex gap-1.5">
          {LEVERAGE_OPTIONS.map((lv) => (
            <motion.button
              key={lv}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setLeverage(lv)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                leverage === lv ? COLORS.leverageActive : COLORS.leverageInactive
              }`}
            >
              {lv}x
            </motion.button>
          ))}
        </div>
      </div>

      {parsedAmount > 0 && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          transition={{ duration: 0.2 }}
          className={`rounded-xl border p-3 space-y-1.5 text-xs ${dirColors.activeBorder}`}
        >
          <div className="flex justify-between text-zinc-300">
            <span>예상 포지션 크기</span>
            <span className="font-semibold text-white">{formatKRW(positionSize)} KRW</span>
          </div>
          <div className="flex justify-between text-zinc-300">
            <span>강제청산 기준가</span>
            {liquidationPrice !== null ? (
              <span className="font-semibold text-red-400">{formatKRW(liquidationPrice)} KRW</span>
            ) : (
              <span className="text-zinc-500">없음 (1x)</span>
            )}
          </div>
        </motion.div>
      )}

      <motion.button
        whileHover={canSubmit ? { scale: 1.02 } : {}}
        whileTap={canSubmit ? { scale: 0.98 } : {}}
        onClick={handleSubmit}
        disabled={!canSubmit}
        className={`w-full py-3.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none ${dirColors.button}`}
      >
        {isSubmitting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            주문 처리 중...
          </>
        ) : (
          `${isLong ? 'LONG 매수' : 'SHORT 공매도'}${leverage > 1 ? ` (${leverage}x)` : ''}`
        )}
      </motion.button>
    </motion.div>
  );
}
