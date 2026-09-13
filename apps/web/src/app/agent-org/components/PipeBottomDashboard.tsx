'use client';

import Link from 'next/link';
import {
  BarChart3,
  BellRing,
  CircleAlert,
  DollarSign,
  Megaphone,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import type { AlertItem } from '@kiditem/shared/alerts';
import type { DashboardAdSummary, DashboardSalesSummary } from '@kiditem/shared/dashboard';
import { cn, formatKRW, formatNumber, timeAgo } from '@/lib/utils';
import { countAgentHealth, type PipeAgentHealth, type PipeAgentSummary } from '../lib/pipe-agents';

export interface PipeBusiness {
  sales: DashboardSalesSummary | null;
  ad: DashboardAdSummary | null;
  salesFailed: boolean;
  adFailed: boolean;
}

/** 억 · 만 단위로 줄인 원화. 모르면 '—'. */
export function compactKrw(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 100_000_000) return `${(value / 100_000_000).toFixed(1)}억`;
  if (abs >= 10_000) return `${formatNumber(Math.round(value / 10_000))}만`;
  return `${formatKRW(value)}원`;
}

const HEALTH_ORDER: readonly { key: PipeAgentHealth; label: string; dot: string; text: string }[] = [
  { key: 'working', label: '진행 중', dot: 'bg-blue-400', text: 'text-blue-300' },
  { key: 'attention', label: '확인 필요', dot: 'bg-violet-400', text: 'text-violet-300' },
  { key: 'ok', label: '정상', dot: 'bg-emerald-400', text: 'text-emerald-400' },
  { key: 'unknown', label: '모름', dot: 'bg-slate-600', text: 'text-slate-400' },
];

const SEVERITY_TONE: Readonly<Record<string, string>> = {
  critical: '#f87171',
  error: '#f87171',
  warning: '#fbbf24',
  info: '#22d3ee',
};

function ChangeBadge({ value, suffix = '%' }: { value: number | null | undefined; suffix?: string }) {
  if (value == null || !Number.isFinite(value)) return null;
  return (
    <span
      className={cn(
        'shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold tabular-nums',
        value >= 0 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400',
      )}
    >
      {value >= 0 ? '+' : ''}
      {value.toFixed(1)}
      {suffix}
    </span>
  );
}

