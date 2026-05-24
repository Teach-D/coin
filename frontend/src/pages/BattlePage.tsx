import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Trash2 } from 'lucide-react';
import { useBattleStore } from '../store/useBattleStore';
import { api } from '../lib/api';
import type { BattleListItem, CreateBattleRequest } from '../types';

type TabStatus = 'WAITING' | 'IN_PROGRESS';

const SEED_MONEY_OPTIONS = [100_000, 300_000, 500_000, 1_000_000];
const DURATION_OPTIONS = [10, 30, 60];
const MAX_PARTICIPANTS_OPTIONS = [2, 3, 5];

function useCountdown(endTimeMs: number | null): number {
  const [remaining, setRemaining] = useState(() =>
    endTimeMs ? Math.max(0, Math.floor((endTimeMs - Date.now()) / 1000)) : 0,
  );

  useEffect(() => {
    if (!endTimeMs) return;
    const update = () => setRemaining(Math.max(0, Math.floor((endTimeMs - Date.now()) / 1000)));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [endTimeMs]);

  return remaining;
}

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return '종료';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatMoney(amount: number): string {
  if (amount >= 1_000_000) return `${amount / 1_000_000}백만`;
  if (amount >= 10_000) return `${amount / 10_000}만`;
  return amount.toLocaleString('ko-KR');
}

function StatusBadge({ status }: { status: 'WAITING' | 'IN_PROGRESS' | 'FINISHED' }) {
  if (status === 'WAITING') {
    return (
      <span className="rounded-full bg-zinc-700 px-2 py-0.5 text-xs font-medium text-zinc-300">
        대기 중
      </span>
    );
  }
  return (
    <span className="rounded-full bg-[#2DD4BF]/20 px-2 py-0.5 text-xs font-medium text-[#2DD4BF]">
      진행 중
    </span>
  );
}

function BattleCard({
  battle,
  isHost,
  onClick,
  onDelete,
}: {
  battle: BattleListItem;
  isHost: boolean;
  onClick: () => void;
  onDelete: (e: React.MouseEvent) => void;
}) {
  const isFull = battle.currentParticipants >= battle.maxParticipants;
  const endTimeMs = battle.startTime
    ? new Date(battle.startTime).getTime() + battle.duration * 60 * 1000
    : null;
  const remainingSeconds = useCountdown(endTimeMs);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      onClick={onClick}
      className="relative flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 cursor-pointer hover:border-zinc-600 hover:bg-zinc-800/80 transition-colors"
    >
      <div className="flex items-center justify-between">
        <StatusBadge status={battle.status} />
        <div className="flex items-center gap-2">
          {battle.status === 'IN_PROGRESS' && endTimeMs ? (
            <span className={`text-xs font-mono font-semibold tabular-nums ${remainingSeconds < 60 ? 'text-red-400' : 'text-[#2DD4BF]'}`}>
              {formatCountdown(remainingSeconds)}
            </span>
          ) : (
            <span className="text-xs text-zinc-600">{battle.duration}분</span>
          )}
          {isHost && battle.status === 'WAITING' && (
            <button
              onClick={onDelete}
              className="p-1 rounded-md text-red-400 hover:bg-red-400/10 transition-colors"
            >
              <Trash2 size={21} />
            </button>
          )}
        </div>
      </div>

      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs text-zinc-500 mb-1">시드머니</p>
          <p className="text-base font-bold text-white">
            {formatMoney(battle.seedMoney)}
            <span className="text-xs text-zinc-600 ml-1">원</span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-zinc-500 mb-1">참가 현황</p>
          <p className={`text-base font-bold ${isFull ? 'text-red-400' : 'text-[#2DD4BF]'}`}>
            {battle.currentParticipants}
            <span className="text-zinc-600 font-normal">/{battle.maxParticipants}명</span>
          </p>
        </div>
      </div>

      {battle.status === 'WAITING' && !isFull && (
        <div className="h-1 rounded-full bg-zinc-800 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-orange-500 to-orange-400 transition-all"
            style={{ width: `${(battle.currentParticipants / battle.maxParticipants) * 100}%` }}
          />
        </div>
      )}
    </motion.div>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 animate-pulse space-y-3">
      <div className="flex items-center gap-2">
        <div className="h-5 w-8 rounded-full bg-zinc-800" />
        <div className="h-5 w-14 rounded-full bg-zinc-800" />
      </div>
      <div className="flex justify-between">
        <div className="space-y-1">
          <div className="h-3 w-12 rounded bg-zinc-800" />
          <div className="h-5 w-20 rounded bg-zinc-800" />
        </div>
        <div className="space-y-1 items-end flex flex-col">
          <div className="h-3 w-12 rounded bg-zinc-800" />
          <div className="h-5 w-10 rounded bg-zinc-800" />
        </div>
      </div>
    </div>
  );
}

function OptionButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-xl py-2 text-sm font-semibold transition-colors ${
        selected
          ? 'bg-orange-500 text-white'
          : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
      }`}
    >
      {children}
    </button>
  );
}

function CreateBattleModal({ onClose, onCreated }: { onClose: () => void; onCreated: (battleId: string) => void }) {
  const createBattle = useBattleStore((s) => s.createBattle);
  const [form, setForm] = useState<CreateBattleRequest>({
    seedMoney: 1_000_000,
    duration: 10,
    maxParticipants: 2,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setLoading(true);
    setError('');
    try {
      const battleId = await createBattle(form);
      onCreated(battleId);
    } catch {
      setError('배틀룸 생성에 실패했습니다');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        transition={{ duration: 0.2 }}
        className="relative w-full sm:max-w-md bg-zinc-900 rounded-t-3xl sm:rounded-2xl border border-zinc-800 p-6 z-10"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-white">배틀룸 만들기</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-xl leading-none">✕</button>
        </div>

        <div className="space-y-5">
          <div>
            <p className="text-xs text-zinc-500 mb-2">시드머니</p>
            <div className="flex gap-2 flex-wrap">
              {SEED_MONEY_OPTIONS.map((sm) => (
                <OptionButton
                  key={sm}
                  selected={form.seedMoney === sm}
                  onClick={() => setForm((f) => ({ ...f, seedMoney: sm }))}
                >
                  {formatMoney(sm)}
                </OptionButton>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs text-zinc-500 mb-2">배틀 시간</p>
            <div className="flex gap-2">
              {DURATION_OPTIONS.map((d) => (
                <OptionButton
                  key={d}
                  selected={form.duration === d}
                  onClick={() => setForm((f) => ({ ...f, duration: d }))}
                >
                  {d}분
                </OptionButton>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs text-zinc-500 mb-2">최대 인원</p>
            <div className="flex gap-2">
              {MAX_PARTICIPANTS_OPTIONS.map((mp) => (
                <OptionButton
                  key={mp}
                  selected={form.maxParticipants === mp}
                  onClick={() => setForm((f) => ({ ...f, maxParticipants: mp }))}
                >
                  {mp}명
                </OptionButton>
              ))}
            </div>
          </div>
        </div>

        {error && <p className="mt-4 text-xs text-red-400">{error}</p>}

        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleSubmit}
          disabled={loading}
          className="mt-6 w-full rounded-xl bg-orange-500 py-3.5 text-sm font-bold text-white hover:bg-orange-400 active:bg-orange-600 transition-colors disabled:opacity-50"
        >
          {loading ? '생성 중...' : '배틀룸 생성'}
        </motion.button>
      </motion.div>
    </div>
  );
}


export function BattlePage() {
  const navigate = useNavigate();
  const { battles = [], fetchBattles } = useBattleStore();
  const [tab, setTab] = useState<TabStatus>('WAITING');
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const loadBattles = async (status: TabStatus) => {
    setIsLoading(true);
    setIsError(false);
    try {
      await fetchBattles(status);
    } catch {
      setIsError(true);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadBattles(tab);
  }, [tab]);

  const handleCreated = (battleId: string) => {
    setShowCreateModal(false);
    navigate(`/battles/${battleId}`);
  };

  const handleDelete = async (e: React.MouseEvent, battleId: string) => {
    e.stopPropagation();
    try {
      await api.delete(`/api/battles/${battleId}`);
      await loadBattles(tab);
    } catch (err) {
      console.error('배틀 삭제 실패:', err);
    }
  };

  return (
    <div className="min-h-screen bg-[#0C0C0D] text-white flex flex-col">
      <header className="sticky top-0 z-10 bg-[#0C0C0D]/95 backdrop-blur border-b border-zinc-800 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <h1 className="text-lg font-extrabold bg-gradient-to-r from-orange-400 to-yellow-400 bg-clip-text text-transparent">
            배틀
          </h1>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-3 py-1.5 rounded-xl bg-orange-500 hover:bg-orange-400 text-xs font-semibold text-white transition-colors"
            >
              방 만들기
            </button>
          </div>
        </div>
      </header>

      <div className="sticky top-[57px] z-10 bg-[#0C0C0D]/95 backdrop-blur border-b border-zinc-800">
        <div className="max-w-2xl mx-auto flex">
          {(['WAITING', 'IN_PROGRESS'] as TabStatus[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`relative flex-1 py-3 text-sm font-semibold transition-colors ${
                tab === t ? 'text-orange-400' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {t === 'WAITING' ? '대기 중' : '진행 중'}
              {tab === t && (
                <motion.div
                  layoutId="battle-tab-indicator"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-400"
                />
              )}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-2xl mx-auto w-full flex-1 p-4">
        {isError && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <p className="text-zinc-500 text-sm">배틀 목록을 불러올 수 없습니다</p>
            <button
              onClick={() => loadBattles(tab)}
              className="px-5 py-2 bg-orange-500 hover:bg-orange-400 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              다시 시도
            </button>
          </div>
        )}

        {isLoading && (
          <div className="grid grid-cols-1 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        )}

        {!isLoading && !isError && (
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="grid grid-cols-1 gap-3"
            >
              {battles.map((battle) => (
                <BattleCard
                  key={battle.battleId}
                  battle={battle}
                  isHost={battle.isHost}
                  onClick={() => navigate(`/battles/${battle.battleId}`)}
                  onDelete={(e) => handleDelete(e, battle.battleId)}
                />
              ))}
              {battles.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <p className="text-zinc-600 text-sm">
                    {tab === 'WAITING' ? '대기 중인 배틀이 없습니다' : '진행 중인 배틀이 없습니다'}
                  </p>
                  {tab === 'WAITING' && (
                    <button
                      onClick={() => setShowCreateModal(true)}
                      className="px-5 py-2 bg-orange-500 hover:bg-orange-400 text-white text-sm font-semibold rounded-xl transition-colors"
                    >
                      방 만들기
                    </button>
                  )}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </main>

      <AnimatePresence>
        {showCreateModal && (
          <CreateBattleModal onClose={() => setShowCreateModal(false)} onCreated={handleCreated} />
        )}
      </AnimatePresence>
    </div>
  );
}
