import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { ApiResponse, BattlePositionsResponse } from '../types';

export function useBattlePositions(battleId: string | undefined) {
  return useQuery({
    queryKey: ['battle', battleId, 'positions'],
    queryFn: async () => {
      const response = await api.get<ApiResponse<BattlePositionsResponse>>(
        `/api/battles/${battleId}/positions`,
      );
      return response.data.data.positions;
    },
    enabled: !!battleId,
    staleTime: 0,
    gcTime: 10_000,
    refetchInterval: 5_000,
  });
}
