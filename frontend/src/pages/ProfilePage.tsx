import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { ChevronLeft, ChevronRight, Pencil, Check, X, Trophy, Swords, Minus } from 'lucide-react';
import { useUserProfile } from '../hooks/useUserProfile';
import { useUserStats } from '../hooks/useUserStats';
import { useUpdateProfile } from '../hooks/useUpdateProfile';
import type { AxiosError } from 'axios';

const COLORS = {
  background: '#0C0C0D',
  cardBg: '#18181B',
  cardBorder: '#27272A',
  accent: '#FF6B35',
  profit: '#2DD4BF',
  loss: '#f87171',
} as const;

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  return `${local.slice(0, 2)}***@${domain}`;
}

function SkeletonCard({ height = 80 }: { height?: number }) {
  return (
    <div
      className="rounded-2xl p-4 border animate-pulse"
      style={{ backgroundColor: COLORS.cardBg, borderColor: COLORS.cardBorder, minHeight: height }}
    >
      <div className="w-20 h-4 bg-zinc-800 rounded mb-3" />
      <div className="w-28 h-6 bg-zinc-800 rounded" />
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: number;
  color: string;
  icon: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex-1 rounded-2xl p-4 border flex flex-col items-center gap-1"
      style={{ backgroundColor: COLORS.cardBg, borderColor: COLORS.cardBorder }}
    >
      <div style={{ color }}>{icon}</div>
      <p className="text-2xl font-bold" style={{ color }}>
        {value}
      </p>
      <p className="text-xs text-zinc-500">{label}</p>
    </motion.div>
  );
}

const MotionLink = motion.create(Link);

