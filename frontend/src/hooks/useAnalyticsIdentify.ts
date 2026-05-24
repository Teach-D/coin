import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import { api } from '../lib/api';
import { analytics } from '../lib/analytics';
import type { ApiResponse, UserProfileResponse } from '../types';

export function useAnalyticsIdentify() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());
  const identified = useRef(false);

  const { data: profile } = useQuery({
    queryKey: ['user', 'profile'],
    queryFn: async () => {
      const res = await api.get<ApiResponse<UserProfileResponse>>('/api/users/me');
      return res.data.data;
    },
    enabled: isAuthenticated,
    staleTime: 60_000,
    gcTime: 300_000,
  });

  useEffect(() => {
    if (!isAuthenticated) {
      identified.current = false;
      return;
    }
    if (!profile || identified.current) return;
    analytics.identify(String(profile.userId), {
      $name: profile.nickname,
      $email: profile.email,
    });
    identified.current = true;
  }, [isAuthenticated, profile]);
}
