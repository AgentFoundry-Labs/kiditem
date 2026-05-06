'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Eye,
  Filter,
  Flame,
  LineChart,
  PackageSearch,
  Radar,
  RefreshCcw,
  Search,
  ShieldAlert,
  ShoppingBag,
  Store,
  Target,
  Timer,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { cn, formatKRW, formatNumber, formatPercent } from '@/lib/utils';
import {
  actionLabels,
  alibabaSignals,
  coupangTrackers,
  sourcingCandidates,
  tabs,
  trendKeywords,
  type CandidateAction,
  type SourcingCandidate,
  type TabId,
  type TrendStage,
} from './lib/sourcing-ai-dashboard';

export default function SourcingAiPage() {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [query, setQuery] = useState('');

  const filteredCandidates = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return sourcingCandidates;
    return sourcingCandidates.filter((candidate) => (
      candidate.title.toLowerCase().includes(normalizedQuery) ||
      candidate.keyword.toLowerCase().includes(normalizedQuery)
    ));
  }, [query]);

  return (
    <main className="flex h-full flex-col bg-[var(--surface-sunken)]">
      <header className="border-b border-[var(--border-subtle)] bg-[var(--surface)] px-5 py-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--primary-soft)] text-[var(--primary)]">
              <Bot size={18} />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-black text-[var(--text-primary)]">
                소싱 AI
              </h1>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="relative block sm:w-72">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
                size={16}
              />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="상품명 또는 키워드 검색"
                className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] pl-9 pr-3 text-sm font-semibold text-[var(--text-primary)] outline-none transition focus:border-[var(--primary)]"
              />
            </label>
            <button className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-4 text-sm font-black text-[var(--primary-contrast)] transition hover:bg-[var(--primary-hover)]">
              <PackageSearch size={16} />
              추적 후보 추가
            </button>
          </div>
        </div>
      </header>

      <section className="flex-1 overflow-y-auto px-5 py-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={TrendingUp}
            label="급상승 키워드"
            value={formatNumber(12)}
            caption="3일 기준 신규 반응"
            tone="sky"
          />
          <MetricCard
            icon={Radar}
            label="1688 신규 후보"
            value={formatNumber(38)}
            caption="공급가/MOQ 필터 통과"
            tone="emerald"
          />
          <MetricCard
            icon={Timer}
            label="쿠팡 추적 URL"
            value={formatNumber(46)}
            caption="신규상품순 모니터링"
            tone="amber"
          />
          <MetricCard
            icon={Target}
            label="소싱 우선 후보"
            value={formatNumber(5)}
            caption="샘플 요청 가능"
            tone="rose"
          />
        </div>

        <div className="mt-5 border-b border-[var(--border)]">
          <div className="flex gap-2 overflow-x-auto pb-3">
            {tabs.map((tab) => {
              const selected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex h-12 min-w-[154px] shrink-0 items-center justify-between gap-4 rounded-lg border px-4 text-left transition',
                    selected
                      ? 'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]'
                      : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]',
                  )}
                >
                  <span className="text-sm font-black">{tab.label}</span>
                  <span
                    className={cn(
                      'flex h-7 min-w-[1.75rem] items-center justify-center rounded-full px-2 text-xs font-black',
                      selected
                        ? 'bg-[var(--primary)] text-[var(--primary-contrast)]'
                        : 'bg-[var(--surface-sunken)] text-[var(--text-tertiary)]',
                    )}
                  >
                    {formatNumber(tab.count)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-5">
          {activeTab === 'overview' && <OverviewPanel candidates={filteredCandidates} />}
          {activeTab === 'trends' && <TrendPanel />}
          {activeTab === 'new-products' && <AlibabaPanel />}
          {activeTab === 'coupang' && <CoupangPanel />}
          {activeTab === 'recommendations' && (
            <RecommendationPanel candidates={filteredCandidates} />
          )}
        </div>
      </section>
    </main>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  caption,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  caption: string;
  tone: 'sky' | 'emerald' | 'amber' | 'rose';
}) {
  return (
    <article className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-[var(--text-tertiary)]">{label}</p>
          <p className="mt-2 text-2xl font-black text-[var(--text-primary)]">{value}</p>
          <p className="mt-1 text-xs font-semibold text-[var(--text-muted)]">{caption}</p>
        </div>
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
            tone === 'sky' && 'bg-sky-100 text-sky-700',
            tone === 'emerald' && 'bg-emerald-100 text-emerald-700',
            tone === 'amber' && 'bg-amber-100 text-amber-700',
            tone === 'rose' && 'bg-rose-100 text-rose-700',
          )}
        >
          <Icon size={18} />
        </span>
      </div>
    </article>
  );
}

