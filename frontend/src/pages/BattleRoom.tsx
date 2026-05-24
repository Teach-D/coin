import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { connectSocket, getSocket } from '../lib/socket';
import { parseUserIdFromToken } from '../lib/token';
import { useBattleStore } from '../store/useBattleStore';
import { useAuthStore } from '../store/authStore';
import { useBattleResult } from '../hooks/useBattleResult';
import { useBattleBalance } from '../hooks/useBattleBalance';
import { useBattlePositions } from '../hooks/useBattlePositions';
import { BattleResultCard } from '../components/BattleResultCard';
import { InviteButton } from '../components/battle/InviteButton';
import { BattleBalanceCard } from '../components/battle/BattleBalanceCard';
import { BattleOrderSection } from '../components/battle/BattleOrderSection';
import { BattlePositionList } from '../components/battle/BattlePositionList';
import type { BattleRankingEntry, CardReadyNotification } from '../types';

function formatMoney(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}백만`;
  if (amount >= 10_000) return `${Math.floor(amount / 10_000)}만`;
  return amount.toLocaleString('ko-KR');
}

function formatReturnRate(rate: number | null): string {
  if (rate == null) return '0.00%';
  const sign = rate > 0 ? '+' : '';
  return `${sign}${rate.toFixed(2)}%`;
}

function getRankMeta(rank: number): { color: string; label: string } {
  if (rank === 1) return { color: '#FFD700', label: '1위' };
  if (rank === 2) return { color: '#C0C0C0', label: '2위' };
  if (rank === 3) return { color: '#CD7F32', label: '3위' };
  return { color: '', label: `${rank}위` };
}

function useCountdown(endTime: string | null): { display: string; isExpired: boolean } {
  const [remaining, setRemaining] = useState('');
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    if (!endTime) {
      setIsExpired(false);
      return;
    }

    const update = () => {
      const diff = new Date(endTime).getTime() - Date.now();
      if (diff <= 0) {
        setRemaining('00:00');
        setIsExpired(true);
        return;
      }
      const m = Math.floor(diff / 60_000);
      const s = Math.floor((diff % 60_000) / 1000);
      setRemaining(`${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
      setIsExpired(false);
    };

    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [endTime]);

  return { display: remaining, isExpired };
}

function RankingRow({ entry, index }: { entry: BattleRankingEntry; index: number }) {
  const meta = getRankMeta(entry.rank);
  const isPositive = (entry.returnRate ?? 0) >= 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15, delay: Math.min(index * 0.05, 0.3) }}
      className="flex items-center px-4 py-3 border-b border-zinc-800/60 hover:bg-zinc-800/40 transition-colors"
    >
      <span
        className="text-sm font-bold w-8 text-center shrink-0"
        style={meta.color ? { color: meta.color } : { color: '#71717a' }}
      >
        {meta.label}
      </span>
      <span className="text-sm text-white flex-1 truncate ml-3">{entry.nickname}</span>
      <div className="text-right shrink-0">
        <p className={`text-sm font-bold font-mono ${isPositive ? 'text-[#2DD4BF]' : 'text-red-400'}`}>
          {formatReturnRate(entry.returnRate)}
        </p>
        <p className="text-xs text-zinc-600 font-mono">
          {entry.currentValuation != null ? `${formatMoney(entry.currentValuation)}원` : '-'}
        </p>
      </div>
    </motion.div>
  );
}

function BattleInfoCard({
  seedMoney,
  duration,
  status,
}: {
  seedMoney: number;
  duration: number;
  status: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="flex flex-col items-center gap-1">
          <span className="text-xs text-zinc-500">시드</span>
          <span className="text-xs font-semibold text-white">{formatMoney(seedMoney)}</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="text-xs text-zinc-500">시간</span>
          <span className="text-xs font-semibold text-white">{duration}분</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="text-xs text-zinc-500">상태</span>
          {status === 'WAITING' && (
            <span className="text-xs font-semibold text-zinc-400">대기</span>
          )}
          {status === 'IN_PROGRESS' && (
            <span className="text-xs font-semibold text-[#2DD4BF]">진행중</span>
          )}
          {status === 'FINISHED' && (
            <span className="text-xs font-semibold text-zinc-500">종료</span>
          )}
        </div>
      </div>
    </div>
  );
}

