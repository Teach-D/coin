// ============================================================================
// CUSTOMIZATION — 브랜드 컬러·텍스트만 이 구역에서 수정
// ============================================================================

const COLORS = {
  background: '#0C0C0D',
  cardBg: '#18181B',
  cardBorder: '#27272A',
  accent: '#FF6B35',
  accentSecondary: '#2DD4BF',
  profit: '#2DD4BF',
  loss: '#f87171',
  gold: '#FFD700',
  silver: '#C0C0C0',
  bronze: '#CD7F32',
} as const;

const SHARE_TEXT = (rank: number, profitRate: number, finalValuation: number) =>
  `🏆 CoinBattle 결과\n${rank}위 | ${profitRate > 0 ? '+' : ''}${profitRate.toFixed(2)}%\n최종 평가금: ${finalValuation.toLocaleString('ko-KR')}원`;

// ============================================================================
// END CUSTOMIZATION
// ============================================================================

import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import type { BattleResultResponse, ParticipantResultResponse } from '../types';
import { analytics } from '../lib/analytics';

interface BattleResultCardProps {
  result: BattleResultResponse;
  currentUserId: number;
  cardImageUrl?: string;
  onClose: () => void;
}

function formatMoney(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}백만`;
  if (amount >= 10_000) return `${Math.floor(amount / 10_000)}만`;
  return amount.toLocaleString('ko-KR');
}

function formatProfitRate(rate: number): string {
  const sign = rate > 0 ? '+' : '';
  return `${sign}${rate.toFixed(2)}%`;
}

function getRankColor(rank: number): string {
  if (rank === 1) return COLORS.gold;
  if (rank === 2) return COLORS.silver;
  if (rank === 3) return COLORS.bronze;
  return '#71717a';
}

function RankMedal({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-lg">🥇</span>;
  if (rank === 2) return <span className="text-lg">🥈</span>;
  if (rank === 3) return <span className="text-lg">🥉</span>;
  return (
    <span className="text-sm font-bold tabular-nums" style={{ color: getRankColor(rank) }}>
      {rank}위
    </span>
  );
}

function ParticipantRow({
  participant,
  isMe,
  index,
}: {
  participant: ParticipantResultResponse;
  isMe: boolean;
  index: number;
}) {
  const isProfit = participant.profitRate >= 0;

  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25, delay: 0.1 + index * 0.06 }}
      className={`flex items-center gap-3 px-4 py-3 border-b last:border-0 transition-colors ${
        isMe
          ? 'border-orange-500/30 bg-orange-500/5'
          : 'border-zinc-800/60 hover:bg-zinc-800/30'
      }`}
    >
      <div className="w-10 flex items-center justify-center shrink-0">
        <RankMedal rank={participant.rank} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold text-white truncate">{participant.nickname}</span>
          {isMe && (
            <span className="shrink-0 rounded-full bg-orange-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-orange-400">
              나
            </span>
          )}
          {participant.isWinner && (
            <span className="shrink-0 text-sm">🏆</span>
          )}
        </div>
        <p className="text-xs text-zinc-500 font-mono mt-0.5">
          {formatMoney(participant.finalValuation)}원
        </p>
      </div>

      <div className="text-right shrink-0">
        <p
          className="text-sm font-bold font-mono"
          style={{ color: isProfit ? COLORS.profit : COLORS.loss }}
        >
          {formatProfitRate(participant.profitRate)}
        </p>
        <p className="text-xs text-zinc-600 font-mono mt-0.5">
          {isProfit ? '+' : ''}{formatMoney(participant.profitAmount)}원
        </p>
      </div>
    </motion.div>
  );
}

export function BattleResultCard({ result, currentUserId, cardImageUrl, onClose }: BattleResultCardProps) {
  const navigate = useNavigate();
  const winner = result.participants.find((p) => p.isWinner) ?? result.participants[0];
  const myResult = result.myResult;

  const handleShare = async () => {
    if (!myResult) return;
    const text = SHARE_TEXT(myResult.rank, myResult.profitRate, myResult.finalValuation);

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'CoinBattle 결과',
          text,
          ...(cardImageUrl ? { url: cardImageUrl } : {}),
        });
        analytics.track('Result Shared', {
          method: 'native_share',
          rank: myResult.rank,
          profit_rate: myResult.profitRate,
        });
      } catch {
        // 사용자가 취소한 경우 무시
      }
    } else {
      try {
        const shareText = cardImageUrl ? `${text}\n${cardImageUrl}` : text;
        await navigator.clipboard.writeText(shareText);
        analytics.track('Result Shared', {
          method: 'clipboard',
          rank: myResult.rank,
          profit_rate: myResult.profitRate,
        });
        alert('결과가 클립보드에 복사되었습니다!');
      } catch {
        // clipboard 접근 불가 시 무시
      }
    }
  };

  const handleNavigateToBattles = () => {
    onClose();
    navigate('/battles');
  };

  const sortedParticipants = [...result.participants].sort((a, b) => a.rank - b.rank);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
        style={{ backgroundColor: 'rgba(12, 12, 13, 0.92)', backdropFilter: 'blur(8px)' }}
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.97 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-md rounded-3xl border overflow-hidden"
          style={{ backgroundColor: COLORS.cardBg, borderColor: COLORS.cardBorder }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="relative overflow-hidden">
            <div className="pointer-events-none absolute -top-16 -right-16 w-48 h-48 rounded-full bg-gradient-to-br from-orange-500/20 via-pink-500/10 to-cyan-400/10 blur-2xl" />

            <div className="flex flex-col items-center gap-2 px-6 pt-8 pb-6">
              <motion.div
                initial={{ scale: 0, rotate: -20 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ duration: 0.4, delay: 0.1, type: 'spring', stiffness: 200 }}
                className="text-5xl"
              >
                🏆
              </motion.div>

              {winner && (
                <>
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.2 }}
                    className="text-center"
                  >
                    <p className="text-xs font-semibold tracking-widest uppercase text-zinc-500 mb-1">
                      우승자
                    </p>
                    <p className="text-xl font-bold text-white">{winner.nickname}</p>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.25 }}
                    className="flex items-center gap-4 mt-1"
                  >
                    <div className="text-center">
                      <p className="text-xs text-zinc-500 mb-0.5">수익률</p>
                      <p
                        className="text-2xl font-bold font-mono"
                        style={{ color: winner.profitRate >= 0 ? COLORS.profit : COLORS.loss }}
                      >
                        {formatProfitRate(winner.profitRate)}
                      </p>
                    </div>
                    <div className="w-px h-8 bg-zinc-700" />
                    <div className="text-center">
                      <p className="text-xs text-zinc-500 mb-0.5">최종 평가</p>
                      <p className="text-base font-semibold text-white font-mono">
                        {formatMoney(winner.finalValuation)}원
                      </p>
                    </div>
                  </motion.div>
                </>
              )}

              {myResult && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.3 }}
                  className="w-full mt-2 rounded-xl px-4 py-2.5 flex items-center justify-between"
                  style={{ backgroundColor: 'rgba(255, 107, 53, 0.08)', border: '1px solid rgba(255, 107, 53, 0.2)' }}
                >
                  <span className="text-xs font-semibold text-orange-400">내 결과</span>
                  <div className="flex items-center gap-3">
                    <span
                      className="text-sm font-bold font-mono"
                      style={{ color: myResult.profitRate >= 0 ? COLORS.profit : COLORS.loss }}
                    >
                      {formatProfitRate(myResult.profitRate)}
                    </span>
                    <span className="text-xs text-zinc-500 font-mono">
                      {myResult.rank}위
                    </span>
                  </div>
                </motion.div>
              )}
            </div>
          </div>

          {cardImageUrl && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.4 }}
              className="mx-4 mb-2 rounded-2xl overflow-hidden border border-zinc-700"
            >
              <img src={cardImageUrl} alt="결과 카드" className="w-full h-auto" />
            </motion.div>
          )}

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.15 }}
            className="border-t mx-4 rounded-2xl overflow-hidden mb-4"
            style={{ borderColor: COLORS.cardBorder, backgroundColor: '#0f0f10' }}
          >
            <div
              className="flex items-center px-4 py-2 text-xs text-zinc-600 border-b"
              style={{ borderColor: COLORS.cardBorder }}
            >
              <div className="w-10 text-center shrink-0">순위</div>
              <div className="flex-1 ml-3">닉네임</div>
              <div className="text-right">수익률 / 손익</div>
            </div>
            {sortedParticipants.map((participant, index) => (
              <ParticipantRow
                key={participant.userId}
                participant={participant}
                isMe={participant.userId === currentUserId}
                index={index}
              />
            ))}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.35 }}
            className="flex flex-col gap-2.5 px-4 pb-6"
          >
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleShare}
              className="w-full rounded-2xl py-3.5 text-sm font-bold text-white transition-all"
              style={{ backgroundColor: COLORS.accent }}
            >
              공유하기
            </motion.button>

            <button
              onClick={handleNavigateToBattles}
              className="w-full rounded-2xl border py-3.5 text-sm font-semibold text-zinc-300 hover:text-white transition-colors"
              style={{ borderColor: COLORS.cardBorder }}
            >
              배틀 목록으로
            </button>
          </motion.div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
