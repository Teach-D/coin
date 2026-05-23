import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import type { ApiResponse, UserProfileResponse } from '../types';

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  const setNickname = useAuthStore((s) => s.setNickname);

  return useMutation({
    mutationFn: async (nickname: string) => {
      const res = await api.patch<ApiResponse<UserProfileResponse>>('/api/users/me/nickname', { nickname });
      return res.data.data;
    },
    onSuccess: (data) => {
      setNickname(data.nickname);
      queryClient.invalidateQueries({ queryKey: ['user', 'profile'] });
    },
  });
}
