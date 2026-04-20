'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Sun, Moon, Monitor } from 'lucide-react';
import { cn } from '@/lib/utils';

const OPTIONS = [
  { value: 'light', label: '라이트', Icon: Sun },
  { value: 'dark', label: '다크', Icon: Moon },
  { value: 'system', label: '시스템', Icon: Monitor },
] as const;

export default function ThemeToggle({ collapsed = false }: { collapsed?: boolean }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div
        className={cn(
          'inline-flex items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] p-0.5',
          collapsed ? 'flex-col gap-0.5' : 'gap-0.5'
        )}
        aria-hidden
      >
        {OPTIONS.map(({ value, Icon }) => (
          <span key={value} className="h-6 w-6 opacity-0">
            <Icon className="h-3.5 w-3.5" />
          </span>
        ))}
      </div>
    );
  }

  const active = (theme ?? 'system') as (typeof OPTIONS)[number]['value'];

  return (
    <div
      className={cn(
        'inline-flex items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] p-0.5',
        collapsed ? 'flex-col gap-0.5' : 'gap-0.5'
      )}
      role="group"
      aria-label="테마 선택"
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const isActive = active === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => setTheme(value)}
            aria-label={label}
            title={label}
            className={cn(
              'inline-flex h-6 w-6 items-center justify-center rounded-md transition-colors',
              isActive
                ? 'bg-[var(--primary-soft)] text-[var(--primary)]'
                : 'text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-secondary)]'
            )}
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        );
      })}
    </div>
  );
}
