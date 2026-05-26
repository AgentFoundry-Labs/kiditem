'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowDownToLine,
  ChevronUp,
  Loader2,
  PackageSearch,
  Search,
  type LucideIcon,
} from 'lucide-react';
import { cn, formatDateTime, formatKRW, formatNumber } from '@/lib/utils';
import {
  buildWingCatalogSummary,
  formatWingCatalogRate,
  resolveCoupangCatalogImageUrl,
  searchWingCatalogProducts,
  sortWingCatalogRows,
  type WingCatalogProduct,
  type WingCatalogSearchResponse,
  type WingCatalogSortKey,
} from '../lib/wing-catalog-extension';
import {
  buildAutocompleteKeywordCandidates,
  buildProductNameKeywordFrequencies,
  buildRelatedKeywordCandidates,
  type KeywordFrequency,
} from '../lib/wing-catalog-keyword-insights';
import {
  searchNaverRelatedKeywords,
  type NaverRelatedKeyword,
} from '../../recommendations/lib/naver-keyword-api';

const sortOptions: Array<{ value: WingCatalogSortKey; label: string }> = [
  { value: 'sales', label: '판매량순' },
  { value: 'revenue', label: '매출순' },
  { value: 'views', label: '클릭순' },
  { value: 'conversion', label: '전환율순' },
  { value: 'reviews', label: '리뷰순' },
];

const pageOptions = [1, 2, 3, 5];
const analysisTabs = ['쿠팡 분석', '네이버 분석', '연관 키워드'];

