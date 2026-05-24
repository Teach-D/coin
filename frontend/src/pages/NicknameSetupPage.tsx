// ============================================================================
// CUSTOMIZATION
// ============================================================================

const COLORS = {
  background: '#0C0C0D',
  cardBg: '#18181B',
  cardBorder: '#27272A',
  accent: '#FF6B35',
  accentHover: '#E55A2B',
  loss: '#f87171',
} as const;

const CONTENT = {
  brand: 'CoinBattle',
  title: '닉네임 설정',
  subtitle: 'CoinBattle에서 사용할 닉네임을 입력하세요',
  placeholder: '닉네임 입력 (2~20자)',
  saveLabel: '시작하기',
  savingLabel: '저장 중...',
  logoutLabel: '로그아웃',
  errors: {
    validation: '2~20자, 공백 없이 입력하세요',
    duplicate: '이미 사용 중인 닉네임입니다',
    unknown: '닉네임 저장에 실패했습니다',
  },
} as const;

// ============================================================================
// END CUSTOMIZATION
// ============================================================================

import { useState, useRef, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Swords, LogOut } from 'lucide-react';
import type { AxiosError } from 'axios';
import { api } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import type { ApiResponse, UserProfileResponse } from '../types';

function isValidNickname(value: string): boolean {
  return value.length >= 2 && value.length <= 20 && !/\s/.test(value);
}

export function NicknameSetupPage() {
  const navigate = useNavigate();
  const { isAuthenticated, setNickname, setNicknameSet, clearAuth } = useAuthStore();

  const [nickInput, setNickInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 500);
    return () => clearTimeout(timer);
  }, []);

  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    setNickInput(e.target.value);
    setError(null);
  }

  async function handleSave() {
    const trimmed = nickInput.trim();

    if (!isValidNickname(trimmed)) {
      setError(CONTENT.errors.validation);
      return;
    }

    setIsPending(true);
    setError(null);

    try {
      const res = await api.patch<ApiResponse<UserProfileResponse>>('/api/users/me/nickname', {
        nickname: trimmed,
      });
      const data = res.data.data;
      setNickname(data.nickname);
      setNicknameSet(true);
      navigate('/', { replace: true });
    } catch (err) {
      const axiosErr = err as AxiosError<{ message: string; code?: string }>;
      const status = axiosErr.response?.status;
      if (status === 409) {
        setError(CONTENT.errors.duplicate);
      } else if (status === 400) {
        setError(CONTENT.errors.validation);
      } else {
        setError(CONTENT.errors.unknown);
      }
    } finally {
      setIsPending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !isPending) handleSave();
  }

  function handleLogout() {
    clearAuth();
    navigate('/login', { replace: true });
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 relative overflow-hidden"
      style={{ backgroundColor: COLORS.background }}
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 h-[400px] w-[400px] opacity-10">
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-orange-500 via-pink-500 to-cyan-400 blur-3xl" />
        </div>
      </div>

      <div className="w-full max-w-sm relative z-10">
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex items-center justify-center gap-2 mb-8"
        >
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: COLORS.accent + '22' }}
          >
            <Swords size={18} style={{ color: COLORS.accent }} />
          </div>
          <span className="text-xl font-bold text-white tracking-tight">{CONTENT.brand}</span>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.05 }}
          className="rounded-2xl border p-6"
          style={{ backgroundColor: COLORS.cardBg, borderColor: COLORS.cardBorder }}
        >
          <div className="mb-6">
            <h1 className="text-xl font-bold text-white mb-1">{CONTENT.title}</h1>
            <p className="text-sm text-zinc-400">{CONTENT.subtitle}</p>
          </div>

          <div className="space-y-3">
            <div>
              <input
                ref={inputRef}
                value={nickInput}
                onChange={handleInput}
                onKeyDown={handleKeyDown}
                maxLength={20}
                placeholder={CONTENT.placeholder}
                disabled={isPending}
                className="w-full rounded-xl px-4 py-3 text-sm text-white outline-none border transition-colors disabled:opacity-50"
                style={{
                  backgroundColor: '#0C0C0D',
                  borderColor: error ? COLORS.loss : COLORS.cardBorder,
                }}
                onFocus={(e) => {
                  if (!error) e.currentTarget.style.borderColor = COLORS.accent;
                }}
                onBlur={(e) => {
                  if (!error) e.currentTarget.style.borderColor = COLORS.cardBorder;
                }}
              />
              {error && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-1.5 text-xs pl-1"
                  style={{ color: COLORS.loss }}
                >
                  {error}
                </motion.p>
              )}
            </div>

            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={handleSave}
              disabled={isPending || nickInput.trim().length === 0}
              className="w-full rounded-xl py-3 text-sm font-semibold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: COLORS.accent }}
              onMouseEnter={(e) => {
                if (!isPending) e.currentTarget.style.backgroundColor = COLORS.accentHover;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = COLORS.accent;
              }}
            >
              {isPending ? CONTENT.savingLabel : CONTENT.saveLabel}
            </motion.button>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="flex justify-center mt-6"
        >
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <LogOut size={13} />
            {CONTENT.logoutLabel}
          </button>
        </motion.div>
      </div>
    </div>
  );
}