function WaitingView({
  battleId,
  currentParticipants,
  maxParticipants,
  participants,
  onJoinSuccess,
}: {
  battleId: string;
  currentParticipants: number;
  maxParticipants: number;
  participants: Array<{ userId: number; nickname: string; returnRate: number; currentValuation: number }>;
  onJoinSuccess?: () => void;
}) {
  const { joinBattle } = useBattleStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const isFull = currentParticipants >= maxParticipants;

  const handleJoin = async () => {
    setLoading(true);
    setError('');
    try {
      await joinBattle(battleId);
      onJoinSuccess?.();
    } catch {
      setError('참가에 실패했습니다. 이미 참가했거나 인원이 가득 찼습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col gap-4"
    >
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-zinc-300">참가자</p>
          <span className={`text-sm font-bold ${isFull ? 'text-red-400' : 'text-[#2DD4BF]'}`}>
            {currentParticipants}/{maxParticipants}명
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden mb-4">
          <div
            className="h-full rounded-full bg-gradient-to-r from-orange-500 to-orange-400 transition-all"
            style={{ width: `${(currentParticipants / maxParticipants) * 100}%` }}
          />
        </div>
        <div className="space-y-2">
          {participants.map((p) => (
            <div key={p.userId} className="flex items-center gap-3 py-2 border-b border-zinc-800/60 last:border-0">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-500 to-pink-500 flex items-center justify-center text-xs font-bold text-white">
                {p.nickname.charAt(0).toUpperCase()}
              </div>
              <span className="text-sm text-white">{p.nickname}</span>
            </div>
          ))}
          {Array.from({ length: maxParticipants - currentParticipants }).map((_, i) => (
            <div key={`empty-${i}`} className="flex items-center gap-3 py-2 border-b border-zinc-800/60 last:border-0">
              <div className="w-8 h-8 rounded-full border-2 border-dashed border-zinc-700" />
              <span className="text-sm text-zinc-600">대기 중...</span>
            </div>
          ))}
        </div>
      </div>

      {error && <p className="text-xs text-red-400 px-1">{error}</p>}

      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={handleJoin}
        disabled={loading || isFull}
        className="w-full rounded-2xl bg-orange-500 py-4 text-base font-bold text-white hover:bg-orange-400 active:bg-orange-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {loading ? '참가 중...' : isFull ? '인원 가득' : '참가하기'}
      </motion.button>
    </motion.div>
  );
}

function InProgressView({
  battleId,
  endTime,
  rankings,
  onExpired,
}: {
  battleId: string;
  endTime: string | null;
  rankings: BattleRankingEntry[];
  onExpired: () => void;
}) {
  const { display: remaining, isExpired } = useCountdown(endTime);
  const onExpiredRef = useRef(onExpired);
  onExpiredRef.current = onExpired;

  useEffect(() => {
    if (isExpired) onExpiredRef.current();
  }, [isExpired]);

  const { data: balanceData, isLoading: isBalanceLoading } = useBattleBalance(battleId);
  const { data: positions, isLoading: isPositionsLoading } = useBattlePositions(battleId);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col gap-4"
    >
      <div className={`rounded-2xl border p-4 flex flex-col items-center gap-2 transition-colors ${
        isExpired ? 'border-zinc-700 bg-zinc-900/50' : 'border-zinc-800 bg-zinc-900'
      }`}>
        <p className="text-xs text-zinc-500">남은 시간</p>
        {isExpired ? (
          <div className="flex flex-col items-center gap-1">
            <span className="font-mono text-4xl font-bold text-zinc-500 tabular-nums">00:00</span>
            <span className="text-xs text-zinc-500 animate-pulse">결과 집계 중...</span>
          </div>
        ) : (
          <span className={`font-mono text-4xl font-bold tabular-nums transition-colors ${
            remaining && parseInt(remaining.split(':')[0]) === 0 && parseInt(remaining.split(':')[1]) <= 30
              ? 'text-red-400'
              : 'text-orange-400'
          }`}>
            {remaining || '--:--'}
          </span>
        )}
      </div>

      <BattleBalanceCard data={balanceData} isLoading={isBalanceLoading} />

      <BattleOrderSection
        battleId={battleId}
        battleBalance={balanceData?.battleBalance ?? 0}
        disabled={isExpired}
      />

      <BattlePositionList
        battleId={battleId}
        positions={positions}
        isLoading={isPositionsLoading}
      />

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 overflow-hidden">
        <div className="flex items-center px-4 py-2 border-b border-zinc-800 text-xs text-zinc-600">
          <div className="w-8 text-center shrink-0">순위</div>
          <div className="flex-1 ml-3">닉네임</div>
          <div className="shrink-0 text-right">수익률 / 평가</div>
        </div>
        <AnimatePresence mode="popLayout">
          {rankings.map((entry, index) => (
            <RankingRow key={entry.userId} entry={entry} index={index} />
          ))}
        </AnimatePresence>
        {rankings.length === 0 && (
          <p className="text-center py-8 text-zinc-600 text-sm">순위 데이터 없음</p>
        )}
      </div>

      <InviteButton battleId={battleId} />
    </motion.div>
  );
}

function FinishedView({
  rankings,
  winnerId,
  onShowResultCard,
}: {
  rankings: BattleRankingEntry[];
  winnerId: number | null;
  onShowResultCard: () => void;
}) {
  const navigate = useNavigate();
  const winner = rankings.find((r) => r.userId === winnerId) ?? rankings[0];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col gap-4"
    >
      {winner && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="rounded-2xl border border-yellow-500/30 bg-yellow-500/5 p-5 flex flex-col items-center gap-3"
        >
          <span className="text-3xl">🏆</span>
          <div className="text-center">
            <p className="text-xs text-zinc-500 mb-1">우승자</p>
            <p className="text-xl font-bold text-white">{winner.nickname}</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-center">
              <p className="text-xs text-zinc-500 mb-0.5">수익률</p>
              <p className={`text-xl font-bold font-mono ${(winner.returnRate ?? 0) >= 0 ? 'text-[#2DD4BF]' : 'text-red-400'}`}>
                {formatReturnRate(winner.returnRate)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-zinc-500 mb-0.5">최종 평가</p>
              <p className="text-sm font-semibold text-white font-mono">
                {formatMoney(winner.currentValuation ?? 0)}원
              </p>
            </div>
          </div>
        </motion.div>
      )}

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 overflow-hidden">
        <div className="flex items-center px-4 py-2 border-b border-zinc-800 text-xs text-zinc-600">
          <div className="w-8 text-center shrink-0">순위</div>
          <div className="flex-1 ml-3">닉네임</div>
          <div className="shrink-0 text-right">수익률 / 평가</div>
        </div>
        {rankings.map((entry, index) => (
          <RankingRow key={entry.userId} entry={entry} index={index} />
        ))}
      </div>

      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={onShowResultCard}
        className="w-full rounded-2xl bg-orange-500 py-3.5 text-sm font-bold text-white hover:bg-orange-400 transition-colors"
      >
        결과 카드 보기
      </motion.button>

      <button
        onClick={() => navigate('/battles')}
        className="w-full rounded-2xl border border-zinc-700 py-3.5 text-sm font-semibold text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors"
      >
        배틀 목록으로
      </button>
    </motion.div>
  );
}