export function WingCatalogPage() {
  const [keyword, setKeyword] = useState('슬라임');
  const [maxPages, setMaxPages] = useState(2);
  const [sortKey, setSortKey] = useState<WingCatalogSortKey>('sales');
  const [result, setResult] = useState<WingCatalogSearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [naverRelatedKeywords, setNaverRelatedKeywords] = useState<NaverRelatedKeyword[]>([]);
  const [relatedKeywordNotice, setRelatedKeywordNotice] = useState<string | null>(null);
  const [loadingRelatedKeywords, setLoadingRelatedKeywords] = useState(false);

  const rows = useMemo(() => sortWingCatalogRows(result?.rows ?? [], sortKey), [result?.rows, sortKey]);
  const summary = useMemo(() => buildWingCatalogSummary(result?.rows ?? []), [result?.rows]);
  const topProduct = rows[0] ?? null;
  const deliverySummary = useMemo(() => buildDeliverySummary(rows), [rows]);
  const priceBuckets = useMemo(() => buildPriceBuckets(rows), [rows]);
  const stripMetrics = useMemo(() => buildStripMetrics(rows, summary), [rows, summary]);
  const analyzedKeyword = result?.keyword ?? keyword;
  const productNameKeywords = useMemo(
    () => buildProductNameKeywordFrequencies(rows, analyzedKeyword, 10),
    [analyzedKeyword, rows],
  );
  const popularKeywordRows = useMemo(
    () => buildPopularKeywordRows(naverRelatedKeywords, productNameKeywords),
    [naverRelatedKeywords, productNameKeywords],
  );
  const relatedKeywordRows = useMemo(
    () => buildRelatedKeywordCandidates({
      seedKeyword: analyzedKeyword,
      searchAdKeywords: naverRelatedKeywords.map((item) => item.keyword),
      productNameKeywords: productNameKeywords.map((item) => item.keyword),
      limit: 10,
    }),
    [analyzedKeyword, naverRelatedKeywords, productNameKeywords],
  );
  const autocompleteKeywords = useMemo(
    () => buildAutocompleteKeywordCandidates({
      seedKeyword: analyzedKeyword,
      relatedKeywords: relatedKeywordRows,
      limit: 10,
    }),
    [analyzedKeyword, relatedKeywordRows],
  );

  useEffect(() => {
    const seedKeyword = result?.keyword?.trim();
    if (!seedKeyword) {
      setNaverRelatedKeywords([]);
      setRelatedKeywordNotice(null);
      return;
    }

    let cancelled = false;
    setLoadingRelatedKeywords(true);
    setRelatedKeywordNotice(null);
    searchNaverRelatedKeywords({ seedKeywords: [seedKeyword], maxResults: 30 })
      .then((response) => {
        if (cancelled) return;
        setNaverRelatedKeywords(response.items);
        setRelatedKeywordNotice(response.items.length > 0 ? null : '네이버 연관 키워드가 비어 있어 상품명 기반 후보를 보여줍니다.');
      })
      .catch((relatedError) => {
        if (cancelled) return;
        setNaverRelatedKeywords([]);
        setRelatedKeywordNotice(relatedError instanceof Error ? relatedError.message : String(relatedError));
      })
      .finally(() => {
        if (!cancelled) setLoadingRelatedKeywords(false);
      });

    return () => {
      cancelled = true;
    };
  }, [result?.keyword]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSearching(true);
    try {
      const response = await searchWingCatalogProducts({ keyword, maxPages });
      setResult(response);
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : String(searchError));
    } finally {
      setIsSearching(false);
    }
  };

  const handleDownload = () => {
    if (!result) return;
    const safeKeyword = (result.keyword ?? keyword).replace(/[^\w가-힣-]+/g, '-');
    downloadCsv(`wing-catalog-${safeKeyword}.csv`, rows);
  };

  return (
    <main className="min-h-full bg-[var(--surface-sunken)] text-[var(--text-primary)]">
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-5 px-5 py-6">
        <header className="px-4 pb-1 pt-3 text-center">
          <h1 className="inline-block bg-gradient-to-r from-[#ff5a1f] via-[#ff7a36] to-[#ffb14a] bg-clip-text text-5xl font-black tracking-normal text-transparent md:text-6xl">
            쿠팡 상품 분석
          </h1>
        </header>

        <header className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
          <form onSubmit={handleSubmit} className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_120px_120px_132px]">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" size={17} />
              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                className="h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-sunken)] pl-10 pr-3 text-sm font-bold outline-none transition focus:border-[var(--primary)]"
                placeholder="키워드 입력"
              />
            </label>
            <select
              value={maxPages}
              onChange={(event) => setMaxPages(Number(event.target.value))}
              className="h-11 rounded-lg border border-[var(--border)] bg-[var(--surface-sunken)] px-3 text-sm font-bold outline-none focus:border-[var(--primary)]"
            >
              {pageOptions.map((page) => (
                <option key={page} value={page}>
                  {page}페이지
                </option>
              ))}
            </select>
            <select
              value={sortKey}
              onChange={(event) => setSortKey(event.target.value as WingCatalogSortKey)}
              className="h-11 rounded-lg border border-[var(--border)] bg-[var(--surface-sunken)] px-3 text-sm font-bold outline-none focus:border-[var(--primary)]"
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={isSearching}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#ff5a1f] px-4 text-sm font-black text-white transition hover:bg-[#ef4f18] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSearching ? <Loader2 size={17} className="animate-spin" /> : <PackageSearch size={17} />}
              분석
            </button>
          </form>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-[var(--text-tertiary)]">
            <span>Wing 카탈로그 매칭 API</span>
            <span>최근 28일 지표</span>
            {result?.endedAt && <span>{formatDateTime(result.endedAt)} 기준</span>}
          </div>
        </header>

        <nav className="mx-auto grid w-full max-w-[760px] grid-cols-3 rounded-xl bg-[var(--surface)] p-2 shadow-sm">
          {analysisTabs.map((tab, index) => (
            <button
              key={tab}
              type="button"
              className={cn(
                'h-14 rounded-lg text-base font-black transition md:text-lg',
                index === 0
                  ? 'bg-[var(--surface-raised)] text-[#ff5a1f] shadow-sm'
                  : 'text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]',
              )}
            >
              {tab}
            </button>
          ))}
        </nav>

        {error && (
          <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
            <AlertCircle className="mt-0.5 shrink-0" size={18} />
            <div>
              <p className="font-black">검색 실패</p>
              <p className="mt-1">{error}</p>
            </div>
          </div>
        )}

        <section className="grid gap-5 xl:grid-cols-[270px_minmax(0,1fr)_300px] 2xl:grid-cols-[290px_minmax(0,1fr)_310px]">
          <DeliveryCard summary={deliverySummary} hasRows={rows.length > 0} />
          <HeroAnalysisCard product={topProduct} rows={rows} summary={summary} keyword={result?.keyword ?? keyword} />
          <PriceDistributionCard buckets={priceBuckets} rows={rows} />
        </section>

        <RelatedKeywordsSection
          productNameKeywords={productNameKeywords}
          popularKeywordRows={popularKeywordRows}
          popularKeywordCaption={
            loadingRelatedKeywords ? '검색량 확인 중' : naverRelatedKeywords.length > 0 ? 'SearchAd 검색량' : '상품명 빈도'
          }
          popularKeywordValueHeader={naverRelatedKeywords.length > 0 ? '검색량' : '빈도수'}
          relatedKeywords={relatedKeywordRows}
          autocompleteKeywords={autocompleteKeywords}
          notice={relatedKeywordNotice}
        />

        <section className="grid overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-sm md:grid-cols-2 xl:grid-cols-6">
          {stripMetrics.map((metric) => (
            <StripMetric key={metric.label} {...metric} />
          ))}
        </section>

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold text-[var(--text-tertiary)]">
            {result ? `${formatNumber(rows.length)}개 상품 · ${result.stopReason ?? '완료'}` : '키워드를 분석하면 상품별 Wing 지표가 표시됩니다.'}
          </p>
          <button
            type="button"
            onClick={handleDownload}
            disabled={!result}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 text-sm font-black text-green-700 transition hover:bg-green-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ArrowDownToLine size={16} />
            엑셀 다운로드
          </button>
        </div>

        <CatalogTable rows={rows} />
      </div>
    </main>
  );
}

