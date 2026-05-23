import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

export function OAuth2Callback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setTokens, setNickname } = useAuthStore();

  useEffect(() => {
    const accessToken = searchParams.get('accessToken');
    const refreshToken = searchParams.get('refreshToken');
    const nickname = searchParams.get('nickname');

    if (accessToken && refreshToken) {
      setTokens(accessToken, refreshToken);
      if (nickname) setNickname(nickname);
      navigate('/', { replace: true });
    } else {
      navigate('/login', { replace: true });
    }
  }, []);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900">
      <p className="text-white text-lg">로그인 처리 중...</p>
    </div>
  );
}
