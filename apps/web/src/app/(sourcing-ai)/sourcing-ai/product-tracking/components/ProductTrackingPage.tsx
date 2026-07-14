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
  PackageSearch,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { cn, formatDateTime, formatKRW, formatNumber } from '@/lib/utils';
import { isApiError } from '@/lib/api-error';
import { isChromeExtensionRuntimeAvailable } from '@/lib/extension-bridge';
import {
  deleteWingTrackedProduct,
  ingestWingTrackedSnapshots,
  listWingTrackedProducts,
  type IngestWingSnapshotItem,
  type WingTrackedProduct,
} from '../../lib/wing-tracking-api';
import {
  resolveCoupangCatalogImageUrl,
  searchWingCatalogProducts,
} from '../../wing-catalog/lib/wing-catalog-extension';
import { buildCoupangProductUrl } from '../../wing-catalog/lib/wing-catalog-delivery';
import { WingTrackedHistoryChart } from './WingTrackedHistoryChart';

const TRACKED_QUERY_KEY = ['wing-tracked-products'];

export function ProductTrackingPage() {
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const { data: products = [], isLoading } = useQuery({
    queryKey: TRACKED_QUERY_KEY,
    queryFn: listWingTrackedProducts,
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => deleteWingTrackedProduct(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: TRACKED_QUERY_KEY });
      toast.success('추적을 해제했습니다');
    },
    onError: (error) =>
      toast.error(isApiError(error) ? error.message : '추적 해제에 실패했습니다'),
  });

  const handleRefresh = async () => {
    if (products.length === 0) return;
    if (!isChromeExtensionRuntimeAvailable()) {
      toast.error('지표 갱신은 Chrome 확장에서 실행됩니다', {
        description: 'Chrome에서 이 페이지를 열고 다시 시도하세요.',
      });
      return;
    }
    setRefreshing(true);
    try {
      const captured = await refreshTrackedMetrics(products);
      await queryClient.invalidateQueries({ queryKey: TRACKED_QUERY_KEY });
      products.forEach((product) =>
        queryClient.invalidateQueries({ queryKey: ['wing-tracked-history', product.id] }),
      );
      toast.success(
        captured > 0 ? `${captured}개 상품 지표를 갱신했습니다` : '갱신할 지표를 찾지 못했습니다',
      );
    } catch (error) {
      toast.error(isApiError(error) ? error.message : '지표 갱신에 실패했습니다');
    } finally {
      setRefreshing(false);
    }
  };

  const keywordCount = useMemo(
    () => new Set(products.map((product) => product.sourceKeyword).filter(Boolean)).size,
    [products],
  );

  return (
    <main className="min-h-full bg-[var(--surface-sunken)] text-[var(--text-primary)]">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-5 py-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
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
              추적 상품 {formatNumber(products.length)}개 · 키워드 {formatNumber(keywordCount)}개 · 일별 지표 추이를 확인하세요
            </p>
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing || products.length === 0}
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#ff5a1f] px-4 text-sm font-black text-white transition hover:bg-[#ef4f18] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {refreshing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            지표 새로고침
          </button>
        </header>

        {isLoading ? (
          <div className="flex h-64 items-center justify-center text-[var(--text-tertiary)]">
            <Loader2 size={22} className="animate-spin" />
          </div>
        ) : products.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="flex flex-col gap-3">
            {products.map((product) => (
              <TrackedProductCard
                key={product.id}
                product={product}
                expanded={expandedId === product.id}
                onToggle={() => setExpandedId((prev) => (prev === product.id ? null : product.id))}
                onRemove={() => removeMutation.mutate(product.id)}
                removing={removeMutation.isPending && removeMutation.variables === product.id}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] px-6 py-16 text-center">
      <PackageSearch size={30} className="text-[var(--text-tertiary)]" />
      <p className="text-base font-black">추적 중인 상품이 없습니다</p>
      <p className="max-w-md text-sm font-semibold text-[var(--text-tertiary)]">
        쿠팡 상품 분석에서 상품을 검색하고 <span className="font-black text-[#ff5a1f]">추적</span> 버튼을 누르면 여기에서 일별 지표 추이를 볼 수 있어요.
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
  product,
  expanded,
  onToggle,
  onRemove,
  removing,
}: {
  product: WingTrackedProduct;
  expanded: boolean;
  onToggle: () => void;
  onRemove: () => void;
  removing: boolean;
}) {
  const imageUrl = resolveCoupangCatalogImageUrl(product.imagePath);
  const productUrl = buildCoupangProductUrl(product);
  const latest = product.latestSnapshot;

  return (
    <article className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
      <div className="flex items-start gap-4 p-4">
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
                  <ExternalLink size={13} className="mt-1 shrink-0 text-[var(--text-tertiary)] group-hover:text-[#ff5a1f]" />
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
            <Metric label="판매가" value={latest?.salePriceKrw != null ? `${formatKRW(latest.salePriceKrw)}원` : '-'} />
            <Metric label="28일 판매량" value={latest?.salesLast28d != null ? `${formatNumber(latest.salesLast28d)}개` : '-'} />
            <Metric label="28일 매출" value={latest?.estimatedRevenue28d != null ? `${formatKRW(latest.estimatedRevenue28d)}원` : '-'} accent />
            <Metric label="전환율" value={latest?.conversionRate28d != null ? `${(latest.conversionRate28d * 100).toFixed(1)}%` : '-'} />
            <Metric label="리뷰수" value={latest?.ratingCount != null ? `${formatNumber(latest.ratingCount)}개` : '-'} />
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-center gap-1 border-t border-[var(--border)] bg-[var(--surface-sunken)] py-2 text-xs font-black text-[var(--text-secondary)] transition hover:bg-[var(--surface)]"
      >
        {expanded ? '추이 접기' : '추이 그래프 보기'}
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {expanded && (
        <div className="p-4">
          <WingTrackedHistoryChart trackedProductId={product.id} />
        </div>
      )}
    </article>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg bg-[var(--surface-sunken)] px-2.5 py-2 text-center">
      <p className="text-[11px] font-bold text-[var(--text-tertiary)]">{label}</p>
      <p className={cn('mt-0.5 text-sm font-black', accent ? 'text-[#358f8a]' : 'text-[var(--text-primary)]')}>
        {value}
      </p>
    </div>
  );
}

/** 추적 상품들의 sourceKeyword 를 재검색해 카탈로그 최신 지표를 스냅샷으로 적재. */
async function refreshTrackedMetrics(products: WingTrackedProduct[]): Promise<number> {
  const keywords = [...new Set(products.map((product) => product.sourceKeyword).filter(isNonEmpty))];
  const trackedProductIds = new Set(products.map((product) => product.productId));
  const items: IngestWingSnapshotItem[] = [];

  for (const keyword of keywords) {
    const response = await searchWingCatalogProducts({ keyword, maxPages: 2 });
    for (const row of response.rows ?? []) {
      if (!trackedProductIds.has(row.productId)) continue;
      items.push({
        productId: row.productId,
        sourceKeyword: keyword,
        salePriceKrw: row.salePrice,
        ratingCount: row.ratingCount,
        ratingAverage: row.rating,
        pvLast28Day: row.pvLast28Day,
        salesLast28d: row.salesLast28d,
        estimatedRevenue28d: row.estimatedRevenue28d,
        conversionRate28d: row.conversionRate28d,
      });
    }
  }

  if (items.length === 0) return 0;
  const result = await ingestWingTrackedSnapshots(items);
  return result.captured;
}

function isNonEmpty(value: string | null): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
