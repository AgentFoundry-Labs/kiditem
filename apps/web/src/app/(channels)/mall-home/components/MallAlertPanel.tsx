'use client';

import Link from 'next/link';
import { toast } from 'sonner';
import { AlertTriangle, ArrowRight, Bell, CheckCircle2, CircleAlert, Loader2, ShieldCheck, X } from 'lucide-react';
import type { AlertItem } from '@kiditem/shared/alerts';
import { useDismissAlert } from '@/lib/alerts-api';
import { cn, formatNumber, timeAgo } from '@/lib/utils';
import {
  alertTime,
  mallKeyOfAlert,
  matchesAlertFilter,
  needsAttention,
  statusWord,
  type DerivedMallAlert,
  type MallAlertFilter,
} from '../lib/mall-alerts';

const FILTERS: { key: MallAlertFilter; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'attention', label: '확인 필요' },
];

const EMPTY_TEXT: Record<MallAlertFilter, string> = {
  all: '표시할 몰 알림이 없습니다.',
  attention: '확인할 알림이 없습니다.',
};

/**
 * 쇼핑몰 알림판 — 쇼핑몰 홈 오른쪽 1/4.
 *
 * 넓은 화면에서는 대시보드 줄(지금 볼 것 네 칸 + 몰별 상태) 높이까지만 선다. 알림이 많아도
 * 줄을 늘리지 않도록 안쪽을 띄워 두고, 목록은 판 안에서 스크롤한다.
 *
 * 맨 위는 지금 상태 알림(저장하지 않는다), 그 아래는 원천 실패 알림이다. 알림 줄은 전역
 * 알림과 같은 규칙이라 열린 알림은 닫을 수 있고, 원천이 다시 성공하면 저절로 닫힌다.
 * 몰 타일을 누르면 그 몰 알림만 남는다.
 */
export function MallAlertPanel({
  alerts,
  derived,
  ready,
  filter,
  onFilterChange,
  mall,
  onClearMall,
}: {
  alerts: readonly AlertItem[];
  derived: readonly DerivedMallAlert[];
  /** 알림을 한 번이라도 받아 왔는가(실패 포함). */
  ready: boolean;
  filter: MallAlertFilter;
  onFilterChange: (filter: MallAlertFilter) => void;
  mall: { key: string; name: string } | null;
  onClearMall: () => void;
}) {
  const inMall = (item: AlertItem) => !mall || mallKeyOfAlert(item) === mall.key;
  const scopedAlerts = alerts.filter(inMall);
  const scopedDerived = mall ? derived.filter((item) => item.mallKeys.includes(mall.key)) : derived;
  const counts: Record<MallAlertFilter, number> = {
    all: scopedDerived.length + scopedAlerts.length,
    attention: scopedDerived.length + scopedAlerts.filter(needsAttention).length,
  };
  // 지금 상태 알림은 모두 사람이 볼 일이다.
  const shownDerived = scopedDerived;
  const shownAlerts = ready ? scopedAlerts.filter((item) => matchesAlertFilter(item, filter)) : [];
  const empty = ready && shownDerived.length === 0 && shownAlerts.length === 0;

  return (
    <aside
      id="mall-alerts"
      aria-label="쇼핑몰 알림"
      className="relative order-first min-w-0 scroll-mt-6 xl:order-none xl:col-span-1 xl:min-h-[24rem]"
    >
      <div className="flex flex-col rounded-xl border border-slate-200 bg-white xl:absolute xl:inset-0">
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
            <Bell size={15} className="text-primary" aria-hidden />
            쇼핑몰 알림
          </h2>
          {counts.attention > 0 ? (
            <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-red-700">
              확인 {formatNumber(counts.attention)}
            </span>
          ) : null}
        </div>

        <div className="space-y-2 px-4 pt-3">
          <div role="group" aria-label="알림 거르기" className="flex items-center gap-0.5 rounded-lg bg-slate-100 p-0.5">
            {FILTERS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                aria-pressed={filter === key}
                onClick={() => onFilterChange(key)}
                className={cn(
                  'flex-1 whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium transition',
                  filter === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700',
                )}
              >
                {label} <span className="tabular-nums">{formatNumber(counts[key])}</span>
              </button>
            ))}
          </div>
          {mall ? (
            <button
              type="button"
              onClick={onClearMall}
              className="flex w-full items-center justify-between gap-2 rounded-lg bg-primary-soft px-2.5 py-1.5 text-left text-xs text-primary hover:bg-primary-soft/70"
            >
              <span className="truncate font-medium">{mall.name} 알림만 보는 중</span>
              <span className="inline-flex flex-none items-center gap-0.5">
                해제
                <X size={12} aria-hidden />
              </span>
            </button>
          ) : null}
        </div>

        <div
          role="log"
          aria-live="polite"
          className="mt-2 min-h-[12rem] max-h-[28rem] overflow-y-auto xl:max-h-none xl:min-h-0 xl:flex-1"
        >
          {shownDerived.length > 0 || shownAlerts.length > 0 ? (
            <ul>
              {shownDerived.map((item) => (
                <DerivedAlertRow key={item.id} alert={item} />
              ))}
              {shownAlerts.map((item) => (
                <SourceAlertRow key={item.id} alert={item} />
              ))}
            </ul>
          ) : null}
          {!ready ? (
            <p className="flex items-center justify-center gap-1.5 px-4 py-8 text-xs text-slate-400">
              <Loader2 size={13} className="animate-spin" aria-hidden />
              몰 작업 알림을 불러오는 중
            </p>
          ) : empty ? (
            <div className="px-4 py-10 text-center">
              <ShieldCheck size={24} className="mx-auto mb-2 text-emerald-500" aria-hidden />
              <p className="text-xs text-slate-400">{EMPTY_TEXT[filter]}</p>
            </div>
          ) : null}

        </div>

        <p className="border-t border-slate-100 px-4 py-2.5 text-[11px] leading-5 text-slate-400">
          몰 작업 알림은 원천이 끝내 실패하면 열리고 다시 성공하면 닫힙니다. 로그인 정보 · 품절
          후보 · 쿠팡 발주확인은 지금 상태를 다시 센 것입니다.
        </p>
      </div>

    </aside>
  );
}

