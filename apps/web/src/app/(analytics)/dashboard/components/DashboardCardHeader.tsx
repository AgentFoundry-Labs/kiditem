import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowUpRight, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * 대시보드 카드 머리 — 모든 칸이 한 모양이다: 40px, 흰 바탕, `border-slate-100`.
 *
 * 왼쪽에 옅은 색 칸 위의 아이콘과 제목, 오른쪽에 그 칸을 다루는 화면으로 가는 길. 아이콘
 * 색은 칸의 성격(문제는 붉게, AI 는 보라)을 한눈에 가르는 데만 쓰고 바탕을 칠하지 않는다.
 */

export type DashboardTone = 'violet' | 'red' | 'orange' | 'amber' | 'emerald' | 'sky' | 'rose' | 'slate';

export const DASHBOARD_TONE: Record<DashboardTone, { badge: string; icon: string; text: string }> = {
  violet: { badge: 'bg-violet-50 ring-violet-100', icon: 'text-violet-600', text: 'text-violet-700' },
  red: { badge: 'bg-red-50 ring-red-100', icon: 'text-red-600', text: 'text-red-600' },
  orange: { badge: 'bg-orange-50 ring-orange-100', icon: 'text-orange-600', text: 'text-orange-600' },
  amber: { badge: 'bg-amber-50 ring-amber-100', icon: 'text-amber-600', text: 'text-amber-700' },
  emerald: { badge: 'bg-emerald-50 ring-emerald-100', icon: 'text-emerald-600', text: 'text-emerald-700' },
  sky: { badge: 'bg-sky-50 ring-sky-100', icon: 'text-sky-600', text: 'text-sky-700' },
  rose: { badge: 'bg-rose-50 ring-rose-100', icon: 'text-rose-600', text: 'text-rose-600' },
  slate: { badge: 'bg-slate-100 ring-slate-200/70', icon: 'text-slate-600', text: 'text-slate-900' },
};

export function DashboardIconBadge({
  icon: Icon,
  tone,
  size = 'sm',
}: {
  icon: LucideIcon;
  tone: DashboardTone;
  size?: 'sm' | 'md';
}) {
  return (
    <span
      className={cn(
        'inline-flex flex-none items-center justify-center rounded-md ring-1 ring-inset',
        size === 'sm' ? 'h-6 w-6' : 'h-8 w-8 rounded-lg',
        DASHBOARD_TONE[tone].badge,
      )}
      aria-hidden
    >
      <Icon size={size === 'sm' ? 13 : 16} className={DASHBOARD_TONE[tone].icon} />
    </span>
  );
}
export function DashboardCardHeader({
  icon,
  tone = 'slate',
  title,
  meta,
  children,
  className,
  titleHint,
}: {
  icon?: LucideIcon;
  tone?: DashboardTone;
  title: ReactNode;
  /** 제목 옆의 작은 글(기간 · 건수). */
  meta?: ReactNode;
  /** 오른쪽 — 그 칸을 다루는 화면으로 가는 길이나 작은 조작. */
  children?: ReactNode;
  /** 칸 성격에 따라 바탕 · 밑선을 바꾼다(AI 칸은 보라). */
  className?: string;
  /** 제목에 얹는 도움말 — 무엇으로 낸 값인지. */
  titleHint?: string;
}) {
  return (
    <header className={cn('flex h-10 flex-none items-center justify-between gap-2 border-b border-slate-100 bg-white px-4', className)}>
      <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-800" title={titleHint}>
        {icon ? <DashboardIconBadge icon={icon} tone={tone} /> : null}
        <span className="flex-none">{title}</span>
        {meta}
      </h2>
      {children ? <div className="flex flex-none items-center gap-1.5">{children}</div> : null}
    </header>
  );
}

export function DashboardHeaderLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-0.5 rounded text-xs font-medium text-slate-500 transition-colors hover:text-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
    >
      {children}
      <ArrowUpRight size={12} aria-hidden />
    </Link>
  );
}
