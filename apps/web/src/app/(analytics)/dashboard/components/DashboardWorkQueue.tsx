'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Bot, Clock, ListChecks, Package, ShieldAlert, Store, TrendingDown, type LucideIcon } from 'lucide-react';
import { useAgentOrg } from '@/hooks/use-agent-org';
import { cn, timeAgo } from '@/lib/utils';
import { KRW_RATE_NOTE, formatKrwApprox, formatUsd, monthToDate, useAiUsage } from '../../_shared/ai-usage';
import { buildWorkQueue, type WorkQueueCounts, type WorkQueueItem } from '../lib/work-queue';
import { DASHBOARD_TONE, DashboardCardHeader, DashboardIconBadge, type DashboardTone } from './DashboardCardHeader';
import type { DashboardFindings } from '@kiditem/shared/dashboard';

/**
 * 지금 할 일 — 두 칸으로 나뉜다(사장님 2026-09-20).
 *
 * `DashboardAgentWork` 는 수만 말한다: 막힌 일 · 돈 새는 일 · 내 결정 대기. 맨 윗줄 카드들 옆에
 * 서서 "에이전트 쪽은 지금 어떤가"를 한눈에 준다.
 * `DashboardUrgentQueue` 는 그 일 자체를 긴급 칸 아래 목록으로 세운다 — 줄마다 무엇을 ·
 * **왜(숫자)** · 누르면 끝나는 화면.
 *
 * 그리는 규칙은 다른 칸과 같다(DESIGN.md): 바탕은 흰색, 색은 아이콘 칸과 작은 배지에만.
 * 값은 전부 이미 발표된 읽기에서 온다 — 긴급은 Agent Org 받은함, 나머지는
 * `/api/dashboard/findings`. 이 화면은 줄로 세우기만 한다(`lib/work-queue`).
 */

/** 줄 앞 배지가 가리키는 종류 — 아이콘과 색은 여기 한 곳에서만 정한다. */
const BADGE_LOOK: Record<string, { icon: LucideIcon; tone: DashboardTone }> = {
  막힘: { icon: ShieldAlert, tone: 'red' },
  재고: { icon: Package, tone: 'amber' },
  매출: { icon: TrendingDown, tone: 'rose' },
  쇼핑몰: { icon: Store, tone: 'violet' },
};

function useQueue(findings: DashboardFindings | undefined, limit: number) {
  const { snapshot, now } = useAgentOrg();
  const queue = useMemo(
    () => buildWorkQueue({ inbox: snapshot.inbox, findings, limit }),
    [snapshot.inbox, findings, limit],
  );
  const running = snapshot.stages.filter((stage) => stage.state === 'running').length;
  return { queue, running, now };
}

/**
 * AI 영역의 머리 — 에이전트 쪽 수를 한 줄로(사장님 2026-09-20).
 *
 * 막힌 일 · 돈 새는 일 · 내 결정, 그리고 이번 달 AI 비용 합계. 에이전트마다의 비용 내역은
 * Agent Org 가 보여 준다. 이 줄은 세지 않는다 — `lib/work-queue` 가 센 것을 그린다.
 */
export function DashboardAgentSummary({ findings, findingsError = false, findingsLoading = false }: {
  findings: DashboardFindings | undefined; findingsError?: boolean; findingsLoading?: boolean;
}) {
  const ready = Boolean(findings) && !findingsError && !findingsLoading;
  const moneyMeasured = ready && findings?.reorderSuggestions !== null && findings?.salesDecline.count !== null;
  const { queue, running } = useQueue(ready ? findings : undefined, 0);
  // 이번 달 AI 비용. 세지 않고 `/api/ai/usage` 가 낸 합계를 그대로 적는다 — 에이전트마다의
  // 내역은 Agent Org 가 보여 준다. 달러가 원값이고 원화는 어림이라 hover 로만 말한다.
  const usage = useAiUsage(monthToDate());
  const total = usage.data?.totals;

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-0.5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-violet-600 text-white" aria-hidden>
          <Bot size={15} />
        </span>
        AI 에이전트
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500">
          <span className={cn('inline-flex h-1.5 w-1.5 rounded-full', running > 0 ? 'bg-emerald-500' : 'bg-slate-300')} aria-hidden />
          지금 도는 {running}
        </span>
      </h2>
      <div className="flex flex-wrap items-center gap-1.5">
        <SummaryChip label="막힌 일" value={queue.counts.blocked} tone="red" />
        <SummaryChip label="돈 새는 일" value={moneyMeasured ? queue.counts.money : null} tone="amber" title="선정된 발주 제안(최대 5개)과 매출 하락 묶음 수입니다. 전체 발주 대상은 재고 카드에서 확인하세요." />
        <SummaryChip label="내 결정" value={ready ? queue.counts.decision : null} tone="violet" />
        <span
          className="inline-flex h-7 items-center gap-1 rounded-lg bg-white px-2.5 text-[11px] font-semibold text-slate-600 ring-1 ring-inset ring-slate-200"
          title={total ? `${formatKrwApprox(total.costMicroUsd)} · ${KRW_RATE_NOTE}` : undefined}
        >
          이번 달 비용
          <span className="tabular-nums text-slate-900">{total ? formatUsd(total.costMicroUsd) : '—'}</span>
        </span>
        <Link
          href="/agent-org"
          className="inline-flex h-7 items-center gap-0.5 rounded-lg px-2 text-[11px] font-semibold text-violet-700 transition-colors hover:bg-violet-50"
        >
          Agent Org
          <ArrowUpRight size={12} aria-hidden />
        </Link>
      </div>
    </div>
  );
}

