import { create } from 'zustand';
import type { Portfolio, Position } from '../types';

interface OrderState {
  balance: number;
  totalAsset: number;
  totalPnl: number;
  totalPnlRate: number;
  positions: Position[];

  selectedTicker: string;
  orderType: 'MARKET' | 'LIMIT';
  direction: 'LONG' | 'SHORT';
  amount: string;
  leverage: number;
  limitPrice: string;

  isSubmitting: boolean;

  setPortfolio: (portfolio: Portfolio, positions: Position[]) => void;
  removePosition: (positionId: number) => void;
  setTicker: (ticker: string) => void;
  setDirection: (direction: 'LONG' | 'SHORT') => void;
  setLeverage: (leverage: number) => void;
  setAmount: (amount: string) => void;
  setOrderType: (type: 'MARKET' | 'LIMIT') => void;
  setLimitPrice: (price: string) => void;
  setSubmitting: (submitting: boolean) => void;
  resetForm: () => void;
}

export const useOrderStore = create<OrderState>((set) => ({
  balance: 0,
  totalAsset: 0,
  totalPnl: 0,
  totalPnlRate: 0,
  positions: [],

  selectedTicker: '',
  orderType: 'MARKET',
  direction: 'LONG',
  amount: '',
  leverage: 1,
  limitPrice: '',

  isSubmitting: false,

  setPortfolio: (portfolio, positions) =>
    set({
      balance: portfolio.balance,
      totalAsset: portfolio.totalAsset,
      totalPnl: portfolio.totalPnl,
      totalPnlRate: portfolio.totalPnlRate,
      positions,
    }),
  removePosition: (positionId) =>
    set((state) => ({
      positions: state.positions.filter((p) => p.positionId !== positionId),
    })),
  setTicker: (ticker) => set({ selectedTicker: ticker }),
  setDirection: (direction) => set({ direction }),
  setLeverage: (leverage) => set({ leverage }),
  setAmount: (amount) => set({ amount }),
  setOrderType: (orderType) => set({ orderType }),
  setLimitPrice: (limitPrice) => set({ limitPrice }),
  setSubmitting: (isSubmitting) => set({ isSubmitting }),
  resetForm: () =>
    set({ amount: '', limitPrice: '', orderType: 'MARKET', leverage: 1, direction: 'LONG' }),
}));
