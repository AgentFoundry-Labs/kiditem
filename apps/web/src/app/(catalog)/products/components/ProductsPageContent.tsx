'use client';

import { useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { BarChart3, CalendarDays, ChevronDown, Download, Package, RotateCcw, Search, Tags, Upload } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { isApiError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import { cn, formatDate, formatNumber } from '@/lib/utils';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { AlertItemSchema, type AlertItem } from '@kiditem/shared/alerts';
import type { ProductListItem as Product, PipelineCounts } from '../lib/product-types';
import AddProductModal from './AddProductModal';
import ExcelUploadModal from './ExcelUploadModal';
import { ProductGroupRow } from './ProductGroupRow';
import { ProductRowCard } from './ProductRowCard';
import { ProductsColumnHeader } from './ProductsColumnHeader';
import { ProductCommandCenter, type ProductSegment } from './ProductCommandCenter';
import { computeGradeMap, rankOf } from '../lib/abc-grading';
import { downloadProductsExcel } from '../lib/products-export';
import { useProductGradeChanges } from '../hooks/useProductGradeChanges';

const DEFAULT_PIPELINE: PipelineCounts = {
  total: 0, gradeA: 0, gradeB: 0, gradeC: 0,
  active: 0, inactive: 0, cleanup: 0, unknown: 0,
  minus: 0, low: 0, gradeChangeA: 0, gradeChangeB: 0, gradeChangeC: 0,
  zeroStock: 0, lowStock: 0, stockRisk: 0, adLoss: 0,
  adCount: 0, noAdCount: 0,
  totalRev: 0, totalAd: 0,
  gradeRevA: 0, gradeRevB: 0, gradeRevC: 0,
  gradeAdA: 0, gradeAdB: 0, gradeAdC: 0,
};
const PAGE_SIZE = 20;

const PERIOD_OPTIONS = [
  { days: 7, label: '7일' },
  { days: 14, label: '14일' },
  { days: 30, label: '30일' },
  { days: 365, label: '연간' },
];

const AD_FILTERS = [
  { key: 'all', label: '전체' },
  { key: 'ad', label: '광고중' },
  { key: 'noad', label: '광고없음' },
];

const STOCK_FILTERS = [
  { key: 'all', label: '전체 재고' },
  { key: 'risk', label: '재고위험' },
  { key: 'zero', label: '품절' },
  { key: 'ok', label: '재고 OK' },
];

const NEW_PRODUCT_DAYS = 30;

const CATEGORY_GROUPS = [
  {
    key: 'season',
    label: '시즌상품',
    title: '계절용품/시즌용품',
    items: ['신학기용품', '어린이날', '어버이날/스승의날', '여름용품', '가을운동회', '할로윈데이', '겨울용품', '크리스마스용품', '명절용품/설날/추석'],
  },
  {
    key: 'stationery',
    label: '문구/학용품',
    title: '문구용품/노트/문구세트/색종이',
    items: ['노트/공책/수첩/스케치북', '문구세트', '크레파스/물감', '색종이/색도화지', '화이트보드/메모보드', '팬시스티커', '지우개', '자류/가위/칼', '연필깎이', '풀/본드/접착제', '필기류', '필통', '기타사무용품'],
  },
  {
    key: 'toy',
    label: '완구/놀이',
    title: '완구/블록/퍼즐/보드/젤리괴물',
    items: ['완구', '비눗방울', '블록', '퍼즐', '종이퍼즐', '보드게임', '라켓/캐치볼', '주물럭/젤리괴물/슬라임', '큐브/팽이', '칼라링/슬링키', '탱탱볼/요요볼', '기타활동완구'],
  },
  {
    key: 'bag',
    label: '팬시/가방/기타',
    title: '보조가방/책가방/가방류',
    items: ['보조가방', '크로스백', '비치가방'],
  },
  {
    key: 'music-art-sports',
    label: '교재/음악/체육',
    title: '음악용품/미술용품/체육용품',
    items: ['악기류', '미술용품', '색종이/색상지/도화지/마분지', '배드민턴/라켓류', '캐치볼/프로펠라/원반류'],
  },
  {
    key: 'learning',
    label: '학습교재',
    title: '학습교재/수업교재',
    items: ['수업교재(종이)', '수업교재(나무)', '수업교재(기타)', '컬러룬(풍선)색칠하기', '색칠놀이(기타)', '역할놀이', '비즈/생크림공예', '십자수/뜨게질', '점토/클레이', '학습교구'],
  },
  {
    key: 'fancy',
    label: '캐릭터상품',
    title: '팬시/앨범/지갑/거울/악세서리',
    items: ['팬시', '다용도꽂이/정리함', '앨범/액자', '지갑/동전지갑', '악세서리/반지/목걸이', '포장지류/선물상자', '시계', '저금통', '컵/텀블러/물병', '우산/우비'],
  },
  {
    key: 'craft',
    label: '만들기/공예',
    title: '만들기재료/클레이/비즈',
    items: ['리본/비드/줄/끈', '폼폼이/모루', '고무재료', '나무재료', '종이재료', '천재료', '플라스틱재료', '쇠/핀재료', '찍찍이/벨크로', '스티로폼재료', '기타만들기재료'],
  },
  {
    key: 'kindergarten',
    label: '유치원용품',
    title: '유치원용품/티셔츠/시설교구용품/도시락',
    items: ['원아수첩/명찰/기타', '앞치마/토시/덧신', '도시락/간식접시/물병', '역할놀이교구/손인형', '시설교구', '단체티셔츠/모자', '상장류', '공부상'],
  },
  {
    key: 'snack',
    label: '달란트',
    title: '커피류/시리얼/간식류/사탕류',
    items: ['시리얼', '과자류', '사탕류', '음료(차)'],
  },
] as const;

const CATEGORY_TABS = [
  { key: 'all', label: '전체 카테고리' },
  { key: 'new', label: '신상품' },
  ...CATEGORY_GROUPS.map(({ key, label }) => ({ key, label })),
] as const;

function trafficSortVal(p: Product, key: string): number {
  const t = p.traffic;
  switch (key) {
    case 'visitors': return t?.visitors || 0;
    case 'views': return t?.views || 0;
    case 'cartAdds': return t?.cartAdds || 0;
    case 'orders': return t?.orders || 0;
    case 'salesQty': return t?.salesQty || 0;
    case 'revenue': return t?.revenue || 0;
    case 'profitRate': return p.profitRate;
    case 'adRate': return p.adRate;
    case 'stock': return p.currentStock;
    default: return 0;
  }
}

function productCreatedAtValue(product: Product): number {
  if (!product.createdAt) return 0;
  const value = new Date(product.createdAt).getTime();
  return Number.isNaN(value) ? 0 : value;
}

function isRecentProduct(product: Product): boolean {
  const createdAt = productCreatedAtValue(product);
  if (!createdAt) return false;
  return Date.now() - createdAt <= NEW_PRODUCT_DAYS * 24 * 60 * 60 * 1000;
}

function filterProductOperationAlerts(alerts: AlertItem[]): AlertItem[] {
  return alerts.filter((alert) => {
    const targetMatched = alert.targetType === 'master' || alert.targetType === 'product';
    const text = `${alert.type} ${alert.title} ${alert.message ?? ''}`.toLowerCase();
    return (
      targetMatched ||
      text.includes('product') ||
      text.includes('inventory') ||
      text.includes('stock') ||
      text.includes('rule') ||
      text.includes('profit') ||
      text.includes('grade') ||
      text.includes('상품') ||
      text.includes('재고') ||
      text.includes('품절') ||
      text.includes('손익') ||
      text.includes('등급')
    );
  });
}

export default function ProductsPageContent() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const trafficRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState(() => searchParams.get('search') ?? '');
  const [submittedSearch, setSubmittedSearch] = useState(() => searchParams.get('search') ?? '');
  const [gradeFilter, setGradeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [adFilter, setAdFilter] = useState('all');
  const [stockFilter, setStockFilter] = useState('all');
  const [, setActiveSegment] = useState<ProductSegment>('all');
  const [sortKey, setSortKey] = useState<string>('stock');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [period, setPeriod] = useState(14);
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [trafficMsg, setTrafficMsg] = useState('');
  const [categorySearch, setCategorySearch] = useState('');
  const [activeCategoryTab, setActiveCategoryTab] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedCategoryGroup, setSelectedCategoryGroup] = useState<string | null>(null);
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);

  const queryParams = useMemo<Record<string, string>>(() => ({
    page: String(page),
    limit: String(PAGE_SIZE),
    period: String(period),
    enriched: 'true',
    ...(gradeFilter !== 'all' && { grade: gradeFilter }),
    ...(statusFilter !== 'all' && { status: statusFilter }),
    ...(adFilter !== 'all' && { ad: adFilter }),
    ...(stockFilter !== 'all' && { stock: stockFilter }),
    ...(submittedSearch && { search: submittedSearch }),
    ...(selectedCategory && { category: selectedCategory }),
    ...(selectedCategoryGroup && { categoryGroup: selectedCategoryGroup }),
  }), [page, period, gradeFilter, statusFilter, adFilter, stockFilter, submittedSearch, selectedCategory, selectedCategoryGroup]);

  const { data: productsData, isLoading, error: productsError } = useQuery({
    queryKey: queryKeys.products.list(queryParams),
    queryFn: () => {
      const params = new URLSearchParams(queryParams);
      return apiClient.get<{ items: Product[]; total: number }>(`/api/products/masters?${params}`);
    },
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  });

  const allProducts = useMemo(() => productsData?.items ?? [], [productsData]);
  const totalCount = productsData?.total ?? 0;

  const { data: pipelineCounts = DEFAULT_PIPELINE } = useQuery({
    queryKey: queryKeys.products.pipelineStats(undefined, period),
    queryFn: () => {
      const params = new URLSearchParams({ period: String(period) });
      return apiClient.get<PipelineCounts>(`/api/products/pipeline-stats?${params}`).catch(() => DEFAULT_PIPELINE);
    },
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  });

  const { data: alerts = [] } = useQuery({
    queryKey: queryKeys.alerts.all,
    queryFn: () => apiClient.getParsed('/api/alerts?limit=30', z.array(AlertItemSchema)),
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  });

  const trafficUpload = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('period', String(period));
      return apiClient.upload<{ success: boolean; upserted?: number; error?: string }>(`/api/traffic/upload`, fd);
    },
    onSuccess: (data) => {
      if (data.success) {
        setTrafficMsg(`${data.upserted}개 상품 트래픽 업데이트 완료`);
        queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
      } else {
        setTrafficMsg(`오류: ${data.error}`);
      }
    },
    onError: (err) => { setTrafficMsg(isApiError(err) ? err.detail : '업로드 실패'); },
    onSettled: () => {
      if (trafficRef.current) trafficRef.current.value = '';
      setTimeout(() => setTrafficMsg(''), 5000);
    },
  });

  const handleTrafficUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setTrafficMsg('업로드 중...');
    trafficUpload.mutate(file);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSubmittedSearch(search);
  };

  const applySegment = (segment: ProductSegment) => {
    setActiveSegment(segment);
    setPage(1);
    setStatusFilter('all');
    setGradeFilter('all');
    setAdFilter('all');
    setStockFilter('all');

    if (segment === 'core') setGradeFilter('A');
    if (segment === 'loss') {
      setGradeFilter('minus');
    }
    if (segment === 'low-margin') setGradeFilter('low');
    if (segment === 'stock-risk') setStockFilter('risk');
  };

  const handleCategoryTabClick = (key: string) => {
    setPage(1);
    setActiveCategoryTab(key);
    setCategorySearch('');

    if (key === 'all') {
      setSelectedCategory(null);
      setSelectedCategoryGroup(null);
      setIsCategoryOpen(true);
      return;
    }

    if (key === 'new') {
      setSelectedCategory(null);
      setSelectedCategoryGroup(null);
      setIsCategoryOpen(false);
      return;
    }

    const group = CATEGORY_GROUPS.find((item) => item.key === key);
    setSelectedCategory(null);
    setSelectedCategoryGroup(group?.key ?? null);
    setIsCategoryOpen(false);
  };

  const selectCategoryGroup = (groupKey: string) => {
    setSelectedCategory(null);
    setSelectedCategoryGroup(groupKey);
    setActiveCategoryTab(groupKey);
    setPage(1);
  };

  const selectCategory = (category: string, groupKey: string) => {
    setSelectedCategory(category);
    setSelectedCategoryGroup(null);
    setActiveCategoryTab(groupKey);
    setPage(1);
  };

  const clearCategoryFilter = () => {
    setSelectedCategory(null);
    setSelectedCategoryGroup(null);
    setCategorySearch('');
    setActiveCategoryTab('all');
    setPage(1);
  };

  const gradeMap = useMemo(() => computeGradeMap(allProducts), [allProducts]);
  const { gradeChanges } = useProductGradeChanges(allProducts, gradeMap);
  const productAlerts = useMemo(() => filterProductOperationAlerts(alerts), [alerts]);
  const gradeChangesByProductId = useMemo(() => {
    const map = new Map<string, (typeof gradeChanges)[number]>();
    for (const change of gradeChanges) {
      if (!map.has(change.productId)) map.set(change.productId, change);
    }
    return map;
  }, [gradeChanges]);

  const handleExcelDownload = () => downloadProductsExcel(
    { gradeFilter, statusFilter, submittedSearch },
    gradeMap,
  );

  const goToPage = (p: number) => {
    setPage(p);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      if (sortDir === 'desc') setSortDir('asc');
      else { setSortKey(''); setSortDir('desc'); }
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const displayProducts = useMemo(() => {
    const products = activeCategoryTab === 'new'
      ? allProducts.filter(isRecentProduct)
      : allProducts;
    return [...products].sort((a, b) => {
      if (!sortKey) {
        const ra = rankOf(a, gradeMap) || 99999;
        const rb = rankOf(b, gradeMap) || 99999;
        return ra - rb;
      }
      const av = trafficSortVal(a, sortKey);
      const bv = trafficSortVal(b, sortKey);
      return sortDir === 'desc' ? bv - av : av - bv;
    });
  }, [allProducts, activeCategoryTab, sortKey, sortDir, gradeMap]);

  const newProducts = useMemo(() => {
    const recent = allProducts
      .filter(isRecentProduct)
      .sort((a, b) => productCreatedAtValue(b) - productCreatedAtValue(a));
    if (recent.length > 0) return recent.slice(0, 6);
    return [...allProducts]
      .sort((a, b) => productCreatedAtValue(b) - productCreatedAtValue(a))
      .slice(0, 6);
  }, [allProducts]);

  const filteredCategoryGroups = useMemo(() => {
    const keyword = categorySearch.trim().toLowerCase();
    return CATEGORY_GROUPS.map((group) => {
      const groupMatched = !keyword
        || group.label.toLowerCase().includes(keyword)
        || group.title.toLowerCase().includes(keyword);
      const items = group.items.filter((item) => groupMatched || item.toLowerCase().includes(keyword));
      return { ...group, items };
    }).filter((group) => {
      const tabMatched = activeCategoryTab === 'all' || activeCategoryTab === 'new' || activeCategoryTab === group.key;
      return tabMatched && group.items.length > 0;
    });
  }, [activeCategoryTab, categorySearch]);

  const productGroups = useMemo(() => {
    const map = new Map<string, Product[]>();
    for (const p of displayProducts) {
      if (!map.has(p.name)) map.set(p.name, []);
      map.get(p.name)!.push(p);
    }
    return [...map.values()];
  }, [displayProducts]);

  const isLocalFiltered = activeCategoryTab === 'new';
  const visibleTotalCount = isLocalFiltered ? displayProducts.length : totalCount;
  const totalPages = isLocalFiltered ? 1 : Math.ceil(totalCount / PAGE_SIZE);

  const toggleGroup = (name: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  if (isLoading && allProducts.length === 0) return <PageSkeleton variant="table" />;
  // API 실패해도 layout 은 0 으로 렌더 — graceful degradation. 에러는 상단 배너로만 표시.
  const errorMsg = productsError
    ? (isApiError(productsError) ? productsError.detail : '상품 목록을 불러오지 못했습니다.')
    : null;

  return (
    <div className="space-y-4">
      {errorMsg && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMsg}
        </div>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--primary)' }}>
            <Package size={20} className="text-white" />
          </div>
          <div className="flex items-baseline gap-2">
            <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text-primary)' }}>상품 운영 센터</h1>
            <span className="text-[13px] font-semibold" style={{ color: 'var(--text-tertiary)' }}>
              매출 · 광고 · 재고 · 수익성 통합 관리
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-xl p-1" style={{ background: 'var(--surface-sunken)' }}>
            {PERIOD_OPTIONS.map(item => (
              <button
                key={item.days}
                onClick={() => { setPeriod(item.days); setPage(1); }}
                className="px-3 py-1.5 text-[13px] font-semibold rounded-lg transition-colors"
                style={period === item.days
                  ? { background: 'var(--primary)', color: '#fff', boxShadow: 'var(--shadow-sm)' }
                  : { color: 'var(--text-tertiary)' }}
              >
                {item.label}
              </button>
            ))}
          </div>
          <input ref={trafficRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleTrafficUpload} className="hidden" />
          <button
            onClick={() => trafficRef.current?.click()}
            className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold transition-colors"
            style={{ background: 'var(--surface-sunken)', color: 'var(--text-secondary)' }}
          >
            <BarChart3 size={14} /> 트래픽 업로드
          </button>
          {trafficMsg && <span className="text-[13px] font-semibold" style={{ color: 'var(--primary)' }}>{trafficMsg}</span>}
          <button
            onClick={handleExcelDownload}
            className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold transition-colors"
            style={{ background: 'var(--surface-sunken)', color: 'var(--text-secondary)' }}
          >
            <Download size={14} />
          </button>
          <button
            onClick={() => setShowUploadModal(true)}
            className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold transition-colors"
            style={{ background: 'var(--surface-sunken)', color: 'var(--text-secondary)' }}
          >
            <Upload size={14} />
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold text-white"
            style={{ background: 'var(--primary)' }}
          >
            + 상품 추가
          </button>
        </div>
      </div>

      <ProductCommandCenter
        pipelineCounts={pipelineCounts}
        newProductCount={newProducts.length}
        productAlerts={productAlerts}
        onSelectSegment={applySegment}
      />

      <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--card-bg)] shadow-sm">
        <div className="flex items-center gap-2 overflow-x-auto px-4 py-3">
          {CATEGORY_TABS.map((tab) => {
            const active = activeCategoryTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => handleCategoryTabClick(tab.key)}
                className={cn(
                  'h-10 shrink-0 rounded-xl px-4 text-sm font-extrabold transition-colors',
                  active
                    ? 'bg-[var(--primary)] text-white shadow-sm'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]',
                )}
              >
                {tab.label}
              </button>
            );
          })}
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {(isCategoryOpen && (selectedCategory || selectedCategoryGroup || categorySearch || activeCategoryTab === 'new')) && (
              <button
                onClick={clearCategoryFilter}
                className="flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-extrabold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)]"
              >
                <RotateCcw size={13} />
                초기화
              </button>
            )}
            {isCategoryOpen && (
              <button
                type="button"
                onClick={() => setIsCategoryOpen(false)}
                className="flex h-8 items-center gap-1.5 rounded-lg bg-[var(--surface-sunken)] px-3 text-xs font-extrabold text-[var(--text-secondary)] transition-colors hover:text-[var(--primary)]"
              >
                닫기
                <ChevronDown size={14} className="rotate-180" />
              </button>
            )}
          </div>
        </div>

        {isCategoryOpen && (
          <>
            <div className="border-t border-[var(--border-subtle)] px-4 py-3">
              <form
                onSubmit={(event) => event.preventDefault()}
                className="relative max-w-[420px]"
              >
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-quaternary)]" />
                <input
                  type="text"
                  value={categorySearch}
                  onChange={(event) => setCategorySearch(event.target.value)}
                  placeholder="카테고리명 검색 예: 비눗방울, 색종이"
                  className="h-10 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-sunken)] pl-9 pr-3 text-[14px] font-medium text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--primary)]"
                />
              </form>
            </div>

            <div className="grid grid-cols-[minmax(0,1fr)_280px] gap-4 border-t border-[var(--border-subtle)] p-4">
              <div className="grid grid-cols-2 gap-x-5 gap-y-4 xl:grid-cols-3">
                {filteredCategoryGroups.map((group) => (
                  <div key={group.key} className="min-w-0">
                    <button
                      onClick={() => selectCategoryGroup(group.key)}
                      className={cn(
                        'flex w-full items-center justify-between border-b pb-2 text-left text-[13px] font-extrabold transition-colors',
                        selectedCategoryGroup === group.key
                          ? 'border-[var(--primary)] text-[var(--primary)]'
                          : 'border-[var(--border-subtle)] text-[var(--text-primary)] hover:text-[var(--primary)]',
                      )}
                    >
                      <span className="truncate">{group.title}</span>
                      <Tags size={14} className="shrink-0" />
                    </button>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {group.items.map((item) => {
                        const active = selectedCategory === item;
                        return (
                          <button
                            key={item}
                            onClick={() => selectCategory(item, group.key)}
                            className={cn(
                              'rounded-md px-2 py-1 text-xs font-semibold transition-colors',
                              active
                                ? 'bg-[var(--primary)] text-white'
                                : 'bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:bg-[var(--primary-soft)] hover:text-[var(--primary)]',
                            )}
                          >
                            {item}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <aside className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-3">
                <div className="flex items-center gap-2 text-[13px] font-extrabold text-[var(--text-primary)]">
                  <CalendarDays size={15} className="text-[var(--primary)]" />
                  신상품
                </div>
                <p className="mt-1 text-xs font-medium text-[var(--text-muted)]">최근 등록 상품을 먼저 훑어봅니다.</p>
                <div className="mt-3 space-y-2">
                  {newProducts.length === 0 ? (
                    <p className="rounded-lg bg-[var(--card-bg)] px-3 py-4 text-center text-xs font-semibold text-[var(--text-muted)]">
                      신상품 데이터가 없습니다.
                    </p>
                  ) : newProducts.map((product) => (
                    <button
                      key={product.id}
                      onClick={() => { window.location.href = `/product-hub/${product.id}`; }}
                      className="flex w-full items-center gap-2 rounded-lg bg-[var(--card-bg)] p-2 text-left transition-colors hover:bg-[var(--primary-soft)]"
                    >
                      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md bg-[var(--surface)]">
                        {(product.thumbnailUrl || product.imageUrl) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={product.thumbnailUrl || product.imageUrl || ''}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[var(--text-quaternary)]">
                            <Package size={15} />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-extrabold text-[var(--text-primary)]">{product.name}</p>
                        <p className="mt-0.5 text-[11px] font-medium text-[var(--text-muted)]">
                          {product.createdAt ? formatDate(product.createdAt) : '등록일 없음'} · 재고 {formatNumber(product.availableStock)}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </aside>
            </div>
          </>
        )}

      </section>

      <div className="flex items-center gap-3 rounded-2xl px-4 py-3" style={{ background: 'var(--card-bg)', border: '1px solid var(--border-subtle)' }}>
        <form onSubmit={handleSearch} className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-quaternary)' }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="상품명 · SKU 검색"
            className="h-10 pl-9 pr-3 text-[14px] rounded-xl w-full"
            style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
          />
        </form>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setActiveSegment('custom'); setPage(1); }}
          className="h-10 px-3 rounded-xl text-[14px] font-medium"
          style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
        >
          <option value="all">전체 상태</option>
          <option value="active">판매중</option>
          <option value="unknown">상태미수집</option>
          <option value="inactive">판매중지</option>
        </select>
        <div className="flex items-center rounded-xl p-1" style={{ background: 'var(--surface-sunken)' }}>
          {AD_FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => { setAdFilter(f.key); setActiveSegment('custom'); setPage(1); }}
              className="px-3 py-1.5 text-[13px] font-semibold rounded-lg transition-colors"
              style={adFilter === f.key
                ? { background: 'var(--primary)', color: '#fff' }
                : { color: 'var(--text-tertiary)' }}
            >
              {f.label}
            </button>
          ))}
        </div>
        <select
          value={stockFilter}
          onChange={(e) => { setStockFilter(e.target.value); setActiveSegment('custom'); setPage(1); }}
          className="h-10 px-3 rounded-xl text-[14px] font-medium"
          style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
        >
          {STOCK_FILTERS.map((filter) => (
            <option key={filter.key} value={filter.key}>{filter.label}</option>
          ))}
        </select>
        <select
          value={gradeFilter}
          onChange={(e) => { setGradeFilter(e.target.value); setActiveSegment('custom'); setPage(1); }}
          className="h-10 px-3 rounded-xl text-[14px] font-medium"
          style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
        >
          <option value="all">전체 등급</option>
          <option value="A">A 핵심</option>
          <option value="B">B 성장</option>
          <option value="C">C 정리</option>
          <option value="minus">적자</option>
          <option value="low">3% 이하</option>
        </select>
        <span className="text-[13px] font-semibold tabular-nums" style={{ color: 'var(--text-tertiary)' }}>
          {visibleTotalCount}개 표시
        </span>
      </div>

      <ProductsColumnHeader sortKey={sortKey} sortDir={sortDir} onToggleSort={toggleSort} />

      <div className="relative">
        {isLoading && allProducts.length > 0 && (
          <div
            className="absolute inset-0 z-10 flex items-start justify-center pt-20 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(2px)' }}
          >
            <div
              className="flex items-center gap-2 px-4 py-2 rounded-xl shadow-lg"
              style={{ background: 'var(--card-bg)', border: '1px solid var(--border-subtle)' }}
            >
              <div
                className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin"
                style={{ borderColor: 'var(--primary)', borderTopColor: 'transparent' }}
              />
              <span className="text-[13px] font-semibold" style={{ color: 'var(--text-secondary)' }}>불러오는 중...</span>
            </div>
          </div>
        )}

        {displayProducts.length === 0 && !isLoading ? (
          <div
            className="rounded-xl p-12 text-center"
            style={{ background: 'var(--card-bg)', border: '1px solid var(--border-subtle)', color: 'var(--text-tertiary)' }}
          >
            등록된 상품이 없습니다.
          </div>
        ) : (
          <div className="space-y-3">
            {productGroups.map(group => {
              if (group.length === 1) {
                return (
                  <ProductRowCard
                    key={group[0].id}
                    product={group[0]}
                    gradeMap={gradeMap}
                    gradeChange={gradeChangesByProductId.get(group[0].id)}
                    periodDays={period}
                  />
                );
              }
              return (
                <ProductGroupRow
                  key={group[0].name}
                  group={group}
                  gradeMap={gradeMap}
                  gradeChangesByProductId={gradeChangesByProductId}
                  periodDays={period}
                  isExpanded={expandedGroups.has(group[0].name)}
                  onToggle={() => toggleGroup(group[0].name)}
                />
              );
            })}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <span className="text-xs text-gray-400 font-mono">
              {totalCount}개 중 {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, totalCount)}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => goToPage(page - 1)}
                disabled={page <= 1}
                className="px-3 py-1.5 text-xs border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                이전
              </button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                let pg: number;
                if (totalPages <= 7) pg = i + 1;
                else if (page <= 4) pg = i + 1;
                else if (page >= totalPages - 3) pg = totalPages - 6 + i;
                else pg = page - 3 + i;
                return (
                  <button
                    key={pg}
                    onClick={() => goToPage(pg)}
                    className={cn(
                      'w-8 h-8 text-xs rounded-md',
                      pg === page
                        ? 'bg-gray-900 text-white font-semibold'
                        : 'border border-gray-200 hover:bg-gray-50 text-gray-600',
                    )}
                  >
                    {pg}
                  </button>
                );
              })}
              <button
                onClick={() => goToPage(page + 1)}
                disabled={page >= totalPages}
                className="px-3 py-1.5 text-xs border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                다음
              </button>
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <AddProductModal
          onClose={() => setShowModal(false)}
          onSaved={() => {
            setShowModal(false);
            queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
          }}
        />
      )}

      {showUploadModal && (
        <ExcelUploadModal
          onClose={() => setShowUploadModal(false)}
          onComplete={() => {
            setShowUploadModal(false);
            queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
          }}
        />
      )}
    </div>
  );
}
