'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  Minus,
  PackageSearch,
  TrendingDown,
  TrendingUp,
  Trash2,
} from 'lucide-react';
import { cn, formatDateTime, formatKRW, formatNumber } from '@/lib/utils';
import { isApiError } from '@/lib/api-error';
import { CollectionStartControl } from '@/components/collection/CollectionStartControl';
import { useCollectionSourceControl } from '@/hooks/use-collection-source-control';
import { COLLECTION_STOPPED_MESSAGE } from '@/lib/collection-source-status-query';
import { useWingSearchAccountRead } from '@/lib/wing-search-account';
import { queryKeys } from '@/lib/query-keys';
import {
  deleteWingTrackedProduct,
  fetchWingTrackedHistories,
  listWingTrackedProducts,
  type WingTrackedProduct,
  type WingTrackedSnapshot,
} from '../../lib/wing-tracking-api';
import {
  wingTrackedCollectionSummary,
  wingTrackedProductsCollection,
  type WingTrackedCollectionSummary,
} from '../../lib/wing-tracked-products-collection';
import {
  resolveCoupangCatalogImageUrl,
} from '../../wing-catalog/lib/wing-catalog-presenter';
import { buildCoupangProductUrl } from '../../wing-catalog/lib/wing-catalog-delivery';
import {
  computeWindowTrend,
  scoreTone,
  TRACKING_WINDOWS,
  type TrackingWindow,
  type WindowTrend,
} from '../lib/wing-tracking-score';
import { normalizeWingOperationKeywords } from '../../lib/wing-operation-input';
import { WingTrackedHistoryChart, TrendSparkline } from './WingTrackedHistoryChart';
import { attemptFailureText } from '@/lib/operator-error';

const TRACKED_QUERY_KEY = queryKeys.sourcing.wingTrackedProducts();

interface RankedProduct {
  product: WingTrackedProduct;
  points: WingTrackedSnapshot[];
  trend: WindowTrend;
  rank: number;
}

