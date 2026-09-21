import type { ReactNode } from 'react';
import Link from 'next/link';
import { Megaphone, Package, Store, Wallet, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { type DashboardTone } from './DashboardCardHeader';

/**
 * 맨 위 네 장 — 매출 · 쇼핑몰 · 광고 · 재고.
 *
 * 처음 대시보드(kiditem_dashboard 포팅, 2026-03-30 `c359756cb`)의 KPI 여덟 칸은 두 줄이었다.
 * 윗줄이 매출(월 매출 · 월 순이익 · 오늘 매출 · 광고비율), 아랫줄이 광고(ROAS · CTR · 광고
 * 전환매출 · 광고비)다. 사장님이 그 두 줄을 카드로 맨 위에 다시 세우라 했고, 재고가 더해졌다.
 *
 * 한 장은 대표 값 하나와 받쳐 주는 값 셋이다(사장님 2026-09-18 디자인 수정). 첫 값을 크게 세우고
 * 나머지 셋을 그 아래 한 줄에 둔다 — 네 값을 같은 크기로 늘어놓으면 무엇을 먼저 봐야 할지
 * 말하지 않는다.
 *
 * 값은 이 컴포넌트가 만들지 않는다. 페이지가 서버 읽기모델에서 이미 고른 값을 넘겨받아 그리기만
 * 한다 — 같은 숫자를 두 군데서 따로 계산하면 아래 기간 지표와 어긋난다.
 */

export interface HeadlineMetric {
  key: string;
  label: string;
  /** 이미 포맷한 값. 모르면 null — 0 으로 그리지 않는다. */
  value: string | null;
  unit?: string;
  /** 값 밑의 한 줄(이전 값 · 변화 · 모르는 이유). */
  note?: string | null;
  /** 좋아졌는지 나빠졌는지. 모르면 그리지 않는다. */
  trend?: 'up' | 'down' | null;
  /** 오르면 나쁜 지표(광고비율 · 광고비)는 색을 뒤집는다. */
  higherIsWorse?: boolean;
  /** 오르면 경고색으로 칠할 문턱(광고비율 15% 등). */
  alert?: boolean;
  /** 이 숫자를 처리하는 화면. 있으면 칸이 그리로 바로 간다. */
  href?: string;
  /** 영수증에서 빼는 줄 — 앞에 − 를 붙인다. */
  negative?: boolean;
  /** 영수증의 마지막 줄(합계) — 굵게, 위에 진한 선. */
  emphasis?: boolean;
  /** 이름 바로 옆에 붙는 짧은 값(이익률 등). */
  suffix?: string;
}

export interface HeadlineCardProps {
  title: string;
  icon: LucideIcon;
  tone: DashboardTone;
  href: string;
  hrefLabel: string;
  metrics: readonly HeadlineMetric[];
  /** AI 칸은 바탕을 옅은 보라로 — 성과 칸과 영역이 갈린다(사장님 2026-09-20). */
  accent?: 'violet';
  /** 오른쪽 위 링크 대신 놓을 것. */
  headerRight?: ReactNode;
  /** 제목에 얹는 도움말. */
  titleHint?: string;
}

function isGood(metric: HeadlineMetric): boolean {
  return metric.higherIsWorse ? metric.trend === 'down' : metric.trend === 'up';
}

function trendClass(metric: HeadlineMetric): string {
  if (!metric.trend) return 'text-slate-400';
  return isGood(metric) ? 'text-emerald-700' : 'text-red-600';
}

/**
 * 한 값. 대표 값은 크게 보라로 세우고(사장님이 보여 준 '광고 전환 매출' 칸 모양, 2026-09-20),
 * 받침 값들은 이름 왼쪽 · 숫자 오른쪽으로 줄을 맞춰 세운다.
 */
function HeroMetric({ metric }: { metric: HeadlineMetric }) {
  const body = (
    <>
      <dt className="flex min-w-0 items-baseline gap-1.5">
        <span className="truncate text-[13px] font-medium text-slate-500">{metric.label}</span>
        {metric.suffix ? <span className="flex-none text-[11px] font-semibold text-slate-400">{metric.suffix}</span> : null}
      </dt>
      <dd
        className={cn(
          'mt-1.5 whitespace-nowrap text-[32px] font-bold leading-none tracking-tight tabular-nums',
          metric.alert ? 'text-red-600' : 'text-violet-700',
        )}
      >
        {metric.value === null ? (
          <span className="text-slate-300">—</span>
        ) : (
          <>
            {metric.value}
            {metric.unit ? <span className="ml-1 text-base font-semibold text-slate-400">{metric.unit}</span> : null}
          </>
        )}
      </dd>
      <dd
        className={cn('mt-2 min-h-[1.125rem] truncate text-xs leading-[1.125rem]', metric.note ? trendClass(metric) : null)}
        title={metric.note ?? undefined}
        aria-hidden={metric.note ? undefined : true}
      >
        {metric.note}
      </dd>
    </>
  );
  return metric.href ? (
    <Link href={metric.href} className="block rounded-lg transition-colors hover:bg-slate-50" data-testid={`headline-${metric.key}`}>{body}</Link>
  ) : (
    <div data-testid={`headline-${metric.key}`}>{body}</div>
  );
}

function MetricRow({ metric }: { metric: HeadlineMetric }) {
  const row = (
    <>
      <dt className="flex min-w-0 items-baseline gap-1.5">
        <span className="truncate text-[13px] text-slate-500">{metric.label}</span>
        {/* 이름 옆 한 마디(이익률 같은 것). 설명이 아니라 그 줄을 읽는 열쇠다. */}
        {metric.suffix ? <span className="flex-none text-[11px] font-semibold text-slate-400">{metric.suffix}</span> : null}
      </dt>
      <dd
        className={cn(
          'flex-none whitespace-nowrap tabular-nums',
          metric.emphasis ? 'text-[17px] font-bold' : 'text-[15px] font-semibold',
          metric.alert ? 'text-red-600' : metric.negative ? 'text-slate-600' : 'text-slate-900',
        )}
        title={metric.note ?? undefined}
      >
        {metric.value === null ? (
          <span className="text-slate-300">—</span>
        ) : (
          <>
            {metric.negative ? '−' : ''}
            {metric.value}
            {metric.unit ? <span className="ml-0.5 text-xs font-semibold text-slate-400">{metric.unit}</span> : null}
          </>
        )}
      </dd>
    </>
  );
  return metric.href ? (
    <Link
      href={metric.href}
      className={cn(
        '-mx-1.5 flex items-center justify-between gap-2 rounded px-1.5 py-1 transition-colors hover:bg-slate-50',
        metric.emphasis && 'border-t-2 border-slate-900/80 pt-1.5',
      )}
      data-testid={`headline-${metric.key}`}
    >
      {row}
    </Link>
  ) : (
    <div
      className={cn('flex items-center justify-between gap-2 py-1', metric.emphasis && 'mt-0.5 border-t-2 border-slate-900/80 pt-1.5')}
      data-testid={`headline-${metric.key}`}
    >
      {row}
    </div>
  );
}

export function HeadlineCard({ title, icon, tone, href, hrefLabel, metrics, accent, headerRight, titleHint }: HeadlineCardProps) {
  const [hero, ...rest] = metrics;
  return (
    <section
      aria-label={title}
      className={cn(
        'relative flex flex-col overflow-hidden rounded-2xl border shadow-[0_1px_2px_rgba(15,23,42,0.04)]',
        accent === 'violet' ? 'border-violet-200 bg-violet-50/60' : 'border-slate-200/80 bg-white',
      )}
    >
      {/* 화면에는 제목 줄이 없다(사장님 2026-09-20). 읽어 주는 기계에는 남겨 둔다. */}
      <h2 className="sr-only" title={titleHint}>{title}</h2>
      {headerRight ? (
        <div className="absolute right-3 top-2.5 z-10 flex items-center gap-1.5">{headerRight}</div>
      ) : null}
      <dl className="flex flex-1 flex-col px-4 pb-3 pt-3.5">
        {hero ? <HeroMetric metric={hero} /> : null}
        {rest.length > 0 ? (
          <div
            className={cn(
              'mt-auto divide-y pt-2',
              accent === 'violet' ? 'divide-violet-100 border-t border-violet-100' : 'divide-slate-100 border-t border-slate-100',
            )}
          >
            {rest.map((metric) => <MetricRow key={metric.key} metric={metric} />)}
          </div>
        ) : null}
      </dl>
    </section>
  );
}

export function DashboardHeadlineCards({
  revenue,
  mall,
  ads,
  inventory,
  salesHref,
  className,
}: {
  revenue: readonly HeadlineMetric[];
  mall?: readonly HeadlineMetric[];
  ads: readonly HeadlineMetric[];
  inventory?: readonly HeadlineMetric[];
  salesHref: string;
  /** `contents` 를 주면 카드들이 부모 격자의 칸이 된다(다섯 칸 한 줄). */
  className?: string;
}) {
  // 세 장이 한 줄에 서려면 받침 칸마다 '8,120,000원' 이 들어갈 폭이 있어야 한다. 그보다 좁으면
  // 재고가 다음 줄로 내려가 넷을 한 줄에 세운다 — 숫자를 자르지 않는다.
  return (
    <div className={className ?? 'grid grid-cols-1 gap-3 lg:grid-cols-2 min-[1600px]:grid-cols-4'} data-testid="dashboard-headline-cards">
      <HeadlineCard title="매출" icon={Wallet} tone="emerald" href={salesHref} hrefLabel="매출 분석" metrics={revenue} />
      {mall ? (
        <HeadlineCard title="쇼핑몰" icon={Store} tone="violet" href="/order-collection" hrefLabel="주문 수집" metrics={mall} />
      ) : null}
      <HeadlineCard title="마케팅" icon={Megaphone} tone="sky" href="/ad-ops" hrefLabel="광고전략 AI" metrics={ads} />
      {inventory ? (
        <HeadlineCard title="재고" icon={Package} tone="amber" href="/product-hub" hrefLabel="상품 관리" metrics={inventory} />
      ) : null}
    </div>
  );
}
