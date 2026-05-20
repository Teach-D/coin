export function LoginPage() {
  const handleSocialLogin = (provider: 'google' | 'kakao') => {
    window.location.href = `${import.meta.env.VITE_API_URL}/oauth2/authorization/${provider}`;
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-[#0C0C0D]">
      <div className="bg-zinc-900 rounded-2xl p-10 w-full max-w-sm shadow-2xl flex flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-2">
          <span className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-orange-400 to-yellow-400 bg-clip-text text-transparent">
            CoinBattle
          </span>
          <p className="text-zinc-400 text-sm">10분 만에 승부를 결정짓는 트레이딩 배틀</p>
        </div>

        <div className="w-full flex flex-col gap-3">
          <p className="text-zinc-300 text-center text-sm mb-1">소셜 로그인으로 시작하기</p>

          <button
            onClick={() => handleSocialLogin('google')}
            className="flex items-center justify-center gap-3 w-full py-3 rounded-lg bg-white text-zinc-900 font-semibold text-sm hover:bg-gray-100 transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" fill="#FFC107"/>
              <path d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" fill="#FF3D00"/>
              <path d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" fill="#4CAF50"/>
              <path d="M43.611 20.083H42V20H24v8h11.303a11.977 11.977 0 0 1-4.087 5.571l6.19 5.238C42.021 35.851 44 30.138 44 24c0-1.341-.138-2.65-.389-3.917z" fill="#1976D2"/>
            </svg>
            Google로 계속하기
          </button>

          <button
            onClick={() => handleSocialLogin('kakao')}
            className="flex items-center justify-center gap-3 w-full py-3 rounded-lg font-semibold text-sm text-zinc-900 hover:brightness-95 transition-all"
            style={{ backgroundColor: '#FEE500' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path fillRule="evenodd" clipRule="evenodd" d="M12 3C6.477 3 2 6.477 2 10.818c0 2.718 1.61 5.11 4.07 6.6-.18.67-.654 2.42-.75 2.8-.116.468.172.462.36.336.148-.098 2.354-1.602 3.308-2.254.315.044.638.068.967.069H12c5.523 0 10-3.477 10-7.818S17.523 3 12 3z" fill="#3C1E1E"/>
            </svg>
            카카오로 계속하기
          </button>
        </div>
      </div>
    </div>
  );
}