export function ProfilePage() {
  const navigate = useNavigate();
  const { data: profile, isLoading: profileLoading } = useUserProfile();
  const { data: stats, isLoading: statsLoading } = useUserStats();
  const updateProfile = useUpdateProfile();

  const [editing, setEditing] = useState(false);
  const [nickInput, setNickInput] = useState('');
  const [nickError, setNickError] = useState<string | null>(null);

  function handleEditStart() {
    setNickInput(profile?.nickname ?? '');
    setNickError(null);
    setEditing(true);
  }

  function handleEditCancel() {
    setEditing(false);
    setNickError(null);
  }

  async function handleEditSave() {
    if (!nickInput.trim() || nickInput.trim().length < 2 || nickInput.trim().length > 20) {
      setNickError('닉네임은 2~20자 사이여야 합니다');
      return;
    }
    try {
      await updateProfile.mutateAsync(nickInput.trim());
      setEditing(false);
      setNickError(null);
    } catch (err) {
      const axiosErr = err as AxiosError<{ message: string }>;
      setNickError(axiosErr.response?.data?.message ?? '닉네임 변경에 실패했습니다');
    }
  }

  const initial = profile?.nickname?.charAt(0).toUpperCase() ?? '?';
  const winRate = stats?.winRate ?? 0;

  return (
    <div className="min-h-screen pb-10" style={{ backgroundColor: COLORS.background, color: '#fff' }}>
      <div
        className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3 border-b backdrop-blur-sm"
        style={{ backgroundColor: COLORS.background + 'CC', borderColor: COLORS.cardBorder }}
      >
        <button
          onClick={() => navigate(-1)}
          className="p-1 rounded-lg hover:bg-zinc-800 transition-colors"
        >
          <ChevronLeft size={22} />
        </button>
        <h1 className="text-base font-bold">내 프로필</h1>
      </div>

      <div className="px-4 mt-6 space-y-4">
        {profileLoading ? (
          <SkeletonCard height={120} />
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="rounded-2xl p-5 border"
            style={{ backgroundColor: COLORS.cardBg, borderColor: COLORS.cardBorder }}
          >
            <div className="flex items-center gap-4">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold shrink-0"
                style={{ backgroundColor: COLORS.accent + '22', color: COLORS.accent }}
              >
                {profile?.profileImageUrl ? (
                  <img
                    src={profile.profileImageUrl}
                    alt="profile"
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  initial
                )}
              </div>

              <div className="flex-1 min-w-0">
                {editing ? (
                  <div className="space-y-2">
                    <input
                      value={nickInput}
                      onChange={(e) => setNickInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleEditSave();
                        if (e.key === 'Escape') handleEditCancel();
                      }}
                      autoFocus
                      maxLength={20}
                      className="w-full bg-zinc-800 text-white text-sm rounded-lg px-3 py-2 outline-none border border-zinc-600 focus:border-zinc-400"
                      placeholder="닉네임 입력"
                    />
                    {nickError && (
                      <p className="text-xs" style={{ color: COLORS.loss }}>
                        {nickError}
                      </p>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={handleEditSave}
                        disabled={updateProfile.isPending}
                        className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
                        style={{ backgroundColor: COLORS.accent, color: '#fff' }}
                      >
                        <Check size={12} />
                        저장
                      </button>
                      <button
                        onClick={handleEditCancel}
                        className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg font-medium bg-zinc-700 hover:bg-zinc-600 transition-colors"
                      >
                        <X size={12} />
                        취소
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-base truncate">{profile?.nickname}</p>
                    <button
                      onClick={handleEditStart}
                      className="p-1 rounded-md hover:bg-zinc-700 transition-colors shrink-0"
                    >
                      <Pencil size={14} className="text-zinc-400" />
                    </button>
                  </div>
                )}
                <p className="text-xs text-zinc-500 mt-1 truncate">
                  {profile?.email ? maskEmail(profile.email) : ''}
                </p>
              </div>
            </div>
          </motion.div>
        )}

        <p className="text-xs font-semibold tracking-widest uppercase text-zinc-500 pt-2">
          PVP 전적
        </p>

        {statsLoading ? (
          <div className="flex gap-3">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : (
          <div className="flex gap-3">
            <StatCard
              label="승"
              value={stats?.wins ?? 0}
              color={COLORS.profit}
              icon={<Trophy size={18} />}
            />
            <StatCard
              label="패"
              value={stats?.losses ?? 0}
              color={COLORS.loss}
              icon={<Swords size={18} />}
            />
            <StatCard
              label="무"
              value={stats?.draws ?? 0}
              color="#94a3b8"
              icon={<Minus size={18} />}
            />
          </div>
        )}

        {!statsLoading && (stats?.totalGames ?? 0) > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="rounded-2xl p-4 border"
            style={{ backgroundColor: COLORS.cardBg, borderColor: COLORS.cardBorder }}
          >
            <div className="flex justify-between mb-2">
              <p className="text-xs text-zinc-500">승률</p>
              <p className="text-xs font-bold" style={{ color: COLORS.profit }}>
                {winRate.toFixed(1)}%
              </p>
            </div>
            <div className="w-full h-2 rounded-full bg-zinc-800 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(winRate, 100)}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
                className="h-full rounded-full"
                style={{ backgroundColor: COLORS.profit }}
              />
            </div>
          </motion.div>
        )}

        <p className="text-xs font-semibold tracking-widest uppercase text-zinc-500 pt-2">
          내 자산
        </p>

        <MotionLink
          to="/portfolio"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-2xl p-4 border flex justify-between items-center hover:opacity-80 transition-opacity active:scale-[0.98]"
          style={{ backgroundColor: COLORS.cardBg, borderColor: COLORS.cardBorder }}
        >
          <div className="space-y-0.5">
            <p className="text-sm font-semibold text-white">포트폴리오</p>
            <p className="text-xs text-zinc-500">잔고·포지션 확인</p>
          </div>
          <ChevronRight size={18} className="text-zinc-500 shrink-0" />
        </MotionLink>

        <p className="text-xs font-semibold tracking-widest uppercase text-zinc-500 pt-2">
          시즌 기록
        </p>

        {statsLoading ? (
          <SkeletonCard />
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="rounded-2xl p-4 border"
            style={{ backgroundColor: COLORS.cardBg, borderColor: COLORS.cardBorder }}
          >
            <p className="text-xs text-zinc-500 mb-1">시즌 최고 수익률</p>
            {stats?.bestReturnRate != null ? (
              <p
                className="text-2xl font-bold"
                style={{ color: stats.bestReturnRate >= 0 ? COLORS.profit : COLORS.loss }}
              >
                {stats.bestReturnRate >= 0 ? '+' : ''}
                {stats.bestReturnRate.toFixed(2)}%
              </p>
            ) : (
              <p className="text-sm text-zinc-600">기록 없음</p>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}
