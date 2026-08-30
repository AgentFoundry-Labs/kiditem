'use client';

import type { ReactNode } from 'react';
import type { SourcingReadEnvelope } from '@kiditem/shared/sourcing';
import { AlertTriangle, Clock3, Loader2, type LucideIcon } from 'lucide-react';
import { friendlyError } from '@/lib/api-error';

export function SourcingReadState({
  envelope,
  isLoading,
  error,
  emptyLabel,
  children,
}: {
  envelope: SourcingReadEnvelope | undefined;
  isLoading: boolean;
  error: unknown;
  emptyLabel: string;
  children: ReactNode;
}) {
  if (isLoading) {
    return <ReadNotice icon={Loader2} className="animate-spin motion-reduce:animate-none" text="데이터를 불러오는 중…" />;
  }
  if (error) {
    return <ReadNotice icon={AlertTriangle} tone="error" text={friendlyError(error) ?? '데이터를 불러오지 못했습니다.'} />;
  }
  if (!envelope) {
    return <ReadNotice icon={Clock3} text={emptyLabel} />;
  }
  if (envelope.status === 'unavailable' || envelope.data === null) {
    const detail = envelope.error?.message?.trim();
    return (
      <ReadNotice
        icon={Clock3}
        tone="warning"
        text={`수집 결과를 사용할 수 없습니다.${detail ? ` ${detail}` : ''}`}
      />
    );
  }
  return (
    <>
      {envelope.status === 'collecting' || envelope.status === 'stale' ? (
        <ReadNotice
          icon={Clock3}
          tone="warning"
          text={
            envelope.status === 'collecting'
              ? '새 데이터를 수집하고 있습니다. 마지막으로 성공한 결과를 표시합니다.'
              : '최근 수집 결과를 표시합니다. 새로고침하면 최신 상태를 다시 확인합니다.'
          }
        />
      ) : null}
      {children}
    </>
  );
}

function ReadNotice({
  icon: Icon,
  text,
  tone = 'default',
  className,
}: {
  icon: LucideIcon;
  text: string;
  tone?: 'default' | 'warning' | 'error';
  className?: string;
}) {
  const color = tone === 'error'
    ? 'border-rose-200 bg-rose-50 text-rose-700'
    : tone === 'warning'
      ? 'border-amber-200 bg-amber-50 text-amber-800'
      : 'border-[var(--border)] bg-[var(--surface-sunken)] text-[var(--text-secondary)]';
  return (
    <p className={`mb-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${color}`}>
      <Icon size={14} className={className} aria-hidden="true" />
      {text}
    </p>
  );
}
