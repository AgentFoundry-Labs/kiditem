'use client';

import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { BarChart3, CheckCircle2, Clock3, PackageSearch, TrendingUp } from 'lucide-react';
import { CollectionStartControl } from '@/components/collection/CollectionStartControl';
import { cn, formatKRW, formatNumber } from '@/lib/utils';
import { queryKeys } from '@/lib/query-keys';
import {
  formatWingCatalogRate,
  resolveCoupangCatalogImageUrl,
} from '../wing-catalog/lib/wing-catalog-presenter';
import { fetchPopularKeywordBoards } from '../market/lib/trend-collection-api';
import { popularKeywordSuggestions } from '../lib/popular-keyword-suggestions';
import { toTodayRecommendationRows } from '../lib/sourcing-recommendation-presenter';
import {
  buildRecommendationSummary,
  buildRisingKeywordOpportunities,
  type RecommendationGrade,
  type TodayRecommendationRow,
} from '../recommendations/lib/today-recommendations';
import { useSourcingRecommendations } from '../hooks/use-sourcing-workspace';
import { useWingCatalogSource } from '../hooks/use-wing-catalog-source';
import { normalizeWingOperationKeywords } from '../lib/wing-operation-input';
import { WingCatalogCalculationActions } from './WingCatalogCalculationActions';
import { WingCatalogSourceStatus } from './WingCatalogSourceStatus';

const MARKET_ANALYSIS_KEYWORD_LIMIT = 12;
const MARKET_ANALYSIS_MAX_PAGES = 1;

interface SellochMarketAnalysisPageProps {
  compact?: boolean;
}

