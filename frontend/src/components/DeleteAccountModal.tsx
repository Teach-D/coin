import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle } from 'lucide-react';

// ============================================================================
// CUSTOMIZATION
// ============================================================================

const COLORS = {
  background: '#0C0C0D',
  cardBg: '#18181B',
  cardBorder: '#27272A',
} as const;

const CONTENT = {
  title: '회원탈퇴',
  body: '탈퇴하면 모든 데이터가 삭제되며 복구할 수 없습니다. 정말 탈퇴하시겠습니까?',
  cancel: '취소',
  confirm: '탈퇴하기',
  confirming: '처리 중...',
} as const;

// ============================================================================
// END CUSTOMIZATION
// ============================================================================

interface DeleteAccountModalProps {
  open: boolean;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeleteAccountModal({ open, isPending, onCancel, onConfirm }: DeleteAccountModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center px-4 pb-4 sm:pb-0"
          style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !isPending) onCancel();
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 32, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.97 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="w-full max-w-sm rounded-2xl border p-6 space-y-5"
            style={{ backgroundColor: COLORS.cardBg, borderColor: COLORS.cardBorder }}
          >
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="w-12 h-12 rounded-full bg-red-500/15 flex items-center justify-center">
                <AlertTriangle size={22} className="text-red-400" />
              </div>
              <h2 className="text-base font-bold text-white">{CONTENT.title}</h2>
              <p className="text-sm text-zinc-400 leading-relaxed">{CONTENT.body}</p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={onCancel}
                disabled={isPending}
                className="flex-1 py-3 rounded-xl text-sm font-semibold text-zinc-300 bg-zinc-800 hover:bg-zinc-700 transition-colors disabled:opacity-50"
              >
                {CONTENT.cancel}
              </button>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={onConfirm}
                disabled={isPending}
                className="flex-1 py-3 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-500 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isPending ? CONTENT.confirming : CONTENT.confirm}
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
