import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuthStore } from '../store/authStore';

export function useDeleteAccount() {
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const navigate = useNavigate();

  return useMutation({
    mutationFn: async () => {
      await api.delete('/api/users/me');
    },
    onSuccess: () => {
      clearAuth();
      navigate('/login', { replace: true });
    },
  });
}
