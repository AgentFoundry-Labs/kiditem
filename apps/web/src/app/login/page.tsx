'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Mail, Lock, Loader2 } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

const REMEMBERED_EMAIL_KEY = 'kiditem.login.rememberedEmail';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') ?? '/';

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

  return (
    <form
      onSubmit={onSubmit}
      className="relative w-full max-w-sm rounded-2xl border border-white/40 dark:border-white/10 bg-white/50 dark:bg-[var(--surface)]/60 p-8 shadow-[0_8px_32px_rgba(31,38,135,0.2)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.4)] backdrop-blur-2xl"
    >
      <div className="mb-8">
        <div className="inline-flex items-center gap-2.5">
          <span className="inline-block h-3 w-3 rounded-full bg-gradient-to-br from-blue-500 to-purple-500" />
          <span className="text-3xl font-bold tracking-tight bg-gradient-to-br from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent">
            Kiditem
          </span>
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="email" className="block text-xs font-medium text-[var(--text-secondary)]">
            이메일
          </label>
          <div className="relative">
            <Mail
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
              strokeWidth={1.8}
            />
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-xl border border-white/60 dark:border-[var(--border)] bg-white/60 dark:bg-[var(--surface-sunken)]/80 py-2.5 pl-9 pr-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] shadow-inner backdrop-blur-xl transition focus:border-blue-400/60 focus:bg-white/80 dark:focus:bg-[var(--surface)]/80 focus:outline-none focus:ring-2 focus:ring-blue-400/30"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="password" className="block text-xs font-medium text-[var(--text-secondary)]">
            비밀번호
          </label>
          <div className="relative">
            <Lock
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
              strokeWidth={1.8}
            />
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-xl border border-white/60 dark:border-[var(--border)] bg-white/60 dark:bg-[var(--surface-sunken)]/80 py-2.5 pl-9 pr-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] shadow-inner backdrop-blur-xl transition focus:border-blue-400/60 focus:bg-white/80 dark:focus:bg-[var(--surface)]/80 focus:outline-none focus:ring-2 focus:ring-blue-400/30"
            />
          </div>
        </div>
      </div>

      <label className="mt-4 flex cursor-pointer items-center gap-2 text-xs text-[var(--text-secondary)] select-none">
        <input
          type="checkbox"
          checked={remember}
          onChange={(e) => setRemember(e.target.checked)}
          className="h-3.5 w-3.5 rounded border-[var(--border-strong)] text-blue-600 focus:ring-2 focus:ring-blue-400/30"
        />
        이메일 기억하기
      </label>

      <button
        type="submit"
        disabled={loading}
        className="group mt-8 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-blue-600 via-blue-600 to-purple-600 py-2.5 text-sm font-medium text-white shadow-lg shadow-blue-500/30 transition hover:shadow-xl hover:shadow-blue-500/40 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            로그인 중…
          </>
        ) : (
          '로그인'
        )}
      </button>

      <p className="mt-6 text-center text-xs text-[var(--text-muted)]">
        KidItem Workflow AutoSystem
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-slate-100 via-blue-50 to-purple-100 dark:from-[#0b0f17] dark:via-[#0f172a] dark:to-[#1e1b4b] px-4">
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-gradient-to-br from-blue-400 to-cyan-400 opacity-40 dark:opacity-15 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 top-1/3 h-[28rem] w-[28rem] rounded-full bg-gradient-to-br from-purple-400 to-pink-400 opacity-40 dark:opacity-15 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 left-1/3 h-80 w-80 rounded-full bg-gradient-to-br from-indigo-400 to-blue-400 opacity-30 dark:opacity-10 blur-3xl" />

      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </div>
  );
}

