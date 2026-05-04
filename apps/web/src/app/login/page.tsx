'use client';

import { Suspense } from 'react';
import { Loader2, Lock, Mail } from 'lucide-react';
import { LoginBackground } from './components/LoginBackground';
import { LoginField } from './components/LoginField';
import { useLoginForm } from './hooks/useLoginForm';

function LoginForm() {
  const { email, setEmail, password, setPassword, remember, setRemember, loading, onSubmit } =
    useLoginForm();

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
        <LoginField
          id="email"
          label="이메일"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="you@example.com"
          autoComplete="email"
          Icon={Mail}
        />
        <LoginField
          id="password"
          label="비밀번호"
          type="password"
          value={password}
          onChange={setPassword}
          placeholder="••••••••"
          autoComplete="current-password"
          Icon={Lock}
        />
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
      <LoginBackground />
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
