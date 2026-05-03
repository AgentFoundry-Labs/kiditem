'use client';

import { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'kiditem-theme';

const OPTIONS = [
  { value: 'light', label: '라이트', Icon: Sun },
  { value: 'dark', label: '다크', Icon: Moon },
  { value: 'system', label: '시스템', Icon: Monitor },
] as const;

type ThemeValue = (typeof OPTIONS)[number]['value'];

function resolveTheme(theme: ThemeValue): 'light' | 'dark' {
  if (theme !== 'system') return theme;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: ThemeValue) {
  const resolved = resolveTheme(theme);
  document.documentElement.classList.toggle('dark', resolved === 'dark');
  document.documentElement.style.colorScheme = resolved;
}

export default function ThemeToggle({ collapsed = false }: { collapsed?: boolean }) {
  const [theme, setTheme] = useState<ThemeValue>('system');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY) as ThemeValue | null;
    const initial = saved && OPTIONS.some((option) => option.value === saved) ? saved : 'system';
    setTheme(initial);
    applyTheme(initial);
    setMounted(true);

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      const current = (window.localStorage.getItem(STORAGE_KEY) as ThemeValue | null) ?? 'system';
      if (current === 'system') applyTheme('system');
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const selectTheme = (next: ThemeValue) => {
    setTheme(next);
    window.localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
  };

  return (
    <div
      className={cn(
        'inline-flex items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] p-0.5',
        collapsed ? 'flex-col gap-0.5' : 'gap-0.5',
        !mounted && 'opacity-0',
      )}
      role="group"
      aria-label="테마 선택"
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const isActive = theme === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => selectTheme(value)}
            aria-label={label}
            title={label}
            className={cn(
              'inline-flex h-6 w-6 items-center justify-center rounded-md transition-colors',
              isActive
                ? 'bg-[var(--primary-soft)] text-[var(--primary)]'
                : 'text-[var(--text-muted)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-secondary)]',
            )}
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        );
      })}
    </div>
  );
}
