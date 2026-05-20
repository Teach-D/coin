const TABS = [
  { path: '/', label: '시세', icon: 'TrendingUp' },
  { path: '/battles', label: '배틀', icon: 'Swords' },
  { path: '/ranking', label: '랭킹', icon: 'Trophy' },
  { path: '/profile', label: '마이페이지', icon: 'User' },
] as const;

import { NavLink } from 'react-router-dom';
import { TrendingUp, Swords, Trophy, User } from 'lucide-react';
import { motion } from 'motion/react';

const ICON_MAP = { TrendingUp, Swords, Trophy, User } as const;

const MotionNavLink = motion.create(NavLink);

export function BottomNavBar() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[#0C0C0D]/95 backdrop-blur border-t border-zinc-800 pb-6">
      <div className="flex items-center max-w-2xl mx-auto">
        {TABS.map((tab) => {
          const Icon = ICON_MAP[tab.icon];

          return (
            <MotionNavLink
              key={tab.path}
              to={tab.path}
              end={tab.path === '/'}
              whileTap={{ scale: 0.92 }}
              aria-label={tab.label}
              className="flex-1 flex flex-col items-center gap-1 pt-3 pb-1"
            >
              {({ isActive }) => (
                <>
                  <Icon
                    size={22}
                    aria-hidden={true}
                    className={isActive ? 'text-orange-500' : 'text-zinc-500'}
                    strokeWidth={isActive ? 2.5 : 1.8}
                  />
                  <span
                    aria-current={isActive ? 'page' : undefined}
                    className={`text-[10px] font-medium ${
                      isActive ? 'text-orange-500' : 'text-zinc-500'
                    }`}
                  >
                    {tab.label}
                  </span>
                </>
              )}
            </MotionNavLink>
          );
        })}
      </div>
    </nav>
  );
}
