'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { sanitizeInternalRedirectPath } from '@/lib/auth-redirect';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

const REMEMBERED_EMAIL_KEY = 'kiditem.login.rememberedEmail';

export function useLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = sanitizeInternalRedirectPath(searchParams.get('next'));

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(REMEMBERED_EMAIL_KEY);
    if (saved) {
      setEmail(saved);
      setRemember(true);
    }
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (remember) localStorage.setItem(REMEMBERED_EMAIL_KEY, email);
      else localStorage.removeItem(REMEMBERED_EMAIL_KEY);
      // 로그인 직후 ReadinessModal 자동 재표시 trigger — 세션마다 한 번 점검.
      sessionStorage.removeItem('kiditem.readiness.dismissed');
      toast.success('로그인 성공');
      router.replace(next);
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : '로그인 실패';
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
