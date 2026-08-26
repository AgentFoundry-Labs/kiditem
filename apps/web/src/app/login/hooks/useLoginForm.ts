'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { sanitizeInternalRedirectPath } from '@/lib/auth-redirect';
import { apiClient } from '@/lib/api-client';
import { isApiError } from '@/lib/api-error';
import {
  AUTH_ME_QUERY_KEY,
  publishAuthChanged,
} from '@/lib/auth/browser-auth';
import { safeStorageGet, safeStorageRemove, safeStorageSet } from '@/lib/browser-storage';
import { LoginResponseSchema } from '@kiditem/shared/auth';

const REMEMBERED_EMAIL_KEY = 'kiditem.login.rememberedEmail';

export function useLoginForm() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = sanitizeInternalRedirectPath(searchParams.get('next'));
  const reason = searchParams.get('reason');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const saved = safeStorageGet('local', REMEMBERED_EMAIL_KEY);
    if (saved) {
      setEmail(saved);
      setRemember(true);
    }
  }, []);

  // AuthProvider 가 만료로 인한 redirect 일 때 `?reason=session_expired` 를 붙인다.
  // 사용자가 어떤 액션을 하다가 갑자기 로그인 화면을 마주쳤는지 안내.
  useEffect(() => {
    if (reason === 'session_expired') {
      toast.info('세션이 만료되어 다시 로그인이 필요합니다.', { duration: 5000 });
    }
  }, [reason]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    let cookieIssued = false;
    try {
      const login = LoginResponseSchema.parse(
        await apiClient.post<unknown>('/api/auth/login', { email, password }),
      );
      cookieIssued = true;
      if (!login.user.organizationId) {
        throw new Error('조직에 속해있지 않습니다. 관리자에게 문의해주세요.');
      }
      if (remember) safeStorageSet('local', REMEMBERED_EMAIL_KEY, email);
      else safeStorageRemove('local', REMEMBERED_EMAIL_KEY);
      // 로그인 직후 ReadinessModal 자동 재표시 trigger — 세션마다 한 번 점검.
      safeStorageRemove('session', 'kiditem.readiness.dismissed');
      queryClient.setQueryData(AUTH_ME_QUERY_KEY, login.user);
      publishAuthChanged('login');
      toast.success('로그인 성공');
      router.replace(next);
      router.refresh();
    } catch (err) {
      if (cookieIssued) {
        await apiClient.post('/api/auth/logout').catch(() => undefined);
        queryClient.removeQueries({ queryKey: AUTH_ME_QUERY_KEY });
      }
      const message = isApiError(err) && err.status === 401
        ? '이메일 또는 비밀번호가 올바르지 않습니다.'
        : err instanceof Error ? err.message : '로그인 실패';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return {
    email,
    setEmail,
    password,
    setPassword,
    remember,
    setRemember,
    loading,
    onSubmit,
  };
}