function OverviewPanel({ candidates }: { candidates: SourcingCandidate[] }) {
  const bestCandidate = sourcingCandidates[0];
  const fastestTrend = trendKeywords[0];
  const strongestTracker = coupangTrackers[0];

  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)]">
          <SectionHeader
            icon={Target}
            title="오늘의 요약"
            description="지금 바로 볼 소싱 우선순위와 보류 신호입니다."
          />
          <div className="grid gap-3 p-4 md:grid-cols-3">
            <OverviewSummaryCard
              label="1순위 후보"
              title={bestCandidate.title}
              value={`${formatNumber(bestCandidate.score)}점`}
              text={bestCandidate.evidence}
              tone="good"
            />
            <OverviewSummaryCard
              label="가장 빠른 트렌드"
              title={fastestTrend.keyword}
              value={`+${formatPercent(fastestTrend.growthRate)}`}
              text={fastestTrend.signal}
              tone="watch"
            />
            <OverviewSummaryCard
              label="쿠팡 검증 신호"
              title={strongestTracker.keyword}
              value={`리뷰 +${formatNumber(strongestTracker.reviewDelta)}`}
              text={strongestTracker.winner}
              tone="market"
            />
          </div>
        </section>

        <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)]">
          <SectionHeader
            icon={Clock3}
            title="3일 판단 흐름"
            description="후보를 넣으면 이 순서로 소싱 여부를 좁힙니다."
          />
          <div className="space-y-3 px-4 pb-4">
            <PipelineStep label="1. 1688 신상품 발견" value="신상품성, 공급가, MOQ, 공급사 등급 확인" />
            <PipelineStep label="2. 쿠팡 신규상품순 추적" value="키워드별 URL, 신규 등록 수, 리뷰 증가 기록" />
            <PipelineStep label="3. 추천 소싱 결정" value="마진, 경쟁 강도, 인증 리스크를 합산해 액션 선택" />
          </div>
        </section>
      </div>

      <RecommendationPanel candidates={candidates} />
      <TrendPanel />
      <AlibabaPanel />
      <CoupangPanel />
    </div>
  );
}

function TrendPanel() {
  return (
    <div className="grid gap-5 xl:grid-cols-[1.4fr_0.8fr]">
      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)]">
        <SectionHeader
          icon={LineChart}
          title="트렌드 검색어"
          description="1688 신상 키워드와 쿠팡 신규상품순 반응을 함께 봅니다."
          actionIcon={Filter}
          actionLabel="필터"
        />
        <div className="divide-y divide-[var(--border-subtle)]">
          {trendKeywords.map((item) => (
            <article key={item.keyword} className="grid gap-3 px-4 py-4 lg:grid-cols-[1fr_120px_120px_120px] lg:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate text-sm font-black text-[var(--text-primary)]">
                    {item.keyword}
                  </h3>
                  <TrendStageBadge stage={item.stage} />
                </div>
                <p className="mt-1 text-xs font-semibold text-[var(--text-tertiary)]">
                  {item.source}
                </p>
                <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                  {item.signal}
                </p>
              </div>
              <TrendStat label="상승률" value={`+${formatPercent(item.growthRate)}`} />
              <TrendStat label="신규상품" value={`+${formatNumber(item.newListings)}`} />
              <TrendStat label="리뷰증가" value={`+${formatNumber(item.reviewDelta)}`} />
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)]">
        <SectionHeader
          icon={Flame}
          title="판단 로직"
          description="상품 수 증가만 보지 않고 한국 반응을 같이 확인합니다."
        />
        <div className="space-y-3 px-4 pb-4">
          <SignalRule
            icon={CheckCircle2}
            title="좋은 신호"
            text="1688 신규성, 쿠팡 신규 등록, 리뷰 증가가 동시에 움직이는 키워드"
            tone="good"
          />
          <SignalRule
            icon={AlertTriangle}
            title="주의 신호"
            text="상품 수만 늘고 신규 리뷰가 붙지 않거나 기존 강자가 압도적인 키워드"
            tone="warn"
          />
          <SignalRule
            icon={ShieldAlert}
            title="제외 신호"
            text="전기/식품/안전 인증 리스크가 큰데 마진 여유가 낮은 후보"
            tone="danger"
          />
        </div>
      </section>
    </div>
  );
}

