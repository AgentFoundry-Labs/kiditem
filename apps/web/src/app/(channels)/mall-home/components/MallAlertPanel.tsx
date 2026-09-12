'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Archive,
  ArrowRight,
  Bell,
  ChevronDown,
  ChevronUp,
  Loader2,
  ShieldCheck,
  X,
} from 'lucide-react';
import type { PanelAlertItem } from '@kiditem/shared/panel';
import { PanelAlertRow } from '@/components/panel/PanelAlertRow';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { cn, formatNumber } from '@/lib/utils';
import {
  mallAlertState,
  mallKeyOfAlert,
  matchesAlertFilter,
  needsAttention,
  type DerivedMallAlert,
  type MallAlertFilter,
} from '../lib/mall-alerts';

const FILTERS: { key: MallAlertFilter; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'attention', label: '확인 필요' },
  { key: 'running', label: '진행 중' },
];

const EMPTY_TEXT: Record<MallAlertFilter, string> = {
  all: '표시할 몰 알림이 없습니다.',
  attention: '확인할 알림이 없습니다.',
  running: '진행 중인 몰 작업이 없습니다.',
};

/**
 * 쇼핑몰 알림판 — 쇼핑몰 홈 오른쪽 1/4.
 *
 * 넓은 화면에서는 대시보드 줄(지금 볼 것 네 칸 + 몰별 상태) 높이까지만 선다. 알림이 많아도
 * 줄을 늘리지 않도록 안쪽을 띄워 두고, 목록은 판 안에서 스크롤한다.
 *
 * 맨 위는 지금 상태 알림(저장하지 않는다), 그 아래는 서버 알림이다. 서버 알림 줄은 전역
 * 알림판과 같은 `PanelAlertRow` 라 정리 · 중단 · 할 일로 만들기 · 이동이 그대로 된다.
 * 몰 타일을 누르면 그 몰 알림만 남는다.
 *
 * 7일 넘게 멈춘 수집 알림은 확장에 세션이 없어 '작업 중단'도 안 되는 것들이라 확인
 * 필요에서 빼 맨 아래에 모으고, 사람이 확인한 뒤 한 번에 정리하게 한다.
 */
export function MallAlertPanel({
  alerts,
  derived,
  expired,
  onCloseExpired,
  closingExpired,
  ready,
  filter,
  onFilterChange,
  mall,
  onClearMall,
}: {
  alerts: readonly PanelAlertItem[];
  derived: readonly DerivedMallAlert[];
  /** 7일 넘게 멈춘 수집 알림. */
  expired: readonly PanelAlertItem[];
  onCloseExpired: (targets: readonly PanelAlertItem[]) => Promise<void>;
  closingExpired: boolean;
  /** 알림 스트림을 한 번이라도 받았는가. */
  ready: boolean;
  filter: MallAlertFilter;
  onFilterChange: (filter: MallAlertFilter) => void;
  mall: { key: string; name: string } | null;
  onClearMall: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [showExpired, setShowExpired] = useState(false);

  const inMall = (item: PanelAlertItem) => !mall || mallKeyOfAlert(item) === mall.key;
  const scopedAlerts = alerts.filter(inMall);
  const scopedExpired = expired.filter(inMall);
  const scopedDerived = mall ? derived.filter((item) => item.mallKeys.includes(mall.key)) : derived;
  const counts: Record<MallAlertFilter, number> = {
    all: scopedDerived.length + scopedAlerts.length,
    attention: scopedDerived.length + scopedAlerts.filter(needsAttention).length,
    running: scopedAlerts.filter((item) => mallAlertState(item) === 'running').length,
  };
  // 지금 상태 알림은 모두 사람이 볼 일이다. 진행 중 칸에는 서지 않는다.
  const shownDerived = filter === 'running' ? [] : scopedDerived;
  const shownAlerts = ready ? scopedAlerts.filter((item) => matchesAlertFilter(item, filter)) : [];
  const empty = ready && shownDerived.length === 0 && shownAlerts.length === 0;
  const showExpiredBlock = ready && filter !== 'running' && scopedExpired.length > 0;

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
                <li key={item.id}>
                  <PanelAlertRow item={item} />
                </li>
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

          {showExpiredBlock ? (
            <div className="border-t border-slate-100 bg-slate-50/70">
              <div className="flex items-start justify-between gap-2 px-4 py-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                    <Archive size={13} className="text-slate-400" aria-hidden />
                    7일 넘게 멈춘 수집 {formatNumber(scopedExpired.length)}건
                  </p>
                  <p className="mt-0.5 text-[11px] leading-5 text-slate-400">
                    확장은 수집 기록을 7일만 둡니다. 다시 움직일 수 없어 확인 필요에서 뺐습니다.
                  </p>
                  <button
                    type="button"
                    aria-expanded={showExpired}
                    onClick={() => setShowExpired((open) => !open)}
                    className="mt-1 inline-flex items-center gap-0.5 text-[11px] font-medium text-slate-500 hover:text-slate-700"
                  >
                    {showExpired ? '접기' : '펼쳐 보기'}
                    {showExpired ? <ChevronUp size={12} aria-hidden /> : <ChevronDown size={12} aria-hidden />}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setConfirmOpen(true)}
                  disabled={closingExpired}
                  className="flex-none rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  정리
                </button>
              </div>
              {showExpired ? (
                <ul className="border-t border-slate-100">
                  {scopedExpired.map((item) => (
                    <li key={item.id}>
                      <PanelAlertRow item={item} />
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>

        <p className="border-t border-slate-100 px-4 py-2.5 text-[11px] leading-5 text-slate-400">
          몰 작업 알림은 최근 24시간 것과 아직 끝나지 않은 것입니다. 로그인 정보 · 품절 후보 · 쿠팡
          발주확인은 지금 상태를 다시 센 것입니다.
        </p>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`멈춘 수집 알림 ${formatNumber(scopedExpired.length)}건을 정리할까요?`}
        description="확장이 수집 기록을 7일만 두어 이 알림들은 다시 움직일 수 없습니다. 취소로 닫고 알림판에서 뺍니다. 주문과 몰 데이터는 바뀌지 않습니다."
        confirmText="정리하기"
        cancelText="그대로 두기"
        isLoading={closingExpired}
        onConfirm={async () => {
          await onCloseExpired(scopedExpired);
          setConfirmOpen(false);
        }}
      />
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
