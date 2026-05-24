import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { analytics } from '../lib/analytics';

export function OAuth2Callback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setTokens, setNickname, setNicknameSet } = useAuthStore();

  useEffect(() => {
    const accessToken = searchParams.get('accessToken');
    const refreshToken = searchParams.get('refreshToken');
    const nickname = searchParams.get('nickname');
    const nicknameSet = searchParams.get('nicknameSet') === 'true';

    if (accessToken && refreshToken) {
      setTokens(accessToken, refreshToken);
      if (nickname) setNickname(nickname);
      setNicknameSet(nicknameSet);
      analytics.track('Login', { method: 'google', nickname });

      if (!nicknameSet) {
        navigate('/nickname-setup', { replace: true });
      } else {
        navigate('/', { replace: true });
      }
    } else {
      navigate('/login', { replace: true });
    }
  }, []);

  return (
    <div className="flex items-center justify-center min-h-screen" style={{ backgroundColor: '#0C0C0D' }}>
      <p className="text-white text-lg">로그인 처리 중...</p>
    </div>
  );
}
