// ============================================================================
// CUSTOMIZATION — 브랜드 컬러·텍스트만 이 구역에서 수정
// ============================================================================

const COLORS = {
  longBadge: 'bg-[#2DD4BF]/20 text-[#2DD4BF]',
  shortBadge: 'bg-red-500/20 text-red-400',
  positive: 'text-[#2DD4BF]',
  negative: 'text-red-400',
  card: 'bg-zinc-900 border border-zinc-800',
  row: 'border-b border-zinc-800/60 hover:bg-zinc-800/40 transition-colors',
  sellButton: 'border border-zinc-700 hover:border-red-500 hover:text-red-400 text-zinc-400',
} as const;

// ============================================================================
// END CUSTOMIZATION
// ============================================================================

import { motion, AnimatePresence } from 'motion/react';
import { Loader2 } from 'lucide-react';
import type { BattlePosition } from '../../types';
import { useBattleSellOrder } from '../../hooks/useBattleOrder';

interface BattlePositionListProps {
  battleId: string;
  positions: BattlePosition[] | undefined;
  isLoading: boolean;
}

const formatKRW = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}백만`;
  if (n >= 10_000) return `${Math.floor(n / 10_000)}만`;
  return n.toLocaleString('ko-KR');
};

function PositionRow({
  position,
  battleId,
  index,
}: {
  position: BattlePosition;
  battleId: string;
  index: number;
}) {
  const sellOrder = useBattleSellOrder(battleId);
  const isLong = position.direction === 'LONG';
  const isPositive = position.unrealizedPnlRate >= 0;

  const handleSell = () => {
    sellOrder.mutate({ positionId: position.positionId, closeRatio: 1.0 });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -8 }}
      transition={{ duration: 0.15, delay: Math.min(index * 0.04, 0.2) }}
      className={`flex items-center px-4 py-3 ${COLORS.row}`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm font-bold text-white">
            {position.ticker.replace('KRW-', '')}
          </span>
          <span
            className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${
              isLong ? COLORS.longBadge : COLORS.shortBadge
            }`}
          >
            {isLong ? 'LONG' : 'SHORT'}
          </span>
          {position.leverage > 1 && (
            <span className="text-xs text-orange-400 font-semibold">{position.leverage}x</span>
          )}
        </div>
        <p className="text-xs text-zinc-500 font-mono">
          평균가 {formatKRW(position.averagePrice)} KRW
        </p>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <div className="text-right">
          <p className={`text-sm font-bold font-mono ${isPositive ? COLORS.positive : COLORS.negative}`}>
            {isPositive ? '+' : ''}{position.unrealizedPnlRate.toFixed(2)}%
          </p>
          <p className="text-xs text-zinc-500 font-mono">
            {formatKRW(position.evaluatedValue)}원
          </p>
        </div>

        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={handleSell}
          disabled={sellOrder.isPending}
          className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${COLORS.sellButton}`}
        >
          {sellOrder.isPending ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            '청산'
          )}
        </motion.button>
      </div>
    </motion.div>
  );
}

export function BattlePositionList({ battleId, positions, isLoading }: BattlePositionListProps) {
  const openPositions = positions?.filter((p) => p.status === 'OPEN') ?? [];

  return (
    <div className={`${COLORS.card} rounded-2xl overflow-hidden`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <span className="text-sm font-semibold text-zinc-300">내 배틀 포지션</span>
        {!isLoading && (
          <span className="text-xs text-zinc-600">{openPositions.length}개</span>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-0">
          {[0, 1].map((i) => (
            <div key={i} className="flex items-center px-4 py-3 border-b border-zinc-800/60">
              <div className="flex-1 space-y-1.5">
                <div className="h-4 w-24 rounded bg-zinc-800 animate-pulse" />
                <div className="h-3 w-32 rounded bg-zinc-800 animate-pulse" />
              </div>
              <div className="h-8 w-16 rounded bg-zinc-800 animate-pulse" />
            </div>
          ))}
        </div>
      ) : (
        <AnimatePresence mode="popLayout">
          {openPositions.length === 0 ? (
            <motion.p
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-8 text-zinc-600 text-sm"
            >
              보유 포지션 없음
            </motion.p>
          ) : (
            openPositions.map((position, index) => (
              <PositionRow
                key={position.positionId}
                position={position}
                battleId={battleId}
                index={index}
              />
            ))
          )}
        </AnimatePresence>
      )}
    </div>
  );
}