function AlibabaPanel() {
  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)]">
      <SectionHeader
        icon={Radar}
        title="1688 신상품 레이더"
        description="공급가, MOQ, 신상품성, 쿠팡 매칭 키워드를 한 줄로 묶습니다."
        actionIcon={RefreshCcw}
        actionLabel="갱신"
      />
      <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
        {alibabaSignals.map((item) => (
          <article key={item.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] p-4">
            <div className={cn('flex aspect-[4/3] items-center justify-center rounded-lg', item.visualClassName)}>
              <PackageSearch size={34} />
            </div>
            <div className="mt-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-black text-[var(--text-primary)]">
                    {item.title}
                  </h3>
                  <p className="mt-1 text-xs font-bold text-[var(--text-tertiary)]">
                    {item.category}
                  </p>
                </div>
                <span className="rounded-md bg-emerald-100 px-2 py-1 text-xs font-black text-emerald-700">
                  {item.supplierGrade}
                </span>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <ProductMetric label="공급가" value={formatKRW(item.cost)} />
                <ProductMetric label="MOQ" value={`${formatNumber(item.moq)}개`} />
                <ProductMetric label="신상품성" value={`${formatNumber(item.freshness)}점`} />
                <ProductMetric label="쿠팡 증가" value={`+${formatNumber(item.productDelta)}`} />
              </dl>
              <div className="mt-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] p-3">
                <p className="text-xs font-bold text-[var(--text-muted)]">쿠팡 매칭 키워드</p>
                <p className="mt-1 text-sm font-black text-[var(--text-primary)]">
                  {item.coupangKeyword}
                </p>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function CoupangPanel() {
  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)]">
      <SectionHeader
        icon={ShoppingBag}
        title="쿠팡 3일 검증"
        description="신규상품순 URL을 추적해서 상품 수, 리뷰, 노출 변화를 기록합니다."
        actionIcon={ExternalLink}
        actionLabel="쿠팡 열기"
      />
      <div className="overflow-x-auto">
        <table className="min-w-[900px]">
          <thead>
            <tr>
              <th>키워드</th>
              <th>추적 시작</th>
              <th>URL</th>
              <th>신규상품</th>
              <th>리뷰 변화</th>
              <th>순위 변화</th>
              <th>관찰 포인트</th>
              <th>상태</th>
            </tr>
          </thead>
          <tbody>
            {coupangTrackers.map((tracker) => (
              <tr key={tracker.keyword}>
                <td className="font-black text-[var(--text-primary)]">{tracker.keyword}</td>
                <td>{tracker.firstSeen}</td>
                <td>{formatNumber(tracker.trackedUrls)}</td>
                <td className="font-black text-sky-700">+{formatNumber(tracker.newProducts)}</td>
                <td className="font-black text-emerald-700">+{formatNumber(tracker.reviewDelta)}</td>
                <td className={cn('font-black', tracker.topRankShift > 0 ? 'text-emerald-700' : 'text-rose-700')}>
                  {tracker.topRankShift > 0 ? '+' : ''}
                  {formatNumber(tracker.topRankShift)}
                </td>
                <td className="max-w-[220px] truncate">{tracker.winner}</td>
                <td>
                  <span className={getTrackerStatusClassName(tracker.status)}>
                    {tracker.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RecommendationPanel({ candidates }: { candidates: SourcingCandidate[] }) {
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)]">
        <SectionHeader
          icon={Target}
          title="추천 소싱 후보"
          description="3일 성장률, 리뷰 증가, 경쟁 강도, 마진 가능성을 합산한 우선순위입니다."
          actionIcon={Eye}
          actionLabel="추적 보기"
        />
        <div className="divide-y divide-[var(--border-subtle)]">
          {candidates.map((candidate) => (
            <article key={candidate.title} className="grid gap-4 px-4 py-4 lg:grid-cols-[70px_1fr_120px_120px] lg:items-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-raised)]">
                <span className="text-xl font-black text-[var(--primary)]">{candidate.score}</span>
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate text-base font-black text-[var(--text-primary)]">
                    {candidate.title}
                  </h3>
                  <ActionBadge action={candidate.action} />
                </div>
                <p className="mt-1 text-sm font-semibold text-[var(--text-tertiary)]">
                  {candidate.keyword}
                </p>
                <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                  {candidate.evidence}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <InlineBadge label={`마진 ${formatPercent(candidate.margin)}`} />
                  <InlineBadge label={`경쟁 ${candidate.competition}`} />
                  <InlineBadge label={candidate.risk} />
                </div>
              </div>
              <button className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 text-sm font-black text-[var(--text-primary)] transition hover:border-[var(--primary)]">
                <Clock3 size={16} />
                3일 추적
              </button>
              <button className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-3 text-sm font-black text-[var(--primary-contrast)] transition hover:bg-[var(--primary-hover)]">
                <ArrowUpRight size={16} />
                {actionLabels[candidate.action]}
              </button>
            </article>
          ))}
        </div>
      </section>

      <aside className="space-y-5">
        <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)]">
          <SectionHeader
            icon={Store}
            title="다음 API 연결"
            description="실제 자동화는 NestJS sourcing 도메인에 붙입니다."
          />
          <div className="space-y-3 px-4 pb-4">
            <PipelineStep label="1688 신상품 수집" value="상품명, 이미지, 공급가, MOQ" />
            <PipelineStep label="쿠팡 검색 추적" value="신규상품순 URL, 리뷰 수, 순위" />
            <PipelineStep label="트렌드 키워드" value="키워드 성장률, 카테고리 매칭" />
            <PipelineStep label="추천 점수화" value="마진, 경쟁, 인증 리스크" />
          </div>
        </section>

        <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="text-emerald-600" size={18} />
            <h2 className="text-sm font-black text-[var(--text-primary)]">MVP 기준</h2>
          </div>
          <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
            먼저 후보 URL과 키워드를 저장하고, 3일 동안 쿠팡 신규상품순의 변화량을 누적하면
            실제 소싱 판단에 바로 쓸 수 있습니다.
          </p>
        </section>
      </aside>
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  description,
  actionIcon: ActionIcon,
  actionLabel,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  actionIcon?: LucideIcon;
  actionLabel?: string;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-[var(--border-subtle)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--primary-soft)] text-[var(--primary)]">
          <Icon size={18} />
        </span>
        <div className="min-w-0">
          <h2 className="truncate text-sm font-black text-[var(--text-primary)]">{title}</h2>
          <p className="mt-1 text-xs font-semibold text-[var(--text-tertiary)]">{description}</p>
        </div>
      </div>
      {ActionIcon && actionLabel && (
        <button className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 text-xs font-black text-[var(--text-secondary)] transition hover:border-[var(--border-strong)]">
          <ActionIcon size={15} />
          {actionLabel}
        </button>
      )}
    </div>
  );
}

function TrendStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3 py-2">
      <p className="text-xs font-bold text-[var(--text-muted)]">{label}</p>
      <p className="mt-1 text-sm font-black text-[var(--text-primary)]">{value}</p>
    </div>
  );
}

function OverviewSummaryCard({
  label,
  title,
  value,
  text,
  tone,
}: {
  label: string;
  title: string;
  value: string;
  text: string;
  tone: 'good' | 'watch' | 'market';
}) {
  return (
    <article className="rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-black text-[var(--text-tertiary)]">{label}</p>
        <span
          className={cn(
            'rounded-md px-2 py-1 text-xs font-black',
            tone === 'good' && 'bg-emerald-100 text-emerald-700',
            tone === 'watch' && 'bg-sky-100 text-sky-700',
            tone === 'market' && 'bg-amber-100 text-amber-700',
          )}
        >
          {value}
        </span>
      </div>
      <h3 className="mt-4 text-base font-black text-[var(--text-primary)]">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{text}</p>
    </article>
  );
}

function ProductMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2">
      <dt className="font-bold text-[var(--text-muted)]">{label}</dt>
      <dd className="mt-1 font-black text-[var(--text-primary)]">{value}</dd>
    </div>
  );
}

function SignalRule({
  icon: Icon,
  title,
  text,
  tone,
}: {
  icon: LucideIcon;
  title: string;
  text: string;
  tone: 'good' | 'warn' | 'danger';
}) {
  return (
    <article className="rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] p-3">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
            tone === 'good' && 'bg-emerald-100 text-emerald-700',
            tone === 'warn' && 'bg-amber-100 text-amber-700',
            tone === 'danger' && 'bg-rose-100 text-rose-700',
          )}
        >
          <Icon size={16} />
        </span>
        <div>
          <h3 className="text-sm font-black text-[var(--text-primary)]">{title}</h3>
          <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{text}</p>
        </div>
      </div>
    </article>
  );
}

