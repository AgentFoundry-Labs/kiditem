'use client';

import {
  AlertTriangle,
  BadgeDollarSign,
  Bell,
  ClipboardList,
  type LucideIcon,
} from 'lucide-react';
import { cn, formatNumber } from '@/lib/utils';
import { usePanelStore } from '@/components/panel/lib/panel-store';
import type { PipelineCounts } from '../lib/product-types';
import type { AlertItem } from '@kiditem/shared/alerts';

export type ProductSegment =
  | 'all'
  | 'core'
  | 'loss'
  | 'low-margin'
  | 'custom';

interface ProductCommandCenterProps {
  pipelineCounts: PipelineCounts;
  newProductCount: number;
  productAlerts: AlertItem[];
  onSelectSegment: (segment: ProductSegment) => void;
}

function BreakdownItem({
  label,
  value,
  tone = 'text-[var(--text-primary)]',
}: {
  label: string;
  value: number | string;
  tone?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] py-1.5 last:border-b-0">
      <p className="text-xs font-bold text-[var(--text-secondary)]">{label}</p>
      <p className={cn('text-[15px] font-extrabold tabular-nums', tone)}>
        {typeof value === 'number' ? formatNumber(value) : value}
      </p>
    </div>
  );
}

function QuickActionButton({
  icon: Icon,
  label,
  count,
  tone,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  count: number;
  tone: 'blue' | 'purple' | 'orange';
  onClick: () => void;
}) {
  const toneStyles = {
    blue: {
      background: 'rgba(37, 99, 235, 0.08)',
      hoverBackground: 'rgba(37, 99, 235, 0.13)',
      color: '#2563eb',
      iconBg: 'rgba(37, 99, 235, 0.12)',
    },
    purple: {
      background: 'rgba(112, 72, 232, 0.08)',
      hoverBackground: 'rgba(112, 72, 232, 0.13)',
      color: '#7048e8',
      iconBg: 'rgba(112, 72, 232, 0.12)',
    },
    orange: {
      background: 'rgba(217, 119, 6, 0.09)',
      hoverBackground: 'rgba(217, 119, 6, 0.15)',
      color: '#d97706',
      iconBg: 'rgba(217, 119, 6, 0.12)',
    },
  }[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-0 flex-1 items-center gap-3 px-4 py-3 text-left transition-colors"
      style={{ background: toneStyles.background, color: toneStyles.color }}
      onMouseEnter={(event) => {
        event.currentTarget.style.background = toneStyles.hoverBackground;
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.background = toneStyles.background;
      }}
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
        style={{ background: toneStyles.iconBg }}
      >
        <Icon size={17} />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-extrabold">{label}</span>
      <span className="shrink-0 rounded-lg bg-[var(--surface-sunken)] px-2.5 py-1 text-base font-extrabold tabular-nums text-[var(--text-primary)]">
        {formatNumber(count)}
      </span>
    </button>
  );
}

