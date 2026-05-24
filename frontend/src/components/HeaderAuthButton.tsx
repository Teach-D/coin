import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

export function HeaderAuthButton() {
  const navigate = useNavigate();
  const { accessToken, nickname } = useAuthStore();

  if (accessToken && nickname) {
    return (
      <button
        onClick={() => navigate('/profile')}
        className="text-sm text-zinc-300 hover:text-white font-medium transition-colors truncate max-w-[100px]"
      >
        {nickname}
      </button>
    );
  }

  return (
    <button
      onClick={() => navigate('/login')}
      className="px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-400 text-white text-xs font-semibold transition-colors shrink-0"
    >
      로그인
    </button>
  );
}
