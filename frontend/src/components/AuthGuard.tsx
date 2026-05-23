import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

interface Props {
  children: React.ReactNode;
}

export function AuthGuard({ children }: Props) {
  const { accessToken, nicknameSet } = useAuthStore();
  const location = useLocation();

  if (!accessToken) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!nicknameSet) {
    return <Navigate to="/nickname-setup" replace />;
  }

  return <>{children}</>;
}