export function SellochMarketAnalysisPage({ compact = false }: SellochMarketAnalysisPageProps) {
  const recommendationsQuery = useSourcingRecommendations('today');
  const rows = useMemo(
    () => toTodayRecommendationRows(recommendationsQuery.data?.data?.items ?? []),
    [recommendationsQuery.data],
  );
  const popularKeywordsQuery = useQuery({
    queryKey: queryKeys.sourcing.trendPopularKeywords(7),
    queryFn: () => fetchPopularKeywordBoards(7),
  });
  const popularKeywords = useMemo(
    () => popularKeywordSuggestions(
      popularKeywordsQuery.data?.boards ?? [],
      MARKET_ANALYSIS_KEYWORD_LIMIT,
    ),
    [popularKeywordsQuery.data],
  );
  const [inputError, setInputError] = useState<string | null>(null);
  const operationKeywords = useMemo(
    () => normalizeWingOperationKeywords(popularKeywords, MARKET_ANALYSIS_KEYWORD_LIMIT),
    [popularKeywords],
  );
  const operationInput = useMemo(() => ({
    keywords: operationKeywords,
    maxPages: MARKET_ANALYSIS_MAX_PAGES,
    purpose: 'market_analysis' as const,
  }), [operationKeywords]);
  const wingSource = useWingCatalogSource({ input: operationInput });
  const summary = buildRecommendationSummary(rows);
  const opportunities = buildRisingKeywordOpportunities(rows).slice(0, compact ? 4 : 8);
  const topProducts = sortMarketProducts(rows).slice(0, compact ? 8 : 24);
  const totals = buildMarketTotals(rows);
  const trackingSummary = {
    recentNewProductCount: rows.filter((row) => row.newEntrySignal > 0).length,
    trackedProductCount: rows.filter((row) => row.threeDaySalesTracked).length,
  };
  const priceBuckets = buildPriceBuckets(rows);
  const reviewBuckets = buildReviewBuckets(rows);

  const runMarketAnalysis = useCallback(() => {
    if (popularKeywordsQuery.isLoading) {
      setInputError('키워드 분석에서 순위 갱신을 먼저 실행해야 시장분석 후보를 만들 수 있습니다.');
      return;
    }
    if (popularKeywordsQuery.error) {
      setInputError('키워드 분석에서 순위 갱신을 먼저 실행해야 시장분석 후보를 만들 수 있습니다.');
      return;
    }
    if (operationKeywords.length === 0) {
      setInputError('키워드 분석에서 순위 갱신을 먼저 실행해야 시장분석 후보를 만들 수 있습니다.');
      return;
    }
    setInputError(null);
    void wingSource.start();
  }, [wingSource, operationKeywords.length, popularKeywordsQuery.error, popularKeywordsQuery.isLoading]);

  if (rows.length === 0) {
    return (
      <EmptyMarketState
        compact={compact}
        inputError={inputError}
        wingSource={wingSource}
        onRun={runMarketAnalysis}
      />
    );
  }

  return (
    <section className="w-full space-y-5">
      <div className="rounded-lg border border-[var(--border,#e2e8f0)] bg-[var(--surface,white)] p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[var(--primary-soft,#eef2ff)] px-3 text-xs font-bold text-[var(--primary,#6d5dfc)]">
              <BarChart3 size={14} />
              시장분석 실행 결과
            </div>
            <h2 className="mt-3 text-2xl font-black tracking-normal text-[var(--text-primary,#111827)]">
              시장 분석
            </h2>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[var(--text-secondary,#475569)]">
              키워드 분석 순위권을 Wing으로 먼저 검증하고, 통과한 상품을 오늘의 추천 후보로 넘깁니다.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <CollectionStartControl
              control={wingSource.control}
              startLabel="시장분석 다시 실행"
              onStart={runMarketAnalysis}
              onStop={wingSource.control.stop}
            />
            <Link
              href="/sourcing-ai/recommendations"
              className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-[var(--border,#e2e8f0)] bg-[var(--surface-sunken,#f8fafc)] px-4 text-xs font-black text-[var(--text-secondary,#475569)] transition hover:border-[#ffb89f] hover:text-[#d94112]"
            >
              오늘의 추천 보기
            </Link>
          </div>
        </div>
        {inputError ? <p className="mt-4 text-sm font-bold text-red-700">{inputError}</p> : null}
        <WingCatalogSourceStatus source={wingSource} />
        <div className="mt-3">
          <WingCatalogCalculationActions attempt={wingSource.attempt} />
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <SummaryMetric icon={PackageSearch} label="분석 상품" value={`${formatNumber(summary.totalCandidates)}개`} caption="중복 제거 후" />
          <SummaryMetric icon={Clock3} label="3일 신규추정" value={`${formatNumber(trackingSummary.recentNewProductCount)}개`} caption={`추적 ${formatNumber(trackingSummary.trackedProductCount)}개 기준`} />
          <SummaryMetric icon={CheckCircle2} label="A/B급" value={`${formatNumber(summary.aCount + summary.bCount)}개`} caption="소싱 검토권" />
          <SummaryMetric icon={TrendingUp} label="3일 판매추정" value={`${formatNumber(totals.sales)}개`} caption={`${formatNumber(totals.trackedSalesCount)}개 추적값 포함`} />
          <SummaryMetric icon={BarChart3} label="평균 전환율" value={formatWingCatalogRate(totals.averageConversionRate)} caption="전환율 있는 상품 평균" />
        </div>
      </div>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px] 2xl:grid-cols-[minmax(0,1fr)_320px]">
        <KeywordMarketPanel opportunities={opportunities} />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
          <DistributionCard title="판매가 분포" rows={priceBuckets} />
          {!compact && <DistributionCard title="리뷰 장벽" rows={reviewBuckets} />}
        </div>
      </section>

      <section className="rounded-lg border border-[var(--border,#e2e8f0)] bg-[var(--surface,white)] p-5 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-base font-black text-[var(--text-primary,#111827)]">상품별 시장 반응</h2>
            <p className="mt-1 text-xs font-semibold text-[var(--text-tertiary,#94a3b8)]">
              점수, 최근 3일 판매량, 전환율, 리뷰 장벽을 함께 봅니다.
            </p>
          </div>
          <span className="rounded-md bg-[var(--surface-sunken,#f8fafc)] px-3 py-2 text-xs font-black text-[var(--text-secondary,#475569)]">
            TOP {formatNumber(topProducts.length)}
          </span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {topProducts.map((row) => (
            <MarketProductCard key={marketProductKey(row)} row={row} />
          ))}
        </div>
      </section>
    </section>
  );
}

function EmptyMarketState({
  compact,
  inputError,
  wingSource,
  onRun,
}: {
  compact: boolean;
  inputError: string | null;
  wingSource: ReturnType<typeof useWingCatalogSource>;
  onRun: () => void;
}) {
  return (
    <section className="rounded-lg border border-[var(--border,#e2e8f0)] bg-[var(--surface,white)] p-8 text-center shadow-sm">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-[var(--surface-sunken,#f8fafc)] text-[var(--text-tertiary,#94a3b8)]">
        <PackageSearch size={24} />
      </div>
      <h2 className="mt-4 text-xl font-black text-[var(--text-primary,#111827)]">먼저 시장분석을 실행하세요</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm font-semibold leading-6 text-[var(--text-secondary,#475569)]">
        키워드 분석 순위권을 Wing 카탈로그로 검증한 뒤, 반응이 있는 상품을 오늘의 추천 후보로 보냅니다.
      </p>
      {!compact && (
        <div className="mt-5 flex flex-col items-center justify-center gap-2 sm:flex-row">
          <CollectionStartControl
            control={wingSource.control}
            startLabel="시장분석 시작"
            onStart={onRun}
            onStop={wingSource.control.stop}
            className="items-center"
          />
          <Link
            href="/sourcing-ai/keywords"
            className="inline-flex h-11 items-center justify-center rounded-lg border border-[var(--border,#e2e8f0)] bg-white px-5 text-sm font-black text-[var(--text-secondary,#475569)] transition hover:border-[#ffb89f] hover:text-[#d94112]"
          >
            키워드 분석 확인
          </Link>
        </div>
      )}
      {inputError ? <p className="mt-4 text-sm font-bold text-red-700">{inputError}</p> : null}
      <WingCatalogSourceStatus source={wingSource} />
      <div className="mt-3 flex justify-center">
        <WingCatalogCalculationActions attempt={wingSource.attempt} />
      </div>
    </section>
  );
}

function SummaryMetric({
  icon: Icon,
  label,
  value,
  caption,
}: {
  icon: typeof PackageSearch;
  label: string;
  value: string;
  caption: string;
}) {
  return (
    <article className="rounded-lg border border-[var(--border-subtle,#eef1f5)] bg-[var(--surface-sunken,#f8fafc)] p-4">
      <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-tertiary,#94a3b8)]">
        <Icon size={15} />
        {label}
      </div>
      <p className="mt-2 text-2xl font-black text-[var(--text-primary,#111827)]">{value}</p>
      <p className="mt-1 text-xs font-semibold text-[var(--text-secondary,#475569)]">{caption}</p>
    </article>
  );
}

function KeywordMarketPanel({
  opportunities,
}: {
  opportunities: ReturnType<typeof buildRisingKeywordOpportunities>;
}) {
  return (
    <section className="rounded-lg border border-[var(--border,#e2e8f0)] bg-[var(--surface,white)] p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-black text-[var(--text-primary,#111827)]">키워드별 시장성</h2>
          <p className="mt-1 text-xs font-semibold text-[var(--text-tertiary,#94a3b8)]">추천 상품이 붙은 키워드를 3일 관측과 판매 반응 기준으로 정렬했습니다.</p>
        </div>
        <span className="rounded-md bg-[var(--surface-sunken,#f8fafc)] px-3 py-2 text-xs font-black text-[var(--text-secondary,#475569)]">
          {formatNumber(opportunities.length)}개
        </span>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {opportunities.map((item) => (
          <article key={item.keyword} className="rounded-lg border border-[var(--border-subtle,#eef1f5)] bg-[var(--surface-sunken,#f8fafc)] p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-black text-[var(--text-primary,#111827)]">{item.keyword}</h3>
                <p className="mt-1 truncate text-[11px] font-bold text-[var(--text-tertiary,#94a3b8)]">
                  {item.topProductName ?? '대표 상품 없음'}
                </p>
              </div>
              <GradeBadge grade={item.grade} />
            </div>
            <p className="mt-3 text-2xl font-black text-[#ff5a1f]">{formatNumber(item.score)}점</p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-bold text-[var(--text-secondary,#475569)]">
              <span>후보 {formatNumber(item.candidateCount)}개</span>
              <span>3일신규 {formatNumber(item.recentNewProductCount)}개</span>
              <span>A/B {formatNumber(item.strongProductCount)}개</span>
              <span>저리뷰 {formatNumber(item.lowReviewProductCount)}개</span>
              <span>3일판매 {formatNumber(item.totalSales3d)}개</span>
            </div>
            {item.reasons.length > 0 && (
              <p className="mt-3 line-clamp-2 text-xs font-black text-[#268b7f]">
                {item.reasons.join(' · ')}
              </p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function DistributionCard({ title, rows }: { title: string; rows: DistributionRow[] }) {
  const maxCount = Math.max(1, ...rows.map((row) => row.count));

  return (
    <section className="rounded-lg border border-[var(--border,#e2e8f0)] bg-[var(--surface,white)] p-5 shadow-sm">
      <h2 className="text-base font-black text-[var(--text-primary,#111827)]">{title}</h2>
      <div className="mt-5 space-y-3">
        {rows.map((row) => (
          <div key={row.label}>
            <div className="mb-1 flex items-center justify-between gap-3 text-xs font-bold">
              <span className="text-[var(--text-secondary,#475569)]">{row.label}</span>
              <span className="text-[var(--text-primary,#111827)]">{formatNumber(row.count)}개</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-sunken,#f8fafc)]">
              <div className="h-full rounded-full bg-[#ff8a5b]" style={{ width: `${Math.round((row.count / maxCount) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function MarketProductCard({ row }: { row: TodayRecommendationRow }) {
  const imageUrl = resolveCoupangCatalogImageUrl(row.imagePath);
  const isRecentNewProduct = row.newEntrySignal > 0;

  return (
    <article className="overflow-hidden rounded-lg border border-[var(--border-subtle,#eef1f5)] bg-[var(--surface-sunken,#f8fafc)]">
      <div className="relative aspect-square bg-[var(--surface-raised,#f1f5f9)]">
        {imageUrl ? (
          <img src={imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[var(--text-tertiary,#94a3b8)]">
            <PackageSearch size={24} />
          </div>
        )}
        <span className="absolute left-3 top-3">
          <GradeBadge grade={row.grade} />
        </span>
        {isRecentNewProduct && (
          <span className="absolute right-3 top-3 rounded-md bg-[#111827] px-2 py-1 text-[11px] font-black text-white">
            3일 신규추정
          </span>
        )}
      </div>
      <div className="p-3">
        <p className="text-[11px] font-black text-[#ff5a1f]">{row.primaryKeyword}</p>
        <h3 className="mt-1 line-clamp-2 min-h-10 text-sm font-black leading-5 text-[var(--text-primary,#111827)]">
          {row.productName}
        </h3>
        <div className="mt-3 grid grid-cols-2 gap-1.5">
          <SmallMetric label="점수" value={`${formatNumber(row.score)}점`} strong />
          <SmallMetric label="판매가" value={formatPrice(row.salePrice)} />
          <SmallMetric
            label="3일 판매"
            value={resolveSalesLast3d(row) == null ? '-' : `${formatNumber(resolveSalesLast3d(row))}개`}
          />
          <SmallMetric label="전환율" value={formatWingCatalogRate(row.conversionRate28d)} />
          <SmallMetric label="리뷰" value={`${formatNumber(row.ratingCount)}개`} />
          <SmallMetric label="첫관측" value="-" />
        </div>
        {(row.reasons.length > 0 || row.risks.length > 0) && (
          <div className="mt-3 space-y-1">
            {row.reasons.slice(0, 1).map((reason) => (
              <p key={reason} className="line-clamp-1 text-xs font-black text-[#268b7f]">{reason}</p>
            ))}
            {row.risks.slice(0, 1).map((risk) => (
              <p key={risk} className="line-clamp-1 text-xs font-bold text-amber-700">{risk}</p>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

function SmallMetric({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn('rounded-md bg-white px-2.5 py-2 ring-1 ring-[var(--border-subtle,#eef1f5)]', strong && 'bg-[#fff4ee] ring-[#ffd6c6]')}>
      <p className="text-[10px] font-bold leading-none text-[var(--text-tertiary,#94a3b8)]">{label}</p>
      <p className={cn('mt-1 truncate text-xs font-black text-[var(--text-primary,#111827)]', strong && 'text-[#ff5a1f]')}>{value}</p>
    </div>
  );
}

function GradeBadge({ grade }: { grade: RecommendationGrade }) {
  return (
    <span className={cn('inline-flex h-7 min-w-10 items-center justify-center rounded-md px-2 text-xs font-black', gradeClass(grade))}>
      {grade}
    </span>
  );
}

function gradeClass(grade: RecommendationGrade): string {
  if (grade === 'A') return 'bg-green-100 text-green-700';
  if (grade === 'B') return 'bg-blue-100 text-blue-700';
  if (grade === 'C') return 'bg-amber-100 text-amber-700';
  if (grade === 'WATCH') return 'bg-slate-100 text-slate-700';
  return 'bg-red-100 text-red-700';
}

function sortMarketProducts(rows: TodayRecommendationRow[]): TodayRecommendationRow[] {
  const gradeWeight: Record<RecommendationGrade, number> = {
    A: 5,
    B: 4,
    C: 3,
    WATCH: 2,
  };

  return [...rows].sort((a, b) => (
    gradeWeight[b.grade] - gradeWeight[a.grade] ||
    b.score - a.score ||
    (resolveSalesLast3d(b) ?? -1) - (resolveSalesLast3d(a) ?? -1) ||
    (b.marketReactionSignal ?? 0) - (a.marketReactionSignal ?? 0)
  ));
}

function buildMarketTotals(rows: TodayRecommendationRow[]) {
  const sales = rows.reduce((sum, row) => sum + (resolveSalesLast3d(row) ?? 0), 0);
  const trackedSalesCount = rows.filter((row) => row.threeDaySalesTracked).length;
  const conversions = rows
    .map((row) => row.conversionRate28d)
    .filter((value): value is number => value != null);

  return {
    sales,
    trackedSalesCount,
    averageConversionRate: conversions.length === 0
      ? null
      : conversions.reduce((sum, value) => sum + value, 0) / conversions.length,
  };
}

interface DistributionRow {
  label: string;
  count: number;
}

function buildPriceBuckets(rows: TodayRecommendationRow[]): DistributionRow[] {
  const buckets = [
    { label: '~7천원', match: (value: number | null) => value != null && value < 7000 },
    { label: '7천~1만원', match: (value: number | null) => value != null && value >= 7000 && value < 10000 },
    { label: '1만~2만원', match: (value: number | null) => value != null && value >= 10000 && value < 20000 },
    { label: '2만~4만원', match: (value: number | null) => value != null && value >= 20000 && value < 40000 },
    { label: '4만원+', match: (value: number | null) => value != null && value >= 40000 },
    { label: '가격 없음', match: (value: number | null) => value == null },
  ];

  return buckets.map((bucket) => ({
    label: bucket.label,
    count: rows.filter((row) => bucket.match(row.salePrice)).length,
  }));
}

function buildReviewBuckets(rows: TodayRecommendationRow[]): DistributionRow[] {
  const buckets = [
    { label: '리뷰 50 이하', match: (value: number | null) => value != null && value <= 50 },
    { label: '51~300', match: (value: number | null) => value != null && value > 50 && value <= 300 },
    { label: '301~1000', match: (value: number | null) => value != null && value > 300 && value <= 1000 },
    { label: '1000 초과', match: (value: number | null) => value != null && value > 1000 },
    { label: '리뷰 없음', match: (value: number | null) => value == null },
  ];

  return buckets.map((bucket) => ({
    label: bucket.label,
    count: rows.filter((row) => bucket.match(row.ratingCount)).length,
  }));
}

function formatPrice(value: number | null | undefined): string {
  return value == null ? '-' : `${formatKRW(value)}원`;
}

function marketProductKey(row: Pick<TodayRecommendationRow, 'productId' | 'itemId' | 'vendorItemId'>): string {
  return `${row.productId}:${row.itemId ?? ''}:${row.vendorItemId ?? ''}`;
}

function resolveSalesLast3d(row: TodayRecommendationRow): number | null {
  return row.salesLast3d;
}
