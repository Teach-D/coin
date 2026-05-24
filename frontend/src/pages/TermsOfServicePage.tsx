import { useNavigate } from 'react-router-dom';

export function TermsOfServicePage() {
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

        <h1 className="text-2xl font-bold text-white mb-1">서비스 약관</h1>
        <p className="text-zinc-500 text-sm mb-8">최종 업데이트: 2025년 5월 24일</p>

        <div className="flex flex-col gap-8 text-sm leading-relaxed">
          <section>
            <h2 className="text-base font-semibold text-white mb-3">1. 서비스 개요</h2>
            <p className="text-zinc-400">
              CoinBattle(이하 "서비스")은 가상 자산 시뮬레이션 기반의 트레이딩 배틀 게임입니다.
              서비스 내 모든 거래는 실제 자산이 아닌 가상 포인트를 사용하며, 실제 투자와 무관합니다.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-3">2. 이용 자격</h2>
            <ul className="flex flex-col gap-2 text-zinc-400 pl-4">
              <li className="flex gap-2">
                <span className="text-orange-400 shrink-0">•</span>
                만 14세 이상 누구나 이용할 수 있습니다.
              </li>
              <li className="flex gap-2">
                <span className="text-orange-400 shrink-0">•</span>
                Google 계정을 통해 가입하며, 1인 1계정 원칙을 준수해야 합니다.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-3">3. 금지 행위</h2>
            <p className="text-zinc-400 mb-3">다음 행위는 엄격히 금지됩니다.</p>
            <ul className="flex flex-col gap-2 text-zinc-400 pl-4">
              <li className="flex gap-2">
                <span className="text-orange-400 shrink-0">•</span>
                다중 계정 생성 및 운영
              </li>
              <li className="flex gap-2">
                <span className="text-orange-400 shrink-0">•</span>
                서비스 취약점 악용, 버그 어뷰징
              </li>
              <li className="flex gap-2">
                <span className="text-orange-400 shrink-0">•</span>
                타 이용자에 대한 욕설, 혐오 발언, 개인정보 침해
              </li>
              <li className="flex gap-2">
                <span className="text-orange-400 shrink-0">•</span>
                자동화 프로그램(봇)을 통한 이용
              </li>
              <li className="flex gap-2">
                <span className="text-orange-400 shrink-0">•</span>
                서비스 운영 방해 또는 서버 부하를 유발하는 행위
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-3">4. 가상 자산 및 포인트</h2>
            <ul className="flex flex-col gap-2 text-zinc-400 pl-4">
              <li className="flex gap-2">
                <span className="text-orange-400 shrink-0">•</span>
                서비스 내 모든 잔고, 포인트, 랭킹 점수는 실제 금전적 가치가 없습니다.
              </li>
              <li className="flex gap-2">
                <span className="text-orange-400 shrink-0">•</span>
                가상 자산은 현금으로 환전되거나 타인에게 양도될 수 없습니다.
              </li>
              <li className="flex gap-2">
                <span className="text-orange-400 shrink-0">•</span>
                운영자는 서비스 정책에 따라 가상 자산 수치를 조정할 수 있습니다.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-3">5. 서비스 변경 및 중단</h2>
            <p className="text-zinc-400">
              운영자는 서비스 개선, 보안, 운영상의 이유로 사전 고지 후 서비스를 변경하거나 일시 중단할 수 있습니다.
              불가피한 경우 사전 고지 없이 중단될 수 있으며, 이로 인한 손해에 대해 책임을 지지 않습니다.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-3">6. 면책 조항</h2>
            <ul className="flex flex-col gap-2 text-zinc-400 pl-4">
              <li className="flex gap-2">
                <span className="text-orange-400 shrink-0">•</span>
                서비스는 오락·게임 목적으로만 제공되며, 실제 투자 조언을 포함하지 않습니다.
              </li>
              <li className="flex gap-2">
                <span className="text-orange-400 shrink-0">•</span>
                시세 데이터는 실시간 API 기반이나, 정확성을 보장하지 않습니다.
              </li>
              <li className="flex gap-2">
                <span className="text-orange-400 shrink-0">•</span>
                이용자 간 배틀 결과에 대해 운영자는 책임을 지지 않습니다.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-3">7. 계정 정지 및 탈퇴</h2>
            <p className="text-zinc-400 mb-3">
              운영자는 금지 행위 적발 시 사전 경고 없이 계정을 정지 또는 영구 탈퇴 처리할 수 있습니다.
              이용자는 언제든지 프로필 설정을 통해 회원 탈퇴를 신청할 수 있습니다.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-3">8. 약관 변경</h2>
            <p className="text-zinc-400">
              약관이 변경되는 경우 최소 7일 전 서비스 내 공지를 통해 안내합니다.
              변경된 약관에 동의하지 않는 경우 서비스 이용을 중단하고 탈퇴할 수 있습니다.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-3">9. 문의</h2>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-zinc-400">
              <p>운영자: 김동현</p>
              <p>이메일: wkadht0619@gmail.com</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
