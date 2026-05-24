import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api } from '../lib/api';
import { useOrderStore } from '../store/orderStore';
import { useAuthStore } from '../store/authStore';
import type { ApiResponse, PortfolioResponse } from '../types';

export function usePortfolio(includeHistory = false) {
  const setPortfolio = useOrderStore((s) => s.setPortfolio);
  const accessToken = useAuthStore((s) => s.accessToken);

  const query = useQuery({
    queryKey: ['portfolio', includeHistory],
    queryFn: async () => {
      const response = await api.get<ApiResponse<PortfolioResponse>>('/api/orders/portfolio', {
        params: { includeHistory },
      });
      return response.data.data;
    },
    enabled: !!accessToken,
    staleTime: 10_000,
    gcTime: 60_000,
    refetchInterval: 15_000,
  });

  useEffect(() => {
    if (query.data) {
      setPortfolio(query.data.portfolio, query.data.positions);
    }
  }, [query.data, setPortfolio]);

  return query;
}
