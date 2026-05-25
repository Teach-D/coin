import { useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { AuthGuard } from './components/AuthGuard';
import { analytics } from './lib/analytics';
import { useAnalyticsIdentify } from './hooks/useAnalyticsIdentify';
import { BottomNavBar } from './components/BottomNavBar';
import { LoginPage } from './pages/LoginPage';
import { OAuth2Callback } from './pages/OAuth2Callback';
import { MarketListPage } from './pages/MarketListPage';
import { CoinDetailPage } from './pages/CoinDetailPage';
import { RankingPage } from './pages/RankingPage';
import { BattlePage } from './pages/BattlePage';
import { BattleRoom } from './pages/BattleRoom';
import { PortfolioPage } from './pages/PortfolioPage';
import { BattleResultPage } from './pages/BattleResultPage';
import { ProfilePage } from './pages/ProfilePage';
import { JoinByInvitePage } from './pages/JoinByInvitePage';
import { NicknameSetupPage } from './pages/NicknameSetupPage';
import { PrivacyPolicyPage } from './pages/PrivacyPolicyPage';
import { TermsOfServicePage } from './pages/TermsOfServicePage';

const HIDE_NAV_PATTERNS = [
  /^\/coin\//,
  /^\/battles\/.+/,
  /^\/result\//,
  /^\/join\//,
  /^\/auth\/callback$/,
  /^\/nickname-setup$/,
  /^\/privacy$/,
  /^\/terms$/,
];

function useShowNavBar() {
  const { pathname } = useLocation();
  return !HIDE_NAV_PATTERNS.some((pattern) => pattern.test(pathname));
}

function usePageTracking() {
  const { pathname } = useLocation();
  useEffect(() => {
    analytics.page(pathname);
  }, [pathname]);
}

export default function App() {
  const showNavBar = useShowNavBar();
  usePageTracking();
  useAnalyticsIdentify();

  return (
    <div className="flex flex-col min-h-screen">
      <main className={showNavBar ? 'flex-1 pb-16' : 'flex-1'}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/auth/callback" element={<OAuth2Callback />} />
          <Route path="/nickname-setup" element={<NicknameSetupPage />} />
          <Route path="/privacy" element={<PrivacyPolicyPage />} />
          <Route path="/terms" element={<TermsOfServicePage />} />
          <Route path="/" element={<MarketListPage />} />
          <Route path="/coin/:ticker" element={<CoinDetailPage />} />
          <Route path="/battles" element={<BattlePage />} />
          <Route path="/battles/:battleId" element={<AuthGuard><BattleRoom /></AuthGuard>} />
          <Route path="/ranking" element={<RankingPage />} />
          <Route path="/result/:battleId" element={<BattleResultPage />} />
          <Route path="/portfolio" element={<AuthGuard><PortfolioPage /></AuthGuard>} />
          <Route path="/profile" element={<AuthGuard><ProfilePage /></AuthGuard>} />
          <Route path="/join/:inviteCode" element={<AuthGuard><JoinByInvitePage /></AuthGuard>} />
        </Routes>
      </main>
      {showNavBar && <BottomNavBar />}
    </div>
  );
}
