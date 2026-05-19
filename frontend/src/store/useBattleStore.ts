import { create } from 'zustand';
import { api } from '../lib/api';
import type {
  BattleListItem,
  BattleDetail,
  BattleRankingEntry,
  BattleStatus,
  CreateBattleRequest,
  MatchBattleRequest,
} from '../types';

interface BattleStore {
  battles: BattleListItem[];
  currentBattle: BattleDetail | null;
  rankings: BattleRankingEntry[];
  matchingStatus: 'idle' | 'queued' | 'matched';
  queueKey: string | null;

  fetchBattles: (status?: string) => Promise<void>;
  fetchBattle: (battleId: string) => Promise<void>;
  createBattle: (req: CreateBattleRequest) => Promise<string>;
  joinBattle: (battleId: string) => Promise<void>;
  enterMatchQueue: (req: MatchBattleRequest) => Promise<void>;
  cancelMatchQueue: () => Promise<void>;
  updateRankings: (rankings: BattleRankingEntry[]) => void;
  setBattleStatus: (status: BattleStatus) => void;
  setMatchedBattle: (battleId: string) => void;
}

export const useBattleStore = create<BattleStore>((set, get) => ({
  battles: [],
  currentBattle: null,
  rankings: [],
  matchingStatus: 'idle',
  queueKey: null,

  fetchBattles: async (status = 'WAITING') => {
    const response = await api.get('/api/battles', { params: { status, page: 0, size: 20 } });
    set({ battles: response.data.data?.content ?? [] });
  },

  fetchBattle: async (battleId) => {
    const response = await api.get(`/api/battles/${battleId}`);
    const battle: BattleDetail = response.data.data;
    set({
      currentBattle: battle,
      rankings: (battle.participants ?? []).map((p, i) => ({
        rank: i + 1,
        userId: p.userId,
        nickname: p.nickname,
        returnRate: p.returnRate,
        currentValuation: p.currentValuation,
      })),
    });
  },

  createBattle: async (req) => {
    const response = await api.post('/api/battles', req);
    const created = response.data.data;
    set((state) => ({ battles: [created, ...state.battles] }));
    return created.battleId as string;
  },

  joinBattle: async (battleId) => {
    const response = await api.post(`/api/battles/${battleId}/join`);
    const joined = response.data.data;
    set((state) => ({
      currentBattle: state.currentBattle
        ? {
            ...state.currentBattle,
            status: joined.status,
            currentParticipants: joined.currentParticipants,
            startTime: joined.startTime,
          }
        : state.currentBattle,
    }));
  },

  enterMatchQueue: async (req) => {
    const response = await api.post('/api/battles/match/enqueue', req);
    set({ matchingStatus: 'queued', queueKey: response.data.data?.queueKey });
  },

  cancelMatchQueue: async () => {
    const { queueKey } = get();
    if (!queueKey) return;
    await api.post('/api/battles/match/dequeue');
    set({ matchingStatus: 'idle', queueKey: null });
  },

  updateRankings: (rankings) => {
    set({ rankings });
  },

  setBattleStatus: (status) => {
    set((state) => ({
      currentBattle: state.currentBattle
        ? { ...state.currentBattle, status }
        : state.currentBattle,
    }));
  },

  setMatchedBattle: (battleId) => {
    set({ matchingStatus: 'matched', queueKey: battleId });
  },
}));
