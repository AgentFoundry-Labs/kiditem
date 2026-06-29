import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertItemSchema } from '@kiditem/shared/alerts';
import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { isApiError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import { useProductGradeChanges } from './useProductGradeChanges';
import { computeGradeMap } from '../lib/abc-grading';
import { PAGE_SIZE, CATEGORY_GROUPS } from '../lib/product-page-config';
import {
  buildProductGroups,
  buildProductListQueryParams,
  filterCategoryGroupsForDisplay,
  filterProductOperationAlerts,
  getRecentProducts,
  sortProductsForDisplay,
  summarizePipelineCounts,
} from '../lib/product-page-model';
import { downloadProductsExcel } from '../lib/products-export';
import type { ProductSegment } from '../components/ProductCommandCenter';
import type { ProductListItem as Product, PipelineCounts } from '../lib/product-types';

export function useProductHubPageState() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const trafficRef = useRef<HTMLInputElement>(null);
  const urlSearch = searchParams.get('search') ?? '';

  const [search, setSearch] = useState(() => urlSearch);
  const [submittedSearch, setSubmittedSearch] = useState(() => urlSearch);
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

  const queryParams = useMemo<Record<string, string>>(
    () => buildProductListQueryParams({
      page,
      pageSize: PAGE_SIZE,
      period,
      gradeFilter,
      statusFilter,
      adFilter,
      stockFilter,
      submittedSearch,
      selectedCategory,
      selectedCategoryGroup,
    }),
    [page, period, gradeFilter, statusFilter, adFilter, stockFilter, submittedSearch, selectedCategory, selectedCategoryGroup],
  );

  useEffect(() => {
    setSearch(urlSearch);
    setSubmittedSearch(urlSearch);
    setPage(1);
  }, [urlSearch]);

  const { data: productsData, isLoading, isPlaceholderData, error: productsError } = useQuery({
    queryKey: queryKeys.products.list(queryParams),
    queryFn: () => {
      const params = new URLSearchParams(queryParams);
      return apiClient.get<{ items: Product[]; total: number }>(`/api/products/masters?${params}`);
    },
    placeholderData: previousData => previousData,
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  });

  const allProducts = useMemo(() => productsData?.items ?? [], [productsData]);
  const totalCount = productsData?.total ?? 0;

  const { data: pipelineCountsData, error: pipelineCountsError } = useQuery({
    queryKey: queryKeys.products.pipelineStats(undefined, period),
    queryFn: () => {
      const params = new URLSearchParams({ period: String(period) });
      return apiClient.get<PipelineCounts>(`/api/products/pipeline-stats?${params}`);
    },
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  });
  const { counts: pipelineCounts, errorMessage: pipelineCountsErrorMessage } = useMemo(
    () => summarizePipelineCounts(pipelineCountsData, pipelineCountsError),
    [pipelineCountsData, pipelineCountsError],
  );

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
      fd.append('source', 'products');
      return apiClient.upload<{ success: boolean; upserted?: number; error?: string }>('/api/traffic/upload', fd);
    },
    onSuccess: (data) => {
      if (data.success) {
        setTrafficMsg(`${data.upserted}개 상품 트래픽 업데이트 완료`);
        queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
      } else {
        setTrafficMsg(`오류: ${data.error}`);
      }
    },
    onError: (err) => {
      setTrafficMsg(isApiError(err) ? err.detail : '업로드 실패');
    },
    onSettled: () => {
      if (trafficRef.current) trafficRef.current.value = '';
      setTimeout(() => setTrafficMsg(''), 5000);
    },
  });

  const handleTrafficUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setTrafficMsg('업로드 중...');
    trafficUpload.mutate(file);
  };

  const handleSearch = (event: FormEvent) => {
    event.preventDefault();
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
    if (segment === 'loss') setGradeFilter('minus');
    if (segment === 'low-margin') setGradeFilter('low');
    if (segment === 'zero-stock') setStockFilter('zero');
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

  const goToPage = (targetPage: number) => {
    setPage(targetPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      if (sortDir === 'desc') setSortDir('asc');
      else {
        setSortKey('');
        setSortDir('desc');
      }
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const displayProducts = useMemo(
    () => sortProductsForDisplay(allProducts, activeCategoryTab, sortKey, sortDir, gradeMap),
    [allProducts, activeCategoryTab, sortKey, sortDir, gradeMap],
  );

  const newProducts = useMemo(() => getRecentProducts(allProducts), [allProducts]);
  const filteredCategoryGroups = useMemo(
    () => filterCategoryGroupsForDisplay(CATEGORY_GROUPS, activeCategoryTab, categorySearch),
    [activeCategoryTab, categorySearch],
  );
  const productGroups = useMemo(() => buildProductGroups(displayProducts), [displayProducts]);

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

  const errorMsg = productsError
    ? (isApiError(productsError) ? productsError.detail : '상품 목록을 불러오지 못했습니다.')
    : null;

  const handleSavedProduct = () => {
    setShowModal(false);
    queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
  };

  const handleUploadComplete = () => {
    setShowUploadModal(false);
    queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
  };

  return {
    activeCategoryTab,
    adFilter,
    categorySearch,
    clearCategoryFilter,
    displayProducts,
    errorMsg,
    expandedGroups,
    filteredCategoryGroups,
    goToPage,
    gradeChangesByProductId,
    gradeFilter,
    gradeMap,
    handleCategoryTabClick,
    handleExcelDownload,
    handleSavedProduct,
    handleSearch,
    handleTrafficUpload,
    handleUploadComplete,
    isCategoryOpen,
    isLoading,
    isPlaceholderData,
    newProducts,
    page,
    period,
    pipelineCounts,
    pipelineCountsErrorMessage,
    productAlerts,
    productGroups,
    search,
    selectedCategory,
    selectedCategoryGroup,
    setAdFilter,
    setCategorySearch,
    setGradeFilter,
    setIsCategoryOpen,
    setPage,
    setPeriod,
    setSearch,
    setShowModal,
    setShowUploadModal,
    setStatusFilter,
    setStockFilter,
    showModal,
    showUploadModal,
    sortDir,
    sortKey,
    statusFilter,
    stockFilter,
    toggleGroup,
    toggleSort,
    totalCount,
    totalPages,
    trafficMsg,
    trafficRef,
    visibleTotalCount,
    allProducts,
    applySegment,
    selectCategory,
    selectCategoryGroup,
  };
}