function SummaryChip({ label, value, tone, title }: { label: string; value: number | null; tone: DashboardTone; title?: string }) {
  const active = value !== null && value > 0;
  return (
    <span
      title={title}
      className={cn(
        'inline-flex h-7 items-center gap-1 rounded-lg px-2.5 text-[11px] font-semibold ring-1 ring-inset',
        active ? cn('bg-white', DASHBOARD_TONE[tone].text, 'ring-slate-200') : 'bg-white text-slate-500 ring-slate-200',
      )}
    >
      {label}
      <span className={cn('text-sm tabular-nums', active ? '' : 'text-slate-300')}>{value ?? '—'}</span>
    </span>
  );
}

/** 지금 해야 할 일 — 에이전트가 막힌 것과 findings 를 한 목록으로. AI 영역 오른쪽에 선다. */
export function DashboardUrgentQueue({
  findings,
  findingsLoading,
  findingsError = false,
  className,
}: {
  findings: DashboardFindings | undefined;
  findingsLoading: boolean;
  findingsError?: boolean;
  className?: string;
}) {
  const ready = Boolean(findings) && !findingsError && !findingsLoading;
  const measured = ready && findings?.reorderSuggestions !== null && findings?.salesDecline.count !== null;
  const { queue, now } = useQueue(ready ? findings : undefined, 7);
  const unavailable = findingsError ? '업무 조회 실패 · 상단에서 다시 시도해 주세요'
    : findingsLoading ? '업무를 확인하고 있습니다'
      : !measured ? '판단할 수집 근거가 부족합니다' : null;
  const nowDate = new Date(now);

  return (
    <section
      aria-label="지금 해야 할 일"
      className={cn('flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white', className)}
      data-testid="dashboard-work-queue"
    >
      <DashboardCardHeader
        icon={ListChecks}
        tone="violet"
        title="지금 해야 할 일"
        meta={
          <span className="ml-1 truncate text-xs font-normal tabular-nums text-slate-400">
            {!measured ? (queue.total > 0 ? `확인된 ${queue.total}건 · 일부 미측정` : '—')
              : queue.total > queue.items.length ? `${queue.items.length} / ${queue.total}건` : `${queue.total}건`}
          </span>
        }
      />
      {unavailable && queue.items.length > 0 ? <p role="status" className="px-4 py-2 text-xs text-amber-700">{unavailable}</p> : null}
      {queue.items.length === 0 ? (
        <p className="flex-1 px-4 py-10 text-center text-xs text-slate-400">
          {unavailable ?? '지금 손이 필요한 일이 없습니다.'}
        </p>
      ) : (
        <ul className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto">
          {queue.items.map((item) => <QueueRow key={item.key} item={item} now={nowDate} />)}
        </ul>
      )}
    </section>
  );
}

function QueueRow({ item, now }: { item: WorkQueueItem; now: Date }) {
  const look = BADGE_LOOK[item.badge] ?? { icon: ShieldAlert, tone: 'slate' as DashboardTone };
  // 막힌 일은 바탕을 옅게 붉혀 둔다 — 줄을 읽기 전에 급한 것이 먼저 보인다(사장님 2026-09-20).
  const blocked = item.kind === 'blocked';
  return (
    <li>
      <Link
        href={item.href}
        aria-label={`${item.title} — ${item.actionLabel}`}
        className={cn(
          'group flex items-center gap-2.5 px-4 py-3 transition-colors focus-visible:outline-none',
          blocked ? 'bg-red-50/70 hover:bg-red-50' : 'hover:bg-slate-50/70 focus-visible:bg-slate-50',
        )}
      >
        <DashboardIconBadge icon={look.icon} tone={look.tone} />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="truncate text-[13px] font-semibold leading-snug text-slate-900">{item.title}</span>
            {item.since ? (
              <span className="flex flex-none items-center gap-0.5 text-[11px] text-slate-400">
                <Clock size={10} aria-hidden />
                {timeAgo(new Date(item.since), now)}부터
              </span>
            ) : null}
          </span>
          {item.evidence ? (
            <span className="mt-0.5 block truncate text-[11px] text-slate-500" title={item.evidence}>{item.evidence}</span>
          ) : null}
        </span>
        <ArrowRight
          size={14}
          aria-hidden
          className={cn('flex-none transition-colors', blocked ? 'text-red-300 group-hover:text-red-600' : 'text-slate-300 group-hover:text-violet-600')}
        />
      </Link>
    </li>
  );
}

export type { WorkQueueCounts };
