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

export function useBuyOrder() {
  const queryClient = useQueryClient();
  const setSubmitting = useOrderStore((s) => s.setSubmitting);
  const resetForm = useOrderStore((s) => s.resetForm);

  return useMutation({
    mutationFn: async (payload: Omit<BuyOrderRequest, 'idempotencyKey'>) => {
      const body: BuyOrderRequest = { ...payload, idempotencyKey: uuidv4() };
      const response = await api.post<ApiResponse<BuyOrderResponse>>('/api/orders/buy', body);
      return response.data.data;
    },
    onMutate: () => setSubmitting(true),
    onSettled: () => setSubmitting(false),
    onSuccess: (_data, variables) => {
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });
      analytics.track('Order Placed', {
        side: 'BUY',
        ticker: variables.ticker,
        direction: variables.direction,
        amount: variables.amount,
        leverage: variables.leverage,
        order_type: variables.orderType,
      });
    },
  });
}

export function useSellOrder() {
  const queryClient = useQueryClient();
  const setSubmitting = useOrderStore((s) => s.setSubmitting);
  const removePosition = useOrderStore((s) => s.removePosition);

  return useMutation({
    mutationFn: async (payload: Omit<SellOrderRequest, 'idempotencyKey'>) => {
      const body: SellOrderRequest = { ...payload, idempotencyKey: uuidv4() };
      const response = await api.post<ApiResponse<SellOrderResponse>>('/api/orders/sell', body);
      return response.data.data;
    },
    onMutate: () => setSubmitting(true),
    onSettled: () => setSubmitting(false),
    onSuccess: (_data, variables) => {
      removePosition(variables.positionId);
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });
      analytics.track('Order Placed', {
        side: 'SELL',
        position_id: variables.positionId,
        close_ratio: variables.closeRatio,
      });
    },
    onError: (error: any) => {
      const message = error?.response?.data?.message ?? '청산 요청에 실패했습니다.';
      alert(message);
    },
  });
}
