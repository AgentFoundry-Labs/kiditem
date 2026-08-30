'use client';

import {
  useAuthContext,
  type AuthStatus,
} from '@/components/providers/AuthProvider';

export type { AuthStatus };

/** UI authentication is the `/api/auth/me` projection owned by AuthProvider. */
export function useAuth() {
  return useAuthContext();
}