export function BattleRoom() {
  const { battleId } = useParams<{ battleId: string }>();
  const navigate = useNavigate();
  const { currentBattle, rankings, fetchBattle, updateRankings, setBattleStatus } = useBattleStore();
  const { accessToken } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('배틀 정보를 불러올 수 없습니다');
  const [showResultCard, setShowResultCard] = useState(false);
  const [cardImageUrl, setCardImageUrl] = useState<string | null>(null);
  const [clientExpired, setClientExpired] = useState(false);

  const currentUserId = parseUserIdFromToken(accessToken);
  const { data: battleResult } = useBattleResult(
    battleId,
    showResultCard || currentBattle?.status === 'FINISHED'
  );

  useEffect(() => {
    if (!battleId) return;

    setIsLoading(true);
    setIsError(false);
    fetchBattle(battleId)
      .catch((err) => {
        if (err?.response?.status === 403) {
          setErrorMessage('참여하지 않은 배틀은 입장할 수 없습니다.');
        }
        setIsError(true);
      })
      .finally(() => setIsLoading(false));
  }, [battleId]);

  useEffect(() => {
    if (!clientExpired || !battleId || currentBattle?.status === 'FINISHED') return;
    fetchBattle(battleId);
    const id = setInterval(() => fetchBattle(battleId), 3000);
    return () => clearInterval(id);
  }, [clientExpired, battleId]);

  useEffect(() => {
    if (currentBattle?.status === 'FINISHED') setClientExpired(false);
  }, [currentBattle?.status]);

  const rankUpdateHandlerRef = useRef<((data: { rankings: BattleRankingEntry[] }) => void) | null>(null);
  const battleStartedHandlerRef = useRef<(() => void) | null>(null);
  const battleFinishedHandlerRef = useRef<(() => void) | null>(null);
  const participantJoinedHandlerRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!battleId) return;
    let mounted = true;

    const onRankUpdate = (data: { rankings: BattleRankingEntry[] }) => {
      updateRankings(data.rankings);
    };
    const onBattleStarted = () => {
      setBattleStatus('IN_PROGRESS');
      fetchBattle(battleId);
    };
    const onBattleFinished = () => {
      setBattleStatus('FINISHED');
      fetchBattle(battleId);
      setShowResultCard(true);
    };
    const onParticipantJoined = () => {
      fetchBattle(battleId);
    };
    const onBattleDeleted = () => {
      navigate('/battles', { replace: true });
    };

    rankUpdateHandlerRef.current = onRankUpdate;
    battleStartedHandlerRef.current = onBattleStarted;
    battleFinishedHandlerRef.current = onBattleFinished;
    participantJoinedHandlerRef.current = onParticipantJoined;

    connectSocket().then(() => {
      if (!mounted) return;
      const s = getSocket();
      s.emit('joinBattleRoom', { battleId });
      s.on('rankUpdate', onRankUpdate);
      s.on('battleStarted', onBattleStarted);
      s.on('battleFinished', onBattleFinished);
      s.on('participantJoined', onParticipantJoined);
      s.on('battle.deleted', onBattleDeleted);
    });

    return () => {
      mounted = false;
      const s = getSocket();
      if (rankUpdateHandlerRef.current) s.off('rankUpdate', rankUpdateHandlerRef.current);
      if (battleStartedHandlerRef.current) s.off('battleStarted', battleStartedHandlerRef.current);
      if (battleFinishedHandlerRef.current) s.off('battleFinished', battleFinishedHandlerRef.current);
      if (participantJoinedHandlerRef.current) s.off('participantJoined', participantJoinedHandlerRef.current);
      s.off('battle.deleted', onBattleDeleted);
      rankUpdateHandlerRef.current = null;
      battleStartedHandlerRef.current = null;
      battleFinishedHandlerRef.current = null;
      participantJoinedHandlerRef.current = null;
    };
  }, [battleId]);

  const notifHandlerRef = useRef<((data: CardReadyNotification) => void) | null>(null);

  useEffect(() => {
    if (!battleId) return;
    let mounted = true;

    const onNotification = (data: CardReadyNotification) => {
      if (data.type === 'CARD_READY' && data.battleId === battleId) {
        setCardImageUrl(data.cardImageUrl);
      }
    };
    notifHandlerRef.current = onNotification;

    connectSocket().then(() => {
      if (!mounted) return;
      const s = getSocket();
      s.on('notification', onNotification);
    });

    return () => {
      mounted = false;
      const s = getSocket();
      if (notifHandlerRef.current) {
        s.off('notification', notifHandlerRef.current);
        notifHandlerRef.current = null;
      }
    };
  }, [battleId]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0C0C0D] flex flex-col">
        <header className="sticky top-0 z-10 bg-[#0C0C0D]/95 backdrop-blur border-b border-zinc-800 px-4 py-3">
          <div className="max-w-2xl mx-auto flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-zinc-800 animate-pulse" />
            <div className="h-5 w-32 rounded bg-zinc-800 animate-pulse" />
          </div>
        </header>
        <main className="max-w-2xl mx-auto w-full flex-1 p-4 space-y-3">
          <div className="h-20 rounded-2xl bg-zinc-900 animate-pulse" />
          <div className="h-40 rounded-2xl bg-zinc-900 animate-pulse" />
        </main>
      </div>
    );
  }

  if (isError || !currentBattle) {
    return (
      <div className="min-h-screen bg-[#0C0C0D] flex flex-col items-center justify-center gap-4">
        <p className="text-zinc-500 text-sm">{errorMessage}</p>
        <button
          onClick={() => navigate('/battles')}
          className="px-5 py-2 bg-orange-500 hover:bg-orange-400 text-white text-sm font-semibold rounded-xl transition-colors"
        >
          목록으로
        </button>
      </div>
    );
  }

  const participantsList = currentBattle.participants.map((p) => ({
    userId: p.userId,
    nickname: p.nickname,
    returnRate: p.returnRate,
    currentValuation: p.currentValuation,
  }));

  const topNicknames = currentBattle.participants.slice(0, 2).map((p) => p.nickname).join(' vs ');

  return (
    <div className="min-h-screen bg-[#0C0C0D] text-white flex flex-col">
      <header className="sticky top-0 z-10 bg-[#0C0C0D]/95 backdrop-blur border-b border-zinc-800 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <button
            onClick={() => navigate('/battles')}
            className="w-7 h-7 rounded-lg bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white transition-colors text-sm"
          >
            ←
          </button>
          <h1 className="text-sm font-bold text-white truncate flex-1">
            {topNicknames || `배틀 ${currentBattle.battleId.slice(0, 8)}`}
          </h1>
          {currentBattle.status === 'IN_PROGRESS' && (
            <span className="rounded-full bg-[#2DD4BF]/20 px-2 py-0.5 text-xs font-medium text-[#2DD4BF] shrink-0">
              진행 중
            </span>
          )}
        </div>
      </header>

      <main className="max-w-2xl mx-auto w-full flex-1 p-4 space-y-4">
        <BattleInfoCard
          seedMoney={currentBattle.seedMoney}
          duration={currentBattle.duration}
          status={currentBattle.status}
        />

        <AnimatePresence mode="wait">
          {currentBattle.status === 'WAITING' && (
            <WaitingView
              key="waiting"
              battleId={currentBattle.battleId}
              currentParticipants={currentBattle.participants.length}
              maxParticipants={currentBattle.maxParticipants}
              participants={participantsList}
              onJoinSuccess={() => {
                fetchBattle(battleId!);
                const s = getSocket();
                s?.emit('joinBattleRoom', { battleId });
              }}
            />
          )}
          {currentBattle.status === 'IN_PROGRESS' && (
            <InProgressView
              key="in-progress"
              battleId={currentBattle.battleId}
              endTime={
                currentBattle.endTime ??
                (currentBattle.startTime
                  ? new Date(new Date(currentBattle.startTime).getTime() + currentBattle.duration * 60 * 1000).toISOString()
                  : null)
              }
              rankings={rankings}
              onExpired={() => setClientExpired(true)}
            />
          )}
          {currentBattle.status === 'FINISHED' && (
            <FinishedView
              key="finished"
              rankings={rankings}
              winnerId={currentBattle.winnerId}
              onShowResultCard={() => setShowResultCard(true)}
            />
          )}
        </AnimatePresence>
      </main>

      {showResultCard && battleResult && (
        <BattleResultCard
          result={battleResult}
          currentUserId={currentUserId}
          cardImageUrl={cardImageUrl ?? undefined}
          onClose={() => setShowResultCard(false)}
        />
      )}
    </div>
  );
}
