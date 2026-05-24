import { useMutation, useQueryClient } from '@tanstack/react-query';
import { v4 as uuidv4 } from 'uuid';
import { api } from '../lib/api';
import { useOrderStore } from '../store/orderStore';
import { analytics } from '../lib/analytics';
import type {
  BuyOrderRequest,
  BuyOrderResponse,
  SellOrderRequest,
  SellOrderResponse,
  ApiResponse,
} from '../types';

export function useBattleBuyOrder(battleId: string) {
  const queryClient = useQueryClient();
  const setSubmitting = useOrderStore((s) => s.setSubmitting);
  const resetForm = useOrderStore((s) => s.resetForm);

  return useMutation({
    mutationFn: async (payload: Omit<BuyOrderRequest, 'idempotencyKey'>) => {
      const body: BuyOrderRequest = { ...payload, idempotencyKey: uuidv4() };
      const response = await api.post<ApiResponse<BuyOrderResponse>>(
        `/api/battles/${battleId}/buy`,
        body,
      );
      return response.data.data;
    },
    onMutate: () => setSubmitting(true),
    onSettled: () => setSubmitting(false),
    onSuccess: (_data, variables) => {
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['battle', battleId, 'balance'] });
      queryClient.invalidateQueries({ queryKey: ['battle', battleId, 'positions'] });
      analytics.track('Battle Order Placed', {
        side: 'BUY',
        battle_id: battleId,
        ticker: variables.ticker,
        direction: variables.direction,
        amount: variables.amount,
        leverage: variables.leverage,
        order_type: variables.orderType,
      });
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        '매수 요청에 실패했습니다.';
      alert(message);
    },
  });
}

export function useBattleSellOrder(battleId: string) {
  const queryClient = useQueryClient();
  const setSubmitting = useOrderStore((s) => s.setSubmitting);

  return useMutation({
    mutationFn: async (payload: Omit<SellOrderRequest, 'idempotencyKey'>) => {
      const body: SellOrderRequest = { ...payload, idempotencyKey: uuidv4() };
      const response = await api.post<ApiResponse<SellOrderResponse>>(
        `/api/battles/${battleId}/sell`,
        body,
      );
      return response.data.data;
    },
    onMutate: () => setSubmitting(true),
    onSettled: () => setSubmitting(false),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['battle', battleId, 'balance'] });
      queryClient.invalidateQueries({ queryKey: ['battle', battleId, 'positions'] });
      analytics.track('Battle Order Placed', {
        side: 'SELL',
        battle_id: battleId,
        position_id: variables.positionId,
        close_ratio: variables.closeRatio,
      });
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        '청산 요청에 실패했습니다.';
      alert(message);
    },
  });
}