function DeliveryCard({ summary, hasRows }: { summary: DeliverySummary; hasRows: boolean }) {
  const conic = `conic-gradient(#d8f2f1 0 ${summary.rate}%, #8ed2d3 ${summary.rate}% ${Math.min(summary.rate + 4, 100)}%, #edf6f6 ${Math.min(summary.rate + 4, 100)}% 100%)`;

  return (
    <article className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
      <h2 className="text-lg font-black">배송방식 비율</h2>
      <p className="mt-2 text-sm font-bold text-[var(--text-tertiary)]">어떤 배송방식이 잘 팔리는지 확인해보세요</p>
      <div className="mt-10 flex justify-center">
        <div className="relative h-48 w-48 rounded-full" style={{ background: conic }}>
          <div className="absolute inset-10 flex flex-col items-center justify-center rounded-full bg-[var(--surface)]">
            <span className="text-3xl font-black">{hasRows ? `${summary.rate}%` : '-'}</span>
            <span className="text-sm font-black">{summary.label}</span>
          </div>
        </div>
      </div>
      <div className="mt-9 text-center">
        <p className="text-base font-black">
          {hasRows ? `${summary.label}이 ${summary.rate}%로 가장 높아요` : '검색 결과 대기중'}
        </p>
        <p className="mt-2 text-sm font-semibold text-[var(--text-tertiary)]">
          {hasRows ? `Wing 응답 ${formatNumber(summary.total)}개 상품 기준` : 'Wing 카탈로그 검색 후 계산됩니다'}
        </p>
      </div>
    </article>
  );
}

