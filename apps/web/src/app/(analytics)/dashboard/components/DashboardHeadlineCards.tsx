import Link from 'next/link';
import { ArrowUpRight, Megaphone, Package, Wallet, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * 맨 위 두 장 — 매출 카드와 광고 카드.
 *
 * 처음 대시보드(kiditem_dashboard 포팅, 2026-03-30 `c359756cb`)의 KPI 여덟 칸은 두 줄이었다.
 * 윗줄이 매출(월 매출 · 월 순이익 · 오늘 매출 · 광고비율), 아랫줄이 광고(ROAS · CTR · 광고
 * 전환매출 · 광고비)다. 사장님이 그 두 줄을 카드 두 장으로 맨 위에 다시 세우라 했다.
 *
 * 값은 이 컴포넌트가 만들지 않는다. 페이지가 서버 읽기모델에서 이미 고른 값을 넘겨받아 그리기만
 * 한다 — 같은 숫자를 두 군데서 따로 계산하면 아래 기간 지표와 어긋난다. 모양은 그때의 파스텔
 * 카드가 아니라 지금 대시보드의 칸 모양을 따른다(그 색은 2026-03-30 디자인 정리에서 걷었다).
 */

export interface HeadlineMetric {
  key: string;
  label: string;
  /** 이미 포맷한 값. 모르면 null — 0 으로 그리지 않는다. */
  value: string | null;
  unit?: string;
  /** 값 밑의 한 줄(이전 값 · 변화 · 출처). */
  note?: string | null;
  /** 좋아졌는지 나빠졌는지. 모르면 그리지 않는다. */
  trend?: 'up' | 'down' | null;
  /** 오르면 나쁜 지표(광고비율 · 광고비)는 색을 뒤집는다. */
  higherIsWorse?: boolean;
  /** 오르면 경고색으로 칠할 문턱(광고비율 15% 등). */
  alert?: boolean;
  /** 이 숫자를 처리하는 화면. 있으면 칸이 그리로 바로 간다. */
  href?: string;
}

interface HeadlineCardProps {
  title: string;
  icon: LucideIcon;
  href: string;
  hrefLabel: string;
  metrics: readonly HeadlineMetric[];
}

function trendClass(metric: HeadlineMetric): string {
  if (!metric.trend) return 'text-slate-500';
  const good = metric.higherIsWorse ? metric.trend === 'down' : metric.trend === 'up';
  return good ? 'text-emerald-700' : 'text-red-600';
}

function HeadlineCard({ title, icon: Icon, href, hrefLabel, metrics }: HeadlineCardProps) {
  return (
    <section
      aria-label={title}
      className="overflow-hidden rounded-xl border border-slate-200 bg-white"
    >
      <header className="flex items-center justify-between h-10 border-b border-slate-100 px-4">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
          <Icon size={14} className="text-slate-500" aria-hidden />
          {title}
        </h2>
        <Link
          href={href}
          className="inline-flex items-center gap-0.5 text-xs font-medium text-slate-500 transition-colors hover:text-violet-700"
        >
          {hrefLabel}
          <ArrowUpRight size={12} aria-hidden />
        </Link>
      </header>
      {/* 두 줄 두 칸. 오른쪽에 에이전트 칸이 서서 폭이 줄었다 — 네 칸을 한 줄에 세우면
          '135,385,452원' 같은 값이 칸을 넘는다. */}
      <dl className="grid grid-cols-2 gap-px bg-slate-100">
        {metrics.map((metric) => {
          const className = cn('flex flex-col bg-white px-3.5 py-3', metric.href && 'transition-colors hover:bg-slate-50');
          const body = (
          <>
            <dt className="font-mono text-[11px] uppercase tracking-wider text-slate-500">{metric.label}</dt>
            <dd
              className={cn(
                'mt-0.5 whitespace-nowrap text-lg font-bold leading-tight tracking-tight tabular-nums',
                metric.alert ? 'text-red-600' : 'text-slate-900',
              )}
            >
              {metric.value === null ? (
                <span className="text-slate-300">—</span>
              ) : (
                <>
                  {metric.value}
                  {metric.unit ? (
                    <span className="ml-0.5 text-[13px] font-semibold text-slate-500">{metric.unit}</span>
                  ) : null}
                </>
              )}
            </dd>
            {metric.note ? (
              <dd className={cn('mt-0.5 truncate text-xs', trendClass(metric))} title={metric.note}>
                {metric.note}
              </dd>
            ) : null}
          </>
          );
          return metric.href ? (
            <Link key={metric.key} href={metric.href} className={className} data-testid={`headline-${metric.key}`}>{body}</Link>
          ) : (
            <div key={metric.key} className={className} data-testid={`headline-${metric.key}`}>{body}</div>
          );
        })}
      </dl>
    </section>
  );
}

export function DashboardHeadlineCards({
  revenue,
  ads,
  inventory,
  salesHref,
}: {
  revenue: readonly HeadlineMetric[];
  ads: readonly HeadlineMetric[];
  inventory?: readonly HeadlineMetric[];
  salesHref: string;
}) {
  // 세 장이 한 줄에 서려면 칸마다 아홉 자리 매출이 들어갈 폭이 있어야 한다. 그보다 좁으면
  // 재고가 다음 줄로 내려간다 — 숫자를 자르지 않는다.
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 min-[1440px]:grid-cols-3" data-testid="dashboard-headline-cards">
      <HeadlineCard title="매출" icon={Wallet} href={salesHref} hrefLabel="매출 분석" metrics={revenue} />
      <HeadlineCard title="광고" icon={Megaphone} href="/ad-ops" hrefLabel="광고전략 AI" metrics={ads} />
      {inventory ? (
        <HeadlineCard title="재고" icon={Package} href="/product-hub" hrefLabel="상품 관리" metrics={inventory} />
      ) : null}
    </div>
  );
}