function MetricTile({
  icon: Icon,
  tone,
  label,
  value,
  note,
  change,
  className,
}: {
  icon: LucideIcon;
  tone: string;
  label: string;
  value: string;
  note?: string | null;
  change?: number | null;
  className?: string;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col justify-between rounded-2xl border border-white/10 bg-[#0d1321] p-4 max-md:min-h-[108px]', className)}>
      <div className="flex items-center gap-1.5">
        <Icon size={13} className={tone} aria-hidden />
        <span className="text-[11px] text-slate-500">{label}</span>
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[20px] font-bold leading-tight tabular-nums">{value}</div>
          {note ? <div className="truncate text-[9.5px] text-slate-600">{note}</div> : null}
        </div>
        {change !== undefined ? <ChangeBadge value={change} /> : null}
      </div>
    </div>
  );
}

/**
 * 하단 대시보드 — 에이전트 상태 막대, 이번 달 매출 · 영업이익 · ROAS · CTR, 열린 알림.
 *
 * 매출 · 광고 숫자는 대시보드 화면과 같은 API 를 같은 캐시로 읽는다. 못 불러오면 0 이 아니라
 * '—' 로 둔다.
 */
export function PipeBottomDashboard({
  agents,
  stageCount,
  connection,
  business,
  openAlerts,
  now,
}: {
  agents: readonly PipeAgentSummary[];
  stageCount: number;
  connection: string;
  business: PipeBusiness | undefined;
  /** 아직 열린 원천 실패 알림. */
  openAlerts: readonly AlertItem[];
  now: number;
}) {
  const counts = countAgentHealth(agents);
  const total = agents.length;
  const sales = business?.sales?.monthly ?? null;
  const ad = business?.ad?.monthly ?? null;
  const period = business?.sales?.effectivePeriod;
  const periodNote = period ? `${period.label}${period.shifted ? ' · 최근 데이터 달' : ''}` : null;
  const missing = (failed: boolean | undefined) => (failed ? '불러오지 못함' : '—');

  return (
    <section
      aria-label="운영 요약"
      className="grid h-[228px] shrink-0 grid-cols-12 grid-rows-2 gap-3 px-5 py-4 max-md:h-auto max-md:grid-cols-2 max-md:grid-rows-none max-md:gap-2 max-md:px-3 max-md:py-3"
    >
      <section className="col-span-3 row-span-2 flex flex-col rounded-2xl border border-white/10 bg-[#0d1321] p-4 max-md:col-span-2 max-md:row-span-1">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-[13px] font-bold text-slate-300">Agent Org</h2>
          <span className={cn('text-[10px]', connection === 'connected' ? 'text-emerald-400' : 'text-slate-600')}>
            {connection === 'connected' ? '● 실시간' : '실시간 끊김'}
          </span>
        </div>
        <div className="text-[30px] font-bold leading-tight tabular-nums">{formatNumber(total)}</div>
        <div className="mb-3 flex items-center gap-2 text-[11px] text-slate-500">
          <span>Agents</span>
          <span className="h-1 w-1 rounded-full bg-slate-700" aria-hidden />
          <span>{formatNumber(stageCount)}단계</span>
        </div>
        <div className="mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-500">
          {HEALTH_ORDER.map((entry) => (
            <span key={entry.key} className="flex items-center gap-1.5">
              <span className={cn('h-2 w-2 rounded-full', entry.dot)} aria-hidden />
              {entry.label}
            </span>
          ))}
        </div>
        <div className="mb-3 flex h-2 overflow-hidden rounded-full bg-white/5" aria-hidden>
          {total > 0
            ? HEALTH_ORDER.map((entry) => (
                <div key={entry.key} className={cn('h-full', entry.dot)} style={{ width: `${(counts[entry.key] / total) * 100}%` }} />
              ))
            : null}
        </div>
        <dl className="mt-auto grid grid-cols-4 gap-1 text-center">
          {HEALTH_ORDER.map((entry) => (
            <div key={entry.key}>
              <dd className={cn('text-[15px] font-bold tabular-nums', entry.text)}>{counts[entry.key]}</dd>
              <dt className="text-[9px] text-slate-600">{entry.label}</dt>
            </div>
          ))}
        </dl>
      </section>

      <MetricTile
        icon={DollarSign}
        tone="text-cyan-400"
        label="월 매출"
        value={sales ? compactKrw(sales.revenue) : missing(business?.salesFailed)}
        note={periodNote}
        change={sales ? sales.revenueChange : null}
        className="col-span-2 max-md:col-span-1"
      />
      <MetricTile
        icon={BarChart3}
        tone="text-emerald-400"
        label="영업이익"
        value={sales ? compactKrw(sales.profit) : missing(business?.salesFailed)}
        note={sales && sales.prevProfit != null ? `지난달 ${compactKrw(sales.prevProfit)}` : null}
        change={sales ? sales.profitChange : null}
        className="col-span-2 max-md:col-span-1"
      />

      <section className="col-span-5 row-span-2 flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0d1321] p-4 max-md:col-span-2 max-md:row-span-1 max-md:min-h-[180px]">
        <div className="mb-3 flex shrink-0 items-center gap-2">
          <h2 className="text-[13px] font-bold text-slate-300">열린 알림</h2>
          <span
            className={cn(
              'rounded-md px-2 py-0.5 text-[9px] font-semibold',
              connection === 'connected' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-500/15 text-slate-500',
            )}
          >
            {connection === 'connected' ? '10초마다 확인' : '확인 안 됨'}
          </span>
          <span className="ml-auto text-[10px] text-slate-600">{formatNumber(openAlerts.length)}건</span>
        </div>
        <ul className="flex-1 space-y-1.5 overflow-y-auto pr-1">
          {openAlerts.length > 0 ? (
            openAlerts.map((alert) => {
              const color = SEVERITY_TONE[alert.severity] ?? '#94a3b8';
              const body = (
                <div className="flex items-start gap-2.5">
                  <CircleAlert size={14} className="mt-0.5 shrink-0" style={{ color }} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] font-medium text-slate-300">{alert.title}</div>
                    {alert.message ? <div className="mt-0.5 truncate text-[10px] text-slate-500">{alert.message}</div> : null}
                    <div className="mt-1.5 flex items-center gap-2">
                      <span className="rounded-sm px-1.5 py-0.5 text-[9px] font-semibold" style={{ background: `${color}1f`, color }}>
                        {alert.isRead ? '읽음' : '새 알림'}
                      </span>
                      <span className="text-[9px] text-slate-600">{timeAgo(new Date(alert.updatedAt), new Date(now))}</span>
                    </div>
                  </div>
                </div>
              );
              return (
                <li key={alert.id} className="rounded-lg border border-white/5 bg-white/[0.01] p-2.5">
                  {alert.href ? (
                    <Link href={alert.href} className="block focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400">
                      {body}
                    </Link>
                  ) : (
                    body
                  )}
                </li>
              );
            })
          ) : (
            <li className="flex h-full flex-col items-center justify-center gap-2 py-6 text-slate-600">
              <BellRing size={22} className="opacity-40" aria-hidden />
              <p className="text-[11px]">열린 알림이 없습니다</p>
              <p className="text-[10px] text-slate-700">수집이 끝내 실패하면 여기에 올라오고, 다시 성공하면 닫힙니다</p>
            </li>
          )}
        </ul>
      </section>

      <MetricTile
        icon={TrendingUp}
        tone="text-amber-400"
        label="ROAS"
        value={ad && ad.roas != null ? `${ad.roas.toFixed(0)}%` : missing(business?.adFailed)}
        note={ad && ad.totalAdSpend != null ? `광고비 ${compactKrw(ad.totalAdSpend)}` : null}
        className="col-span-2 col-start-4 max-md:col-span-1 max-md:col-start-auto"
      />
      <MetricTile
        icon={Megaphone}
        tone="text-violet-400"
        label="CTR"
        value={ad && ad.ctr != null ? `${ad.ctr.toFixed(2)}%` : missing(business?.adFailed)}
        note={sales && sales.adRate != null ? `광고 비중 ${sales.adRate.toFixed(1)}%` : null}
        className="col-span-2 max-md:col-span-1"
      />
    </section>
  );
}