/** 지금 상태 알림 한 줄. 서버 알림 줄과 같은 모양이고, 해결하러 갈 화면을 붙인다. */
function DerivedAlertRow({ alert }: { alert: DerivedMallAlert }) {
  return (
    <li className="flex items-start gap-2.5 border-b border-slate-50 px-4 py-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-amber-50 text-amber-500">
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm font-medium text-slate-900">{alert.title}</span>
          <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
            지금 상태
          </span>
        </div>
        <p className="mt-0.5 text-xs leading-5 text-slate-500">{alert.message}</p>
        <Link
          href={alert.href}
          className="mt-1 inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline"
        >
          {alert.hrefLabel}
          <ArrowRight size={12} aria-hidden />
        </Link>
      </div>
    </li>
  );
}

/** 원천 실패 알림 한 줄 — 전역 알림과 같은 모양. 열린 알림은 닫을 수 있다. */
function SourceAlertRow({ alert }: { alert: AlertItem }) {
  const dismiss = useDismissAlert();
  const open = alert.status === 'OPEN';
  const body = (
    <>
      {open ? (
        <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden />
      ) : (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium text-slate-900">{alert.title}</span>
          {!alert.isRead ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" aria-label="읽지 않음" /> : null}
        </div>
        {alert.message ? <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-slate-500">{alert.message}</p> : null}
        <p className={cn('mt-0.5 text-[11px]', open ? 'text-amber-600' : 'text-emerald-600')}>
          {statusWord(alert)} · {timeAgo(new Date(alertTime(alert)))}
        </p>
      </div>
    </>
  );
  return (
    <li className="group flex items-start gap-2.5 border-b border-slate-50 px-4 py-3">
      {alert.href ? (
        <Link href={alert.href} className="flex min-w-0 flex-1 items-start gap-2.5 hover:underline">
          {body}
        </Link>
      ) : (
        <div className="flex min-w-0 flex-1 items-start gap-2.5">{body}</div>
      )}
      {open ? (
        <button
          type="button"
          aria-label={`${alert.title} 알림 닫기`}
          title="알림 닫기"
          disabled={dismiss.isPending}
          onClick={() =>
            dismiss.mutate(alert.id, {
              onError: () => toast.error('알림을 닫지 못했습니다.'),
            })
          }
          className="shrink-0 rounded border border-slate-200 p-1 text-slate-400 transition hover:bg-slate-50 hover:text-slate-600 disabled:cursor-wait disabled:opacity-60"
        >
          <X className="h-3 w-3" aria-hidden />
        </button>
      ) : null}
    </li>
  );
}