function TrendStageBadge({ stage }: { stage: TrendStage }) {
  const label = stage === 'rising' ? '상승' : stage === 'watch' ? '관찰' : '과열';
  return (
    <span
      className={cn(
        'rounded-md px-2 py-1 text-xs font-black',
        stage === 'rising' && 'bg-emerald-100 text-emerald-700',
        stage === 'watch' && 'bg-sky-100 text-sky-700',
        stage === 'crowded' && 'bg-amber-100 text-amber-700',
      )}
    >
      {label}
    </span>
  );
}

function ActionBadge({ action }: { action: CandidateAction }) {
  return (
    <span
      className={cn(
        'rounded-md px-2 py-1 text-xs font-black',
        action === 'sample' && 'bg-emerald-100 text-emerald-700',
        action === 'track' && 'bg-sky-100 text-sky-700',
        action === 'hold' && 'bg-amber-100 text-amber-700',
        action === 'drop' && 'bg-rose-100 text-rose-700',
      )}
    >
      {actionLabels[action]}
    </span>
  );
}

function InlineBadge({ label }: { label: string }) {
  return (
    <span className="rounded-md border border-[var(--border)] bg-[var(--surface-raised)] px-2 py-1 text-xs font-bold text-[var(--text-secondary)]">
      {label}
    </span>
  );
}

function PipelineStep({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3 py-3">
      <p className="text-sm font-black text-[var(--text-primary)]">{label}</p>
      <p className="mt-1 text-xs font-semibold text-[var(--text-tertiary)]">{value}</p>
    </div>
  );
}

function getTrackerStatusClassName(status: string) {
  return cn(
    'rounded-md px-2 py-1 text-xs font-black',
    status === '소싱 우선' && 'bg-emerald-100 text-emerald-700',
    status === '추적 유지' && 'bg-sky-100 text-sky-700',
    status === '마진 확인' && 'bg-amber-100 text-amber-700',
    status === '경쟁 과열' && 'bg-rose-100 text-rose-700',
  );
}