export function ProductTrackingPage() {
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [windowDays, setWindowDays] = useState<TrackingWindow>(7);

  const { data: products = [], isLoading } = useQuery({
    queryKey: TRACKED_QUERY_KEY,
    queryFn: listWingTrackedProducts,
  });

  const { data: histories, isLoading: historyLoading } = useQuery({
    queryKey: queryKeys.sourcing.wingTrackedHistories(30),
    queryFn: () => fetchWingTrackedHistories(30),
  });
  // 지표 새로고침 = 실행 kind `advertising.wing_tracked_products`(KID-362). 계정은 조직의 대표 쿠팡 계정이다.
  const wingAccount = useWingSearchAccountRead();
  const trackedAdapter = useMemo(() => wingTrackedProductsCollection(wingAccount), [wingAccount]);
  const trackedSource = useCollectionSourceControl(trackedAdapter);
  const sourceStatus = trackedSource.status ? wingTrackedCollectionSummary(trackedSource.status) : undefined;
  const historyByTrackedProductId = useMemo(
    () => new Map(
      (histories?.items ?? []).map((history) => [history.trackedProductId, history.points]),
    ),
    [histories?.items],
  );

  const ranked = useMemo<RankedProduct[]>(() => {
    return products
      .map((product) => {
        const points = historyByTrackedProductId.get(product.id) ?? [];
        return { product, points, trend: computeWindowTrend(points, windowDays) };
      })
      .sort((a, b) => (b.trend.score ?? -1) - (a.trend.score ?? -1))
      .map((entry, index) => ({ ...entry, rank: index + 1 }));
  }, [historyByTrackedProductId, products, windowDays]);

  const removeMutation = useMutation({
    mutationFn: (id: string) => deleteWingTrackedProduct(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: TRACKED_QUERY_KEY });
      toast.success('추적을 해제했습니다');
    },
    onError: (error) =>
      toast.error(isApiError(error) ? error.message : '추적 해제에 실패했습니다'),
  });

  const enabledProducts = useMemo(
    () => products.filter((product) => product.enabled),
    [products],
  );
  const refreshKeywords = useMemo(
    () => normalizeWingOperationKeywords(
      enabledProducts.map((product) => product.sourceKeyword),
      13,
    ),
    [enabledProducts],
  );
  const handleRefresh = () => {
    if (enabledProducts.length === 0) {
      toast.error('갱신할 활성 추적 상품이 없습니다');
      return;
    }
    if (refreshKeywords.length === 0) {
      toast.error('활성 추적 상품에 수집 키워드를 설정한 뒤 다시 시도해주세요');
      return;
    }
    if (refreshKeywords.length > 12) {
      toast.error('한 번에 수집할 수 있는 추적 키워드는 최대 12개입니다');
      return;
    }
    trackedSource.start(refreshKeywords);
  };

  const keywordCount = useMemo(
    () => new Set(products.map((product) => product.sourceKeyword).filter(Boolean)).size,
    [products],
  );

  return (
    <main className="min-h-full bg-[var(--surface-sunken)] text-[var(--text-primary)]">
      <div className="flex w-full flex-col gap-5">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Link
              href="/sourcing-ai/wing-catalog"
              className="mb-2 inline-flex items-center gap-1 text-xs font-black text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
            >
              <ArrowLeft size={13} />
              쿠팡 상품 분석으로
            </Link>
            <h1 className="text-3xl font-black tracking-tight">상품 추적</h1>
            <p className="mt-1 text-sm font-bold text-[var(--text-tertiary)]">
              추적 상품 {formatNumber(products.length)}개 · 키워드 {formatNumber(keywordCount)}개 ·{' '}
              모멘텀 점수 높은 순
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <WindowToggle value={windowDays} onChange={setWindowDays} />
            <CollectionStartControl
              control={trackedSource}
              startLabel="지표 새로고침"
              startTitle="활성 추적 상품의 키워드로 Wing 지표를 새로 받습니다."
              onStart={handleRefresh}
              onStop={trackedSource.stop}
            />
          </div>
        </header>

        <TrackedWingSourceStatus source={sourceStatus} />

        {isLoading ? (
          <div className="flex h-64 items-center justify-center text-[var(--text-tertiary)]">
            <Loader2 size={22} className="animate-spin" />
          </div>
        ) : products.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <ScoreLegend windowDays={windowDays} loading={historyLoading} />
            <div className="flex flex-col gap-3">
              {ranked.map((entry) => (
                <TrackedProductCard
                  key={entry.product.id}
                  entry={entry}
                  windowDays={windowDays}
                  expanded={expandedId === entry.product.id}
                  onToggle={() =>
                    setExpandedId((prev) => (prev === entry.product.id ? null : entry.product.id))
                  }
                  onRemove={() => removeMutation.mutate(entry.product.id)}
                  removing={
                    removeMutation.isPending && removeMutation.variables === entry.product.id
                  }
                />
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function WindowToggle({
  value,
  onChange,
}: {
  value: TrackingWindow;
  onChange: (next: TrackingWindow) => void;
}) {
  return (
    <div
      role="group"
      aria-label="추이 기간"
      className="inline-flex items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1"
    >
      {TRACKING_WINDOWS.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          onClick={() => onChange(option)}
          className={cn(
            'rounded-md px-3.5 py-2 text-xs font-black transition',
            value === option
              ? 'bg-[#ff5a1f] text-white'
              : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]',
          )}
        >
          {option}일
        </button>
      ))}
    </div>
  );
}

function ScoreLegend({ windowDays, loading }: { windowDays: number; loading: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-[11px] font-bold text-[var(--text-tertiary)]">
      <span className="text-[var(--text-secondary)]">
        모멘텀 점수 = 최근 {windowDays}일 변화 가중 (판매량 35 · 매출 30 · 전환율 20 · 리뷰 15)
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="h-2 w-2 rounded-full bg-emerald-500" /> 상승 66+
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="h-2 w-2 rounded-full bg-amber-500" /> 유지 45–65
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="h-2 w-2 rounded-full bg-rose-500" /> 둔화 44−
      </span>
      {loading && (
        <span className="inline-flex items-center gap-1 text-[var(--text-quaternary)]">
          <Loader2 size={11} className="animate-spin" /> 추이 불러오는 중
        </span>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] px-6 py-16 text-center">
      <PackageSearch size={30} className="text-[var(--text-tertiary)]" />
      <p className="text-base font-black">추적 중인 상품이 없습니다</p>
      <p className="max-w-md text-sm font-semibold text-[var(--text-tertiary)]">
        쿠팡 상품 분석에서 상품을 검색하고{' '}
        <span className="font-black text-[#ff5a1f]">추적</span> 버튼을 누르면 여기에서 일별 지표
        추이를 볼 수 있어요.
      </p>
      <Link
        href="/sourcing-ai/wing-catalog"
        className="mt-2 inline-flex h-10 items-center gap-2 rounded-lg bg-[#ff5a1f] px-4 text-sm font-black text-white transition hover:bg-[#ef4f18]"
      >
        쿠팡 상품 분석 열기
      </Link>
    </div>
  );
}

function TrackedProductCard({
  entry,
  windowDays,
  expanded,
  onToggle,
  onRemove,
  removing,
}: {
  entry: RankedProduct;
  windowDays: TrackingWindow;
  expanded: boolean;
  onToggle: () => void;
  onRemove: () => void;
  removing: boolean;
}) {
  const { product, points, trend, rank } = entry;
  const imageUrl = resolveCoupangCatalogImageUrl(product.imagePath);
  const productUrl = buildCoupangProductUrl(product);
  const latest = product.latestSnapshot;

  return (
    <article className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
      <div className="flex items-stretch gap-4 p-4">
        <RankBadge rank={rank} />

        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-sunken)]">
          {imageUrl ? (
            <img src={imageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <PackageSearch size={22} className="text-[var(--text-tertiary)]" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {productUrl ? (
                <a
                  href={productUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group inline-flex items-start gap-1 font-black leading-6 text-[var(--text-primary)] hover:text-[#ff5a1f]"
                >
                  <span className="line-clamp-1">{product.productName}</span>
                  <ExternalLink
                    size={13}
                    className="mt-1 shrink-0 text-[var(--text-tertiary)] group-hover:text-[#ff5a1f]"
                  />
                </a>
              ) : (
                <p className="line-clamp-1 font-black leading-6">{product.productName}</p>
              )}
              <p className="mt-0.5 text-xs font-semibold text-[var(--text-tertiary)]">
                {product.sourceKeyword ? `키워드 «${product.sourceKeyword}» · ` : ''}
                {product.lastCapturedAt ? `${formatDateTime(product.lastCapturedAt)} 갱신` : '갱신 대기'}
              </p>
            </div>
            <button
              type="button"
              onClick={onRemove}
              disabled={removing}
              className="shrink-0 rounded-lg p-1.5 text-[var(--text-tertiary)] transition hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
              aria-label="추적 해제"
            >
              {removing ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
            </button>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
            <MetricCell
              label="판매가"
              value={latest?.salePriceKrw != null ? `${formatKRW(latest.salePriceKrw)}원` : '-'}
              change={trend.price.changePct}
              unit="%"
            />
            <MetricCell
              label="28일 판매량"
              value={latest?.salesLast28d != null ? `${formatNumber(latest.salesLast28d)}개` : '-'}
              change={trend.sales.changePct}
              unit="%"
            />
            <MetricCell
              label="28일 매출"
              value={
                latest?.estimatedRevenue28d != null
                  ? `${formatKRW(latest.estimatedRevenue28d)}원`
                  : '-'
              }
              change={trend.revenue.changePct}
              unit="%"
              accent
            />
            <MetricCell
              label="전환율"
              value={
                latest?.conversionRate28d != null
                  ? `${(latest.conversionRate28d * 100).toFixed(1)}%`
                  : '-'
              }
              change={trend.conversionChangePp}
              unit="%p"
            />
            <MetricCell
              label="리뷰수"
              value={latest?.ratingCount != null ? `${formatNumber(latest.ratingCount)}개` : '-'}
              change={trend.reviews.changePct}
              unit="%"
            />
          </div>
        </div>

        <ScorePanel score={trend.score} />

        <div className="hidden w-40 shrink-0 flex-col justify-center gap-1 xl:flex">
          <p className="text-[10px] font-bold text-[var(--text-tertiary)]">
            매출 추이 · 최근 {windowDays}일
          </p>
          <div className="min-h-[56px] flex-1 rounded-lg bg-[var(--surface-sunken)] p-1">
            <TrendSparkline points={points} windowDays={windowDays} />
          </div>
          <p className="text-[10px] font-semibold text-[var(--text-quaternary)]">
            {trend.hasData && trend.fromDate && trend.toDate
              ? `${shortDate(trend.fromDate)}→${shortDate(trend.toDate)} · ${trend.spanDays}일 실측`
              : '스냅샷 2개 이상 필요'}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-center gap-1 border-t border-[var(--border)] bg-[var(--surface-sunken)] py-2 text-xs font-black text-[var(--text-secondary)] transition hover:bg-[var(--surface)]"
      >
        {expanded ? '추이 접기' : '지표별 추이 그래프'}
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {expanded && (
        <div className="p-4">
          <WingTrackedHistoryChart trackedProductId={product.id} windowDays={windowDays} />
        </div>
      )}
    </article>
  );
}

function RankBadge({ rank }: { rank: number }) {
  return (
    <div className="flex w-9 shrink-0 flex-col items-center justify-center">
      <span className="text-[10px] font-bold text-[var(--text-tertiary)]">순위</span>
      <span
        className={cn(
          'text-2xl font-black tabular-nums leading-none',
          rank === 1 ? 'text-[#ff5a1f]' : 'text-[var(--text-secondary)]',
        )}
      >
        {rank}
      </span>
    </div>
  );
}

function ScorePanel({ score }: { score: number | null }) {
  const tone = scoreTone(score);
  return (
    <div
      className={cn(
        'flex w-24 shrink-0 flex-col items-center justify-center rounded-xl px-2 py-3',
        tone.className,
      )}
    >
      <p className="text-[10px] font-bold uppercase tracking-wide opacity-80">모멘텀</p>
      <p className="text-3xl font-black tabular-nums leading-none">{score ?? '—'}</p>
      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-black/10">
        <div className={cn('h-full rounded-full', tone.barClassName)} style={{ width: `${score ?? 0}%` }} />
      </div>
      <p className="mt-1 text-[10px] font-black">{tone.label}</p>
    </div>
  );
}

function MetricCell({
  label,
  value,
  change,
  unit,
  accent,
}: {
  label: string;
  value: string;
  change: number | null;
  unit: '%' | '%p';
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg bg-[var(--surface-sunken)] px-2.5 py-2 text-center">
      <p className="text-[11px] font-bold text-[var(--text-tertiary)]">{label}</p>
      <p
        className={cn(
          'mt-0.5 text-sm font-black',
          accent ? 'text-[#358f8a]' : 'text-[var(--text-primary)]',
        )}
      >
        {value}
      </p>
      <ChangeBadge change={change} unit={unit} />
    </div>
  );
}

function ChangeBadge({ change, unit }: { change: number | null; unit: '%' | '%p' }) {
  if (change == null) {
    return <span className="mt-0.5 block text-[10px] font-bold text-[var(--text-quaternary)]">—</span>;
  }
  const rounded = unit === '%p' ? change.toFixed(1) : Math.round(change);
  const isFlat = Math.abs(Number(rounded)) < (unit === '%p' ? 0.05 : 0.5);
  const Icon = isFlat ? Minus : change > 0 ? TrendingUp : TrendingDown;
  const color = isFlat
    ? 'text-[var(--text-quaternary)]'
    : change > 0
      ? 'text-emerald-600'
      : 'text-rose-600';
  const sign = !isFlat && change > 0 ? '+' : '';
  return (
    <span className={cn('mt-0.5 inline-flex items-center gap-0.5 text-[10px] font-black', color)}>
      <Icon size={11} />
      {sign}
      {rounded}
      {unit}
    </span>
  );
}

function shortDate(businessDate: string): string {
  return businessDate.slice(5, 10);
}

function TrackedWingSourceStatus({
  source,
}: {
  source: WingTrackedCollectionSummary | undefined;
}) {
  if (!source) return null;
  const { latest, lastSucceeded } = source;
  const summary = lastSucceeded ? '완료된 추적 스냅샷 있음' : '완료된 추적 스냅샷 없음';
  const running = latest?.status === 'executing' || latest?.status === 'prepared';
  const stopped = latest?.status === 'cancelled';
  return (
    <section
      aria-label="추적 Wing 수집 상태"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-xs font-bold text-[var(--text-tertiary)]"
    >
      <span className="text-[var(--text-secondary)]">{summary}</span>
      {running && <span>새 수집 진행 중</span>}
      {stopped && <span className="text-[var(--text-secondary)]">{COLLECTION_STOPPED_MESSAGE}</span>}
      {latest?.status === 'failed' && (
        <span role="alert" className="text-rose-600">
          마지막 수집 실패: {attemptFailureText(latest, 'wing_tracked_product')}
        </span>
      )}
      {lastSucceeded?.finishedAt && (
        <span>
          마지막 완료 {formatDateTime(lastSucceeded.finishedAt)}
          {lastSucceeded.summary ? ` · 추적 ${formatNumber(lastSucceeded.summary.capturedProductCount)}개` : ''}
        </span>
      )}
    </section>
  );
}
