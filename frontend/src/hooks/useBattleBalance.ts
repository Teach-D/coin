import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { ApiResponse, BattleBalanceResponse } from '../types';

export function useBattleBalance(battleId: string | undefined) {
  return useQuery({
    queryKey: ['battle', battleId, 'balance'],
    queryFn: async () => {
      const response = await api.get<ApiResponse<BattleBalanceResponse>>(
        `/api/battles/${battleId}/my-balance`,
      );
      return response.data.data;
    },
    enabled: !!battleId,
    staleTime: 0,
    gcTime: 10_000,
    refetchInterval: 5_000,
  });
}
