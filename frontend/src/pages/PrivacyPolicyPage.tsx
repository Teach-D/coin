import { useNavigate } from 'react-router-dom';

export function PrivacyPolicyPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#0C0C0D] text-zinc-200">
      <div className="max-w-2xl mx-auto px-5 py-10">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-zinc-400 hover:text-zinc-200 text-sm mb-8 transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
          뒤로가기
        </button>

        <h1 className="text-2xl font-bold text-white mb-1">개인정보처리방침</h1>
        <p className="text-zinc-500 text-sm mb-8">최종 업데이트: 2025년 5월 24일</p>

        <div className="flex flex-col gap-8 text-sm leading-relaxed">
          <section>
            <h2 className="text-base font-semibold text-white mb-3">1. 수집하는 개인정보</h2>
            <p className="text-zinc-400 mb-3">
              CoinBattle은 Google OAuth2 로그인 시 다음 정보를 수집합니다.
            </p>
            <ul className="flex flex-col gap-2 text-zinc-400 pl-4">
              <li className="flex gap-2">
                <span className="text-orange-400 shrink-0">•</span>
                이름 및 프로필 사진 (Google 계정 기본 정보)
              </li>
              <li className="flex gap-2">
                <span className="text-orange-400 shrink-0">•</span>
                이메일 주소
              </li>
              <li className="flex gap-2">
                <span className="text-orange-400 shrink-0">•</span>
                서비스 이용 기록 (주문, 배틀 참여, 랭킹 등)
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-3">2. 개인정보 수집 목적</h2>
            <ul className="flex flex-col gap-2 text-zinc-400 pl-4">
              <li className="flex gap-2">
                <span className="text-orange-400 shrink-0">•</span>
                회원 식별 및 서비스 제공
              </li>
              <li className="flex gap-2">
                <span className="text-orange-400 shrink-0">•</span>
                랭킹 및 배틀 결과 표시
              </li>
              <li className="flex gap-2">
                <span className="text-orange-400 shrink-0">•</span>
                서비스 운영 및 개선
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-3">3. 개인정보 보유 기간</h2>
            <p className="text-zinc-400">
              회원 탈퇴 시 지체 없이 파기합니다. 단, 관련 법령에 따라 보존이 필요한 경우 해당 기간 동안 보관합니다.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-3">4. 개인정보 제3자 제공</h2>
            <p className="text-zinc-400">
              CoinBattle은 수집한 개인정보를 원칙적으로 제3자에게 제공하지 않습니다. 단, 다음의 경우는 예외입니다.
            </p>
            <ul className="flex flex-col gap-2 text-zinc-400 pl-4 mt-3">
              <li className="flex gap-2">
                <span className="text-orange-400 shrink-0">•</span>
                이용자가 사전에 동의한 경우
              </li>
              <li className="flex gap-2">
                <span className="text-orange-400 shrink-0">•</span>
                법령에 의거하거나 수사 목적으로 법령에 정해진 절차와 방법에 따라 수사기관의 요구가 있는 경우
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-3">5. 이용자의 권리</h2>
            <p className="text-zinc-400 mb-3">
              이용자는 언제든지 자신의 개인정보에 대해 다음 권리를 행사할 수 있습니다.
            </p>
            <ul className="flex flex-col gap-2 text-zinc-400 pl-4">
              <li className="flex gap-2">
                <span className="text-orange-400 shrink-0">•</span>
                개인정보 열람 요청
              </li>
              <li className="flex gap-2">
                <span className="text-orange-400 shrink-0">•</span>
                개인정보 정정·삭제 요청
              </li>
              <li className="flex gap-2">
                <span className="text-orange-400 shrink-0">•</span>
                회원 탈퇴 및 개인정보 파기 요청
              </li>
            </ul>
            <p className="text-zinc-500 mt-3">
              권리 행사는 프로필 설정 또는 이메일(wkadht0619@gmail.com)을 통해 요청하실 수 있습니다.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-3">6. 개인정보 보호책임자</h2>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-zinc-400">
              <p>책임자: 김동현</p>
              <p>이메일: wkadht0619@gmail.com</p>
            </div>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-3">7. 방침 변경</h2>
            <p className="text-zinc-400">
              개인정보처리방침이 변경되는 경우 서비스 내 공지사항을 통해 안내드립니다.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