function HeroAnalysisCard({
  product,
  rows,
  summary,
  keyword,
}: {
  product: WingCatalogProduct | null;
  rows: WingCatalogProduct[];
  summary: ReturnType<typeof buildWingCatalogSummary>;
  keyword: string;
}) {
  const totalReviewCount = rows.reduce((acc, row) => acc + (row.ratingCount ?? 0), 0);
  const averageReviewTop10 = average(rows.slice(0, 10).map((row) => row.ratingCount));
  const imageUrl = resolveCoupangCatalogImageUrl(product?.imagePath ?? null);

  return (
    <article className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
      <div className="flex flex-col items-center text-center">
        <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-sunken)]">
          {imageUrl ? (
            <img src={imageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <PackageSearch size={26} className="text-[var(--text-tertiary)]" />
          )}
        </div>
        <h2 className="mt-4 text-2xl font-black tracking-normal">{keyword}</h2>
      </div>

      <div className="mt-7 grid overflow-hidden rounded-lg border border-[var(--border)] md:grid-cols-3">
        <AnalysisCell label="1페이지 총 매출" value={`${formatKRW(summary.totalRevenueLast28d)}원`} />
        <AnalysisCell label="1페이지 총 판매량" value={`${formatNumber(summary.totalSalesLast28d)}개`} />
        <AnalysisCell label="Wing 28일 조회수" value={`${formatNumber(summary.totalViewsLast28d)}회`} />
        <AnalysisCell label="상품 전체리뷰" value={`${formatNumber(totalReviewCount)}개`} sub="수집 결과 기준" />
        <AnalysisCell label="TOP10 평균리뷰" value={`${formatNumber(Math.round(averageReviewTop10 ?? 0))}개`} />
        <AnalysisCell label="평균 전환율" value={formatWingCatalogRate(summary.averageConversionRate28d)} />
        <AnalysisCell label="로켓 배송" value={`${deliveryRatio(rows, 'rocket')}%`} />
        <AnalysisCell label="판매자 로켓" value={`${deliveryRatio(rows, 'sellerRocket')}%`} />
        <AnalysisCell label="판매자 배송 (윙)" value={`${deliveryRatio(rows, 'wing')}%`} />
      </div>
    </article>
  );
}

