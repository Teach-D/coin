// ============================================================================
// CUSTOMIZATION — 브랜드 컬러·텍스트만 이 구역에서 수정
// ============================================================================

const COLORS = {
  positive: 'text-[#2DD4BF]',
  negative: 'text-red-400',
  badge: 'bg-orange-500/20 text-orange-400',
  card: 'bg-zinc-900 border border-zinc-800',
  label: 'text-zinc-500',
  value: 'text-white',
} as const;

// ============================================================================
// END CUSTOMIZATION
// ============================================================================

import { motion } from 'motion/react';
import type { BattleBalanceResponse } from '../../types';

interface BattleBalanceCardProps {
  data: BattleBalanceResponse | undefined;
  isLoading: boolean;
}

const formatKRW = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}백만`;
  if (n >= 10_000) return `${Math.floor(n / 10_000)}만`;
  return n.toLocaleString('ko-KR');
};

function SkeletonBlock({ className }: { className: string }) {
  return <div className={`rounded animate-pulse bg-zinc-800 ${className}`} />;
}

export function BattleBalanceCard({ data, isLoading }: BattleBalanceCardProps) {
  const isPositive = (data?.returnRate ?? 0) >= 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`${COLORS.card} rounded-2xl p-4`}
    >
      <div className="flex items-center justify-between mb-3">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${COLORS.badge}`}>
          배틀 격리 자금
        </span>
        {data && (
          <span className="text-xs text-zinc-600 font-mono">
            시드 {formatKRW(data.seedMoney)}원
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="flex flex-col gap-1">
          <span className={`text-xs ${COLORS.label}`}>배틀 잔고</span>
          {isLoading ? (
            <SkeletonBlock className="h-5 w-20" />
          ) : (
            <span className={`text-sm font-bold font-mono ${COLORS.value}`}>
              {formatKRW(data?.battleBalance ?? 0)}원
            </span>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <span className={`text-xs ${COLORS.label}`}>총 평가금액</span>
          {isLoading ? (
            <SkeletonBlock className="h-5 w-20" />
          ) : (
            <span className={`text-sm font-bold font-mono ${COLORS.value}`}>
              {formatKRW(data?.totalValuation ?? 0)}원
            </span>
          )}
        </div>

        <div className="flex flex-col gap-1 items-end">
          <span className={`text-xs ${COLORS.label}`}>수익률</span>
          {isLoading ? (
            <SkeletonBlock className="h-5 w-16" />
          ) : (
            <span className={`text-sm font-bold font-mono ${isPositive ? COLORS.positive : COLORS.negative}`}>
              {isPositive ? '+' : ''}{(data?.returnRate ?? 0).toFixed(2)}%
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}