export function ProductCommandCenter({
  pipelineCounts,
  newProductCount,
  productAlerts,
  onSelectSegment,
}: ProductCommandCenterProps) {
  const setPanelOpen = usePanelStore((state) => state.setOpen);
  const channelLinkedProducts = pipelineCounts.channelLinkedProducts ?? 0;
  const channelUnlinkedProducts = pipelineCounts.channelUnlinkedProducts ?? Math.max(pipelineCounts.total - channelLinkedProducts, 0);
  const profitRisk = pipelineCounts.minus + pipelineCounts.low;
  const urgentAlerts = productAlerts.filter((alert) => alert.severity === 'critical' || alert.severity === 'error').length;
  const warningAlerts = productAlerts.filter((alert) => alert.severity === 'warning').length;
  const latestAlert = productAlerts[0];

  return (
    <section className="space-y-3">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-5">
        <article className="flex min-h-[270px] min-w-0 flex-col rounded-xl border border-[var(--border-subtle)] bg-[var(--card-bg)] px-5 pb-2.5 pt-5 shadow-sm">
          <div>
            <p className="text-xs font-bold text-[var(--text-tertiary)]">카탈로그 상품 전체</p>
            <p className="mt-2 text-3xl font-extrabold tabular-nums tracking-tight text-[var(--text-primary)]">
                {formatNumber(pipelineCounts.total)}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-[var(--surface-sunken)] p-2">
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-[var(--text-tertiary)]">채널 연결</p>
                <p className="mt-0.5 text-lg font-extrabold tabular-nums text-[var(--primary)]">
                  {formatNumber(channelLinkedProducts)}
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-[var(--text-tertiary)]">채널 미연결</p>
                <p className="mt-0.5 text-lg font-extrabold tabular-nums text-amber-600">
                  {formatNumber(channelUnlinkedProducts)}
                </p>
              </div>
            </div>
          </div>
          <div className="mt-auto">
            <BreakdownItem label="신상품" value={newProductCount} tone="text-emerald-600" />
            <BreakdownItem label="A등급" value={pipelineCounts.gradeA} tone="text-emerald-700" />
            <BreakdownItem label="B등급" value={pipelineCounts.gradeB} tone="text-amber-600" />
            <BreakdownItem label="C등급" value={pipelineCounts.gradeC} tone="text-rose-600" />
          </div>
        </article>

        <article className="min-h-[270px] min-w-0 overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--card-bg)] shadow-sm">
          <div className="flex h-full flex-col divide-y divide-[var(--border-subtle)]">
            <QuickActionButton
              icon={ClipboardList}
              label="핵심상품"
              count={pipelineCounts.gradeA}
              tone="blue"
              onClick={() => onSelectSegment('core')}
            />
            <QuickActionButton
              icon={AlertTriangle}
              label="적자상품"
              count={pipelineCounts.minus}
              tone="purple"
              onClick={() => onSelectSegment('loss')}
            />
            <QuickActionButton
              icon={BadgeDollarSign}
              label="저마진상품"
              count={pipelineCounts.low}
              tone="orange"
              onClick={() => onSelectSegment('low-margin')}
            />
          </div>
        </article>

        <article className="flex min-h-[270px] min-w-0 flex-col rounded-xl border border-[var(--border-subtle)] bg-[var(--card-bg)] px-5 pb-2.5 pt-5 shadow-sm">
          <div>
            <p className="text-xs font-bold text-[var(--text-tertiary)]">상품 상태</p>
            <p className="mt-2 text-3xl font-extrabold tabular-nums tracking-tight text-teal-700">
                {formatNumber(pipelineCounts.active)}
            </p>
          </div>
          <div className="mt-auto">
            <BreakdownItem label="판매중" value={pipelineCounts.active} tone="text-teal-700" />
            <BreakdownItem label="판매중지" value={pipelineCounts.inactive} tone="text-amber-600" />
            <BreakdownItem label="정리 대상" value={pipelineCounts.cleanup} tone="text-rose-600" />
            <BreakdownItem label="상태미수집" value={pipelineCounts.unknown} tone="text-[var(--primary)]" />
          </div>
        </article>

        <article className="flex min-h-[270px] min-w-0 flex-col rounded-xl border border-[var(--border-subtle)] bg-[var(--card-bg)] px-5 pb-2.5 pt-5 shadow-sm">
          <div>
            <p className="text-xs font-bold text-[var(--text-tertiary)]">손익점검</p>
            <p className="mt-2 text-3xl font-extrabold tabular-nums tracking-tight text-amber-600">
                {formatNumber(profitRisk)}
            </p>
          </div>
          <div className="mt-auto">
            <BreakdownItem label="점검 대상" value={profitRisk} tone="text-amber-600" />
            <BreakdownItem label="적자상품" value={pipelineCounts.minus} tone="text-red-600" />
            <BreakdownItem label="이익률 3%↓" value={pipelineCounts.low} tone="text-amber-600" />
            <BreakdownItem label="핵심상품" value={pipelineCounts.gradeA} tone="text-emerald-700" />
          </div>
        </article>

        <article className="flex min-h-[270px] min-w-0 flex-col rounded-xl border border-[var(--border-subtle)] bg-[var(--card-bg)] px-5 pb-2.5 pt-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-[var(--text-tertiary)]">알림</p>
              <p className={cn(
                'mt-2 text-3xl font-extrabold tabular-nums tracking-tight',
                urgentAlerts > 0 ? 'text-rose-600' : warningAlerts > 0 ? 'text-amber-600' : 'text-[var(--text-primary)]',
              )}>
                {formatNumber(productAlerts.length)}
              </p>
            </div>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-sunken)] text-[var(--text-tertiary)]">
              <Bell size={17} />
            </span>
          </div>
          <div className="mt-auto">
            <BreakdownItem label="긴급" value={urgentAlerts} tone={urgentAlerts > 0 ? 'text-rose-600' : 'text-[var(--text-primary)]'} />
            <BreakdownItem label="경고" value={warningAlerts} tone={warningAlerts > 0 ? 'text-amber-600' : 'text-[var(--text-primary)]'} />
            <BreakdownItem label="상품 관련" value={productAlerts.length} tone={productAlerts.length > 0 ? 'text-teal-700' : 'text-[var(--text-primary)]'} />
            <button
              type="button"
              onClick={() => setPanelOpen(true)}
              className="flex w-full items-center justify-between gap-2 py-1.5 text-left text-[var(--text-secondary)] transition-colors hover:text-[var(--primary)]"
            >
              <span className="truncate text-[11px] font-bold">
                {latestAlert ? latestAlert.title : '상품 운영 알림 없음'}
              </span>
              <span className="text-[11px] font-bold text-[var(--text-muted)]">
                열기
              </span>
            </button>
          </div>
        </article>
      </div>
    </section>
  );
}