function PriceDistributionCard({ buckets, rows }: { buckets: PriceBucket[]; rows: WingCatalogProduct[] }) {
  const strongest = buckets.reduce((best, bucket) => (bucket.reviewCount > best.reviewCount ? bucket : best), buckets[0] ?? emptyBucket());
  const maxReview = Math.max(1, ...buckets.map((bucket) => bucket.reviewCount));

  return (
    <article className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-black">판매가 분포</h2>
          <p className="mt-2 text-sm font-bold text-[var(--text-tertiary)]">가격대 대비 리뷰 수 및 상품 수</p>
        </div>
        <button type="button" className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-black text-[var(--text-secondary)]">
          알고리즘 기반 판매가 분포 보기
        </button>
      </div>

      <div className="mt-8 flex h-48 items-end gap-3 border-b border-[var(--border-subtle)] px-1">
        {buckets.map((bucket) => {
          const height = rows.length === 0 ? 18 : Math.max(18, Math.round((bucket.reviewCount / maxReview) * 150));
          return (
            <div key={bucket.label} className="flex min-w-0 flex-1 flex-col items-center gap-2">
              <span className="text-xs font-black text-[var(--text-secondary)]">{formatNumber(bucket.reviewCount)}개</span>
              <div
                className={cn(
                  'w-full max-w-16 rounded-t-lg bg-[#b7e2e3]',
                  bucket.label === strongest.label && 'border-2 border-dashed border-[#94d6d7]',
                )}
                style={{ height }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 grid grid-cols-6 gap-2 text-center text-xs font-bold text-[var(--text-tertiary)]">
        {buckets.map((bucket) => <span key={bucket.label}>{bucket.label}</span>)}
      </div>
      <div className="mt-7">
        <p className="text-base font-black">
          리뷰가 가장 많은 가격대는 {strongest.label} 이에요
        </p>
        <p className="mt-2 text-sm font-semibold text-[var(--text-tertiary)]">
          쿠팡에서 판매할 때 참고 가격은 {formatKRW(recommendedPrice(rows))}원 이에요
        </p>
      </div>
    </article>
  );
}

function RelatedKeywordsSection({
  productNameKeywords,
  popularKeywordRows,
  popularKeywordCaption,
  popularKeywordValueHeader,
  relatedKeywords,
  autocompleteKeywords,
  notice,
}: {
  productNameKeywords: KeywordFrequency[];
  popularKeywordRows: PopularKeywordRow[];
  popularKeywordCaption: string;
  popularKeywordValueHeader: string;
  relatedKeywords: string[];
  autocompleteKeywords: string[];
  notice: string | null;
}) {
  return (
    <section>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-2xl font-black tracking-normal">연관키워드</h2>
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)]"
          aria-label="연관키워드 접기"
        >
          <ChevronUp size={16} />
        </button>
      </div>
      {notice && (
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold leading-5 text-amber-800">
          {notice}
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KeywordMetricCard
          title="상품명분석"
          rows={productNameKeywords.map((item) => ({ keyword: item.keyword, value: `${formatNumber(item.count)}` }))}
          valueHeader="빈도수"
          emptyText="상품을 분석하면 상품명 토큰이 표시됩니다."
        />
        <KeywordMetricCard
          title="인기키워드"
          caption={popularKeywordCaption}
          rows={popularKeywordRows.map((item) => ({
            keyword: item.keyword,
            value: item.volume == null ? '-' : formatNumber(item.volume),
          }))}
          valueHeader={popularKeywordValueHeader}
          emptyText="SearchAd 키 연결 후 검색량이 표시됩니다."
        />
        <KeywordMetricCard
          title="연관키워드"
          rows={relatedKeywords.map((keyword) => ({ keyword }))}
          emptyText="연관 키워드 후보가 없습니다."
        />
        <KeywordMetricCard
          title="자동완성키워드"
          rows={autocompleteKeywords.map((keyword) => ({ keyword }))}
          emptyText="자동완성 후보가 없습니다."
        />
      </div>
    </section>
  );
}

function KeywordMetricCard({
  title,
  caption,
  rows,
  valueHeader,
  emptyText,
}: {
  title: string;
  caption?: string;
  rows: Array<{ keyword: string; value?: string }>;
  valueHeader?: string;
  emptyText: string;
}) {
  return (
    <article className="rounded-xl bg-[var(--surface)] p-5 shadow-sm">
      <div className="flex min-h-7 items-start justify-between gap-3">
        <h3 className="text-sm font-black text-[var(--text-secondary)]">{title}</h3>
        {caption && <span className="text-[11px] font-bold text-[var(--text-tertiary)]">{caption}</span>}
      </div>
      <div className="mt-4 flex justify-between gap-3 text-xs font-black text-[var(--text-tertiary)]">
        <span>키워드</span>
        {valueHeader && <span>{valueHeader}</span>}
      </div>
      {rows.length === 0 ? (
        <p className="mt-5 text-xs font-bold leading-5 text-[var(--text-tertiary)]">{emptyText}</p>
      ) : (
        <ol className="mt-2 space-y-1.5">
          {rows.slice(0, 10).map((row) => (
            <li key={`${title}:${row.keyword}`} className="flex min-h-5 items-center justify-between gap-3 text-sm font-bold text-[var(--text-primary)]">
              <span className="min-w-0 truncate">{row.keyword}</span>
              {valueHeader && <span className="shrink-0 tabular-nums text-[var(--text-secondary)]">{row.value ?? '-'}</span>}
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}

function StripMetric({ label, value, sub, range }: StripMetric) {
  return (
    <article className="border-b border-r border-[var(--border-subtle)] p-5 text-center md:border-b-0">
      <p className="text-sm font-bold text-[var(--text-tertiary)]">{label}</p>
      <p className="mt-2 text-xl font-black">{value}</p>
      <p className="mt-1 text-xs font-semibold text-[var(--text-tertiary)]">{sub}</p>
      <div className="mx-auto mt-4 h-px w-full max-w-56 border-t border-dashed border-[var(--border)]" />
      <p className="mt-3 text-xs font-bold text-[var(--text-tertiary)]">범위</p>
      <p className="mt-1 text-sm font-black text-[#358f8a]">{range}</p>
    </article>
  );
}

function CatalogTable({ rows }: { rows: WingCatalogProduct[] }) {
  return (
    <section className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1500px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--surface-sunken)] text-base font-black">
              <th rowSpan={2} className="w-28 border-r border-[var(--border)] px-4 py-4">리뷰 분석</th>
              <th rowSpan={2} className="w-32 border-r border-[var(--border)] px-4 py-4">이미지</th>
              <th rowSpan={2} className="w-20 border-r border-[var(--border)] px-4 py-4 text-center">순위</th>
              <th rowSpan={2} className="min-w-[420px] border-r border-[var(--border)] px-4 py-4">상품명</th>
              <th rowSpan={2} className="w-32 border-r border-[var(--border)] px-4 py-4">배송타입</th>
              <th rowSpan={2} className="w-28 border-r border-[var(--border)] px-4 py-4">도착...</th>
              <th rowSpan={2} className="w-28 border-r border-[var(--border)] px-4 py-4">가격</th>
              <th rowSpan={2} className="w-28 border-r border-[var(--border)] px-4 py-4">리뷰수</th>
              <th colSpan={4} className="border-b border-[var(--border)] px-4 py-3 text-center text-[#ff5a1f]">Wing 기준 최근 28일</th>
            </tr>
            <tr className="border-b border-[var(--border)] bg-[var(--surface-sunken)] font-black">
              <th className="border-r border-[var(--border)] px-4 py-3">클릭수</th>
              <th className="border-r border-[var(--border)] px-4 py-3">판매량</th>
              <th className="border-r border-[var(--border)] px-4 py-3">매출</th>
              <th className="px-4 py-3">전환율</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={12} className="px-4 py-16 text-center text-sm font-bold text-[var(--text-tertiary)]">
                  키워드를 분석하면 이 영역에 상품별 클릭수, 판매량, 매출, 전환율이 표시됩니다.
                </td>
              </tr>
            ) : rows.map((row, index) => (
              <CatalogRow key={`${row.productId}:${row.itemId}:${row.vendorItemId}`} row={row} rank={index + 1} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CatalogRow({ row, rank }: { row: WingCatalogProduct; rank: number }) {
  const imageUrl = resolveCoupangCatalogImageUrl(row.imagePath);

  return (
    <tr className="align-middle hover:bg-[var(--surface-sunken)]">
      <td className="px-4 py-4">
        <button type="button" className="h-9 rounded-lg border border-[#7bd1d0] px-3 text-xs font-black text-[#40a7a5]">리뷰 분석</button>
      </td>
      <td className="px-4 py-4">
        <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-lg bg-[var(--surface-sunken)]">
          {imageUrl ? <img src={imageUrl} alt="" className="h-full w-full object-cover" /> : <PackageSearch size={22} className="text-[var(--text-tertiary)]" />}
        </div>
      </td>
      <td className="px-4 py-4 text-center font-black">{rank}</td>
      <td className="px-4 py-4">
        <div className="max-w-[520px]">
          <p className="font-black leading-6 text-[var(--text-primary)]">{row.productName}</p>
          <p className="mt-1 text-xs font-semibold text-[var(--text-tertiary)]">
            상품ID {row.productId}{row.itemName ? ` · ${row.itemName}` : ''}
          </p>
        </div>
      </td>
      <td className="px-4 py-4 font-black text-[#a76b34]">coupang wing</td>
      <td className="px-4 py-4 font-bold">{deliveryDays(row)}일</td>
      <td className="px-4 py-4 font-black">{formatKRW(row.salePrice)}원</td>
      <td className="px-4 py-4 font-bold">{formatNumber(row.ratingCount)}개</td>
      <td className="bg-[#effdfb] px-4 py-4 font-black">{formatNumber(row.pvLast28Day)}회</td>
      <td className="bg-[#effdfb] px-4 py-4 font-black">{formatNumber(row.salesLast28d)}개</td>
      <td className="bg-[#effdfb] px-4 py-4 font-black text-[#358f8a]">{formatKRW(row.estimatedRevenue28d)}원</td>
      <td className="bg-[#effdfb] px-4 py-4 font-black text-[#358f8a]">{formatWingCatalogRate(row.conversionRate28d)}</td>
    </tr>
  );
}

function AnalysisCell({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border-b border-r border-[var(--border-subtle)] px-4 py-5 text-center">
      <p className="text-xs font-black text-[var(--text-tertiary)]">{label}</p>
      <p className="mt-2 text-xl font-black">{value}</p>
      {sub && <p className="mt-1 text-xs font-semibold text-[var(--text-tertiary)]">{sub}</p>}
    </div>
  );
}

type DeliverySummary = {
  label: string;
  rate: number;
  total: number;
};

type PriceBucket = {
  label: string;
  productCount: number;
  reviewCount: number;
};

type PopularKeywordRow = {
  keyword: string;
  volume: number | null;
};

type StripMetric = {
  icon?: LucideIcon;
  label: string;
  value: string;
  sub: string;
  range: string;
};

function buildDeliverySummary(rows: WingCatalogProduct[]): DeliverySummary {
  if (rows.length === 0) return { label: '판매자배송', rate: 0, total: 0 };
  const wingCount = rows.filter((row) => !isRocketLike(row)).length;
  const rocketCount = rows.length - wingCount;
  if (wingCount >= rocketCount) {
    return { label: '판매자배송', rate: Math.round((wingCount / rows.length) * 100), total: rows.length };
  }
  return { label: '로켓배송', rate: Math.round((rocketCount / rows.length) * 100), total: rows.length };
}

function isRocketLike(row: WingCatalogProduct): boolean {
  const joined = `${row.deliveryInfo ?? ''} ${row.productName}`.toLowerCase();
  return joined.includes('rocket') || joined.includes('로켓');
}

function deliveryRatio(rows: WingCatalogProduct[], type: 'rocket' | 'sellerRocket' | 'wing'): number {
  if (rows.length === 0) return 0;
  if (type === 'rocket') {
    return Math.round((rows.filter(isRocketLike).length / rows.length) * 100);
  }
  if (type === 'sellerRocket') {
    return Math.round((rows.filter((row) => row.productName.includes('로켓')).length / rows.length) * 100);
  }
  return Math.round((rows.filter((row) => !isRocketLike(row)).length / rows.length) * 100);
}

function buildPriceBuckets(rows: WingCatalogProduct[]): PriceBucket[] {
  if (rows.length === 0) {
    return ['-', '-', '-', '-', '-', '-'].map((label) => ({ label, productCount: 0, reviewCount: 0 }));
  }

  const prices = rows.map((row) => row.salePrice).filter((price): price is number => price != null);
  if (prices.length === 0) {
    return ['-', '-', '-', '-', '-', '-'].map((label) => ({ label, productCount: 0, reviewCount: 0 }));
  }
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const step = Math.max(1, Math.ceil((max - min + 1) / 6));
  const buckets = Array.from({ length: 6 }, (_, index) => {
    const start = min + step * index;
    return {
      label: `${formatKRW(start)}원`,
      productCount: 0,
      reviewCount: 0,
    };
  });

  for (const row of rows) {
    const price = row.salePrice ?? min;
    const index = Math.min(5, Math.max(0, Math.floor((price - min) / step)));
    buckets[index].productCount += 1;
    buckets[index].reviewCount += row.ratingCount ?? 0;
  }

  return buckets;
}

function buildStripMetrics(
  rows: WingCatalogProduct[],
  summary: ReturnType<typeof buildWingCatalogSummary>,
): StripMetric[] {
  const dailyRevenue = Math.round(summary.totalRevenueLast28d / 28);
  const dailySales = Math.round(summary.totalSalesLast28d / 28);
  const dailyViews = Math.round(summary.totalViewsLast28d / 28);
  const prices = rows.map((row) => row.salePrice).filter((value): value is number => value != null);
  const reviews = rows.map((row) => row.ratingCount).filter((value): value is number => value != null);
  const conversions = rows.map((row) => row.conversionRate28d).filter((value): value is number => value != null);

  return [
    {
      label: '예상 한달 매출 / 하루 매출',
      value: `${formatKRW(summary.totalRevenueLast28d)}원`,
      sub: `${formatKRW(dailyRevenue)}원`,
      range: rangeText(rows.map((row) => row.estimatedRevenue28d), 'currency'),
    },
    {
      label: '예상 한달 판매량 / 하루 판매량',
      value: `${formatNumber(summary.totalSalesLast28d)}개`,
      sub: `${formatNumber(dailySales)}개`,
      range: rangeText(rows.map((row) => row.salesLast28d), 'number'),
    },
    {
      label: '예상 한달 조회수 / 하루 조회수',
      value: `${formatNumber(summary.totalViewsLast28d)}회`,
      sub: `${formatNumber(dailyViews)}회`,
      range: rangeText(rows.map((row) => row.pvLast28Day), 'number'),
    },
    {
      label: '평균 판매가',
      value: `${formatKRW(average(prices) ?? 0)}원`,
      sub: '범위',
      range: rangeText(prices, 'currency'),
    },
    {
      label: '평균 리뷰 개수',
      value: `${formatNumber(Math.round(average(reviews) ?? 0))}개`,
      sub: '범위',
      range: rangeText(reviews, 'number'),
    },
    {
      label: '평균 전환율',
      value: formatWingCatalogRate(summary.averageConversionRate28d),
      sub: '상품 평균',
      range: rangeText(conversions, 'percent'),
    },
  ];
}

function buildPopularKeywordRows(
  naverRelatedKeywords: NaverRelatedKeyword[],
  productNameKeywords: KeywordFrequency[],
): PopularKeywordRow[] {
  if (naverRelatedKeywords.length > 0) {
    return naverRelatedKeywords
      .filter((item) => item.keyword.trim())
      .slice(0, 10)
      .map((item) => ({
        keyword: item.keyword,
        volume: item.monthlyTotalSearchCount,
      }));
  }

  return productNameKeywords.slice(0, 10).map((item) => ({
    keyword: item.keyword,
    volume: item.count,
  }));
}

function emptyBucket(): PriceBucket {
  return { label: '-', productCount: 0, reviewCount: 0 };
}

function recommendedPrice(rows: WingCatalogProduct[]): number {
  const byRevenue = [...rows]
    .filter((row) => row.salePrice != null)
    .sort((a, b) => (b.estimatedRevenue28d ?? 0) - (a.estimatedRevenue28d ?? 0));
  return byRevenue[0]?.salePrice ?? 0;
}

function deliveryDays(row: WingCatalogProduct): number {
  if (isRocketLike(row)) return 1;
  if ((row.salesLast28d ?? 0) > 1000) return 2;
  return 3;
}

function average(values: Array<number | null | undefined>): number | null {
  const valid = values.filter((value): value is number => value != null && Number.isFinite(value));
  if (valid.length === 0) return null;
  return valid.reduce((acc, value) => acc + value, 0) / valid.length;
}

function rangeText(values: Array<number | null | undefined>, format: 'currency' | 'number' | 'percent'): string {
  const valid = values.filter((value): value is number => value != null && Number.isFinite(value));
  if (valid.length === 0) return '-';
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  if (format === 'currency') return `${formatKRW(min)} ~ ${formatKRW(max)}`;
  if (format === 'percent') return `${formatWingCatalogRate(min)} ~ ${formatWingCatalogRate(max)}`;
  return `${formatNumber(min)} ~ ${formatNumber(max)}`;
}

function downloadCsv(fileName: string, rows: WingCatalogProduct[]) {
  const headers = ['순위', '상품ID', '상품명', '옵션', '가격', '리뷰수', '클릭수28일', '판매량28일', '매출28일', '전환율28일', '카테고리'];
  const body = rows.map((row, index) => [
    index + 1,
    row.productId,
    row.productName,
    row.itemName ?? '',
    row.salePrice ?? '',
    row.ratingCount ?? '',
    row.pvLast28Day ?? '',
    row.salesLast28d ?? '',
    row.estimatedRevenue28d ?? '',
    row.conversionRate28d == null ? '' : `${Math.round(row.conversionRate28d * 10000) / 100}%`,
    row.categoryHierarchy ?? '',
  ]);
  const csv = [headers, ...body]
    .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
