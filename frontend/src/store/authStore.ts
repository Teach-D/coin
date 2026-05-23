import { create } from 'zustand';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  nickname: string | null;
  nicknameSet: boolean;
  setTokens: (accessToken: string, refreshToken: string) => void;
  setNickname: (nickname: string) => void;
  setNicknameSet: (value: boolean) => void;
  clearAuth: () => void;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: localStorage.getItem('accessToken'),
  refreshToken: localStorage.getItem('refreshToken'),
  nickname: localStorage.getItem('nickname'),
  nicknameSet: localStorage.getItem('nicknameSet') === 'true',
  setTokens: (accessToken, refreshToken) => {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    set({ accessToken, refreshToken });
  },
  setNickname: (nickname) => {
    localStorage.setItem('nickname', nickname);
    set({ nickname });
  },
  setNicknameSet: (value) => {
    localStorage.setItem('nicknameSet', String(value));
    set({ nicknameSet: value });
  },
  clearAuth: () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('nickname');
    localStorage.removeItem('nicknameSet');
    set({ accessToken: null, refreshToken: null, nickname: null, nicknameSet: false });
  },
  isAuthenticated: () => !!get().accessToken,
}));
