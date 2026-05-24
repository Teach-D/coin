import { Link } from 'react-router-dom';

export function LoginPage() {
  const handleGoogleLogin = () => {
    window.location.href = `${import.meta.env.VITE_API_URL}/oauth2/authorization/google`;
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-[#0C0C0D]">
      <div className="bg-zinc-900 rounded-2xl p-8 w-full max-w-sm shadow-2xl flex flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-2">
          <span className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-orange-400 to-yellow-400 bg-clip-text text-transparent">
            CoinBattle
          </span>
          <p className="text-zinc-400 text-sm">10분 만에 승부를 결정짓는 트레이딩 배틀</p>
        </div>

        <div className="w-full flex flex-col gap-3">
          <p className="text-zinc-300 text-center text-sm">소셜 로그인으로 시작하기</p>

          <button
            onClick={handleGoogleLogin}
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
        </div>

        <div className="w-full border border-zinc-800 rounded-xl p-4 flex flex-col gap-3">
          <p className="text-zinc-400 text-xs">
            Google 계정의 아래 정보가 CoinBattle에 공유됩니다.
          </p>
          <ul className="flex flex-col gap-2">
            <li className="flex items-center gap-2.5 text-zinc-300 text-xs">
              <svg className="shrink-0 text-zinc-500" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
              이름 및 프로필 사진
            </li>
            <li className="flex items-center gap-2.5 text-zinc-300 text-xs">
              <svg className="shrink-0 text-zinc-500" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="20" height="16" x="2" y="4" rx="2"/>
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
              </svg>
              이메일 주소
            </li>
          </ul>
          <p className="text-zinc-500 text-xs leading-relaxed">
            CoinBattle의{' '}
            <Link to="/privacy" className="text-orange-400 underline underline-offset-2 hover:text-orange-300">
              개인정보처리방침
            </Link>
            {' '}및{' '}
            <Link to="/terms" className="text-orange-400 underline underline-offset-2 hover:text-orange-300">
              서비스 약관
            </Link>
            을 검토하세요. Google 계정에서 언제든지 변경할 수 있습니다.
          </p>
        </div>
      </div>
    </div>
  );
}
