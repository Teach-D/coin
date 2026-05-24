import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useRankingSeason, useRankingPvp, useMyRanking } from '../hooks/useRanking';
import { useAuthStore } from '../store/authStore';
import type { RankingEntry, PvpRankingEntry } from '../types';

type Tab = 'season' | 'pvp';

const TAB_LABELS: Record<Tab, string> = {
  season: '시즌 랭킹',
  pvp: 'PVP 승률',
};

function formatValue(value: number): string {
  return value.toLocaleString('ko-KR');
}

function getRankStyle(rank: number): { color: string; bg: string } {
  if (rank === 1) return { color: '#FFD700', bg: 'rgba(255, 215, 0, 0.07)' };
  if (rank === 2) return { color: '#C0C0C0', bg: 'rgba(192, 192, 192, 0.07)' };
  if (rank === 3) return { color: '#CD7F32', bg: 'rgba(205, 127, 50, 0.07)' };
  return { color: '', bg: '' };
}

function RankBadge({ rank }: { rank: number }) {
  const { color } = getRankStyle(rank);
  if (rank <= 3) {
    return (
      <span className="text-sm font-bold w-8 text-center" style={{ color }}>
        {rank}
      </span>
    );
  }
  return <span className="text-sm font-mono text-zinc-500 w-8 text-center">{rank}</span>;
}

function RankingRow({ entry, index }: { entry: RankingEntry; index: number }) {
  const { bg } = getRankStyle(entry.rank);
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15, delay: Math.min(index * 0.02, 0.5) }}
      className="flex items-center px-4 py-3 border-b border-zinc-800/60 transition-colors hover:bg-zinc-800/40"
      style={bg ? { backgroundColor: bg } : {}}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <RankBadge rank={entry.rank} />
        <span className="text-sm text-white truncate">{entry.nickname}</span>
      </div>
      <span className="text-sm font-mono text-zinc-300 shrink-0">
        {formatValue(entry.evaluatedValue)}
        <span className="text-xs text-zinc-600 ml-1">원</span>
      </span>
    </motion.div>
  );
}

function PvpRankingRow({ entry, index }: { entry: PvpRankingEntry; index: number }) {
  const { bg } = getRankStyle(entry.rank);
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15, delay: Math.min(index * 0.02, 0.5) }}
      className="flex items-center px-4 py-3 border-b border-zinc-800/60 transition-colors hover:bg-zinc-800/40"
      style={bg ? { backgroundColor: bg } : {}}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <RankBadge rank={entry.rank} />
        <span className="text-sm text-white truncate">{entry.nickname}</span>
      </div>
      <span className="text-sm font-mono text-orange-400 shrink-0">
        {entry.winRatePct.toFixed(1)}%
      </span>
    </motion.div>
  );
}

function SkeletonRow() {
  return (
    <div className="flex items-center px-4 py-3 border-b border-zinc-800/60 animate-pulse gap-3">
      <div className="w-8 h-4 bg-zinc-800 rounded" />
      <div className="flex-1 h-4 bg-zinc-800 rounded w-28" />
      <div className="w-24 h-4 bg-zinc-800 rounded" />
    </div>
  );
}

function MyRankBar({ tab }: { tab: Tab }) {
  const isLoggedIn = useAuthStore((s) => s.isAuthenticated());
  const { data: myRanking, isLoading } = useMyRanking(isLoggedIn && tab === 'season');

  if (!isLoggedIn || tab !== 'season') return null;
  if (isLoading) {
    return (
      <div className="sticky bottom-0 z-10 bg-zinc-900 border-t border-zinc-700 px-4 py-3 animate-pulse">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <div className="w-14 h-4 bg-zinc-800 rounded" />
          <div className="flex-1 h-4 bg-zinc-800 rounded" />
          <div className="w-24 h-4 bg-zinc-800 rounded" />
        </div>
      </div>
    );
  }
  if (!myRanking) return null;

  const slot = myRanking.season;
  const rankDisplay = slot.rank !== null ? `#${slot.rank}` : '미집계';
  const rankColored = slot.rank !== null;

  return (
    <div className="sticky bottom-[4.75rem] z-10 bg-zinc-900/95 backdrop-blur border-t border-zinc-700">
      <div className="max-w-2xl mx-auto flex items-center px-4 py-3 gap-3">
        <span className="text-xs text-zinc-500 shrink-0">내 순위</span>
        <span className={`text-sm font-bold shrink-0 ${rankColored ? 'text-orange-400' : 'text-zinc-500'}`}>
          {rankDisplay}
        </span>
        <span className="text-sm text-zinc-300 flex-1 truncate">{myRanking.nickname}</span>
        <span className="text-sm font-mono text-zinc-300 shrink-0">
          {formatValue(slot.evaluatedValue)}
          <span className="text-xs text-zinc-600 ml-1">원</span>
        </span>
      </div>
    </div>
  );
}

export function RankingPage() {
  const [tab, setTab] = useState<Tab>('season');

  const seasonQuery = useRankingSeason();
  const pvpQuery = useRankingPvp();

  const activeQuery = tab === 'season' ? seasonQuery : pvpQuery;
  const isPvp = tab === 'pvp';

  return (
    <div className="min-h-screen bg-[#0C0C0D] text-white flex flex-col">
      <header className="sticky top-0 z-10 bg-[#0C0C0D]/95 backdrop-blur border-b border-zinc-800 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <h1 className="text-lg font-extrabold bg-gradient-to-r from-orange-400 to-yellow-400 bg-clip-text text-transparent">
            랭킹
          </h1>
        </div>
      </header>

      <div className="sticky top-[57px] z-10 bg-[#0C0C0D]/95 backdrop-blur border-b border-zinc-800">
        <div className="max-w-2xl mx-auto flex">
          {(['season', 'pvp'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`relative flex-1 py-3 text-sm font-semibold transition-colors ${
                tab === t ? 'text-orange-400' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {TAB_LABELS[t]}
              {tab === t && (
                <motion.div
                  layoutId="tab-indicator"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-400"
                />
              )}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-2xl mx-auto w-full flex-1 pb-24">
        <div className="flex items-center px-4 py-2 text-xs text-zinc-600 border-b border-zinc-800">
          <div className="w-8 text-center">순위</div>
          <div className="flex-1 ml-3">닉네임</div>
          <div className="shrink-0">{isPvp ? '승률' : '평가금액'}</div>
        </div>

        {activeQuery.isError && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <p className="text-zinc-500 text-sm">랭킹을 불러올 수 없습니다</p>
            <button
              onClick={() => activeQuery.refetch()}
              className="px-5 py-2 bg-orange-500 hover:bg-orange-400 active:bg-orange-600 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              다시 시도
            </button>
          </div>
        )}

        {activeQuery.isLoading && (
          <div>
            {Array.from({ length: 15 }).map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        )}

        {!activeQuery.isLoading && !activeQuery.isError && (
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {isPvp
                ? (pvpQuery.data ?? []).map((entry, index) => (
                    <PvpRankingRow key={entry.userId} entry={entry} index={index} />
                  ))
                : (seasonQuery.data ?? []).map((entry, index) => (
                    <RankingRow key={entry.userId} entry={entry} index={index} />
                  ))}
              {activeQuery.data?.length === 0 && (
                <p className="text-center py-20 text-zinc-600 text-sm">랭킹 데이터가 없습니다</p>
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </main>

      <MyRankBar tab={tab} />
    </div>
  );
}
