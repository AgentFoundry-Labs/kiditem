'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Check, Loader2, Search, Upload, X } from 'lucide-react';
import { friendlyError } from '@/lib/api-error';
import {
  ProductInventoryMatchingTable,
  operatorMatchingStatus,
  productMatchingDecision,
} from './components/ProductInventoryMatchingTable';
import { CoupangWingCatalogImportDialog } from './components/CoupangWingCatalogImportDialog';
import { ProductLinkDialog } from './components/ProductLinkDialog';
import { VariantLinkDialog } from './components/VariantLinkDialog';
import { RecipeSuggestionDialog } from './components/RecipeSuggestionDialog';
import { RecipeAutomationPanel } from './components/RecipeAutomationPanel';
import { isChannelListingOnSale } from './lib/channel-listing-sale-status';
import { Pagination } from '@/components/ui/Pagination';
import {
  useChannelAccounts,
  useChannelProductMappings,
  useChannelRecipeAutomationPreviews,
} from './hooks/useChannelSkuMappings';
import type {
  ChannelOptionMatchingQueueRow,
  ChannelProductMatchingQueueRow,
} from '@kiditem/shared/channel-product-matching';

const SEARCH_DEBOUNCE_MS = 300;
const STATUS_OPTIONS = [
  ['all', '전체'],
  ['matched', '매칭 완료'],
  ['quantity_review', '매칭 수량 검토'],
  ['unmatched', '미매칭 상품'],
] as const;

export default function MatchingPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedAccountParam = searchParams.get('accounts');
  const legacySelectedAccountId = searchParams.get('channelAccountId') ?? '';
  const urlStatus = normalizedOperatorStatus(searchParams.get('status'));
  const urlActiveOnly = searchParams.get('activeOnly') !== 'false';
  const [status, setStatus] = useState(urlStatus);
  const [activeOnly, setActiveOnly] = useState(urlActiveOnly);
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
  const initialSearch = searchParams.get('search')?.trim() ?? '';
  const focusOptionId = searchParams.get('focusOptionId') ?? undefined;
  const [searchText, setSearchText] = useState(initialSearch);
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch);
  const pendingInternalSearch = useRef<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [productTarget, setProductTarget] = useState<ChannelProductMatchingQueueRow | null>(null);
  const [variantTarget, setVariantTarget] = useState<ChannelOptionMatchingQueueRow | null>(null);
  const [suggestionTarget, setSuggestionTarget] = useState<ChannelOptionMatchingQueueRow | null>(null);

  const updateUrl = (changes: Record<string, string | null>, resetPage = true) => {
    const next = new URLSearchParams(searchParams.toString());
    Object.entries(changes).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key));
    if (resetPage) next.set('page', '1');
    if (Object.hasOwn(changes, 'search')) pendingInternalSearch.current = changes.search ?? '';
    router.replace(`${pathname}?${next.toString()}`);
  };

  const accountsQuery = useChannelAccounts();
  const channelAccounts = useMemo(
    () => [...(accountsQuery.data ?? [])]
      .filter((account) => account.channel === 'coupang' || account.channel === 'rocket')
      .sort((left, right) => {
        if (left.channel !== right.channel) return left.channel === 'coupang' ? -1 : 1;
        if (left.isPrimary !== right.isPrimary) return left.isPrimary ? -1 : 1;
        const nameOrder = left.name.localeCompare(right.name, 'ko');
        return nameOrder !== 0 ? nameOrder : left.id.localeCompare(right.id);
      }),
    [accountsQuery.data],
  );
  const selectedAccountIds = useMemo(() => {
    const available = new Set(channelAccounts.map((account) => account.id));
    if (selectedAccountParam !== null) {
      const requested = selectedAccountParam
        .split(',')
        .map((value) => value.trim())
        .filter((value) => available.has(value));
      if (requested.length > 0) return [...new Set(requested)].sort();
    }
    if (available.has(legacySelectedAccountId)) return [legacySelectedAccountId];
    return channelAccounts.map((account) => account.id).sort();
  }, [channelAccounts, legacySelectedAccountId, selectedAccountParam]);
  const selectedAccountIdSet = useMemo(
    () => new Set(selectedAccountIds),
    [selectedAccountIds],
  );
  const selectedAccounts = channelAccounts.filter((account) =>
    selectedAccountIdSet.has(account.id));
  const selectedAccount = selectedAccounts.length === 1 ? selectedAccounts[0]! : null;

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(searchText.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timeout);
  }, [searchText]);
  useEffect(() => {
    const nextSearch = searchParams.get('search')?.trim() ?? '';
    if (pendingInternalSearch.current === nextSearch) {
      pendingInternalSearch.current = null;
    } else {
      setSearchText(nextSearch);
      setDebouncedSearch(nextSearch);
    }
    setStatus(urlStatus);
    setActiveOnly(urlActiveOnly);
  }, [searchParams.toString()]);

  const mappingsQuery = useChannelProductMappings({
    search: debouncedSearch,
    enabled: channelAccounts.length > 0,
  });
  const automationPreviewQueries = useChannelRecipeAutomationPreviews(selectedAccountIds);
  const automationPreviews = automationPreviewQueries.flatMap((query) =>
    query.data ? [query.data] : []);
  const automationItemsByOptionId = useMemo(() => new Map(
    automationPreviews.flatMap((preview) => preview.items).flatMap((item) =>
      item.channelListingOptionIds.map((optionId) => [optionId, item] as const)),
  ), [automationPreviews]);
  const automationGroupsByListingId = useMemo(() => new Map(
    automationPreviews.flatMap((preview) => preview.productGroups).map((group) => [
      group.channelListingId,
      group,
    ] as const),
  ), [automationPreviews]);
  const data = mappingsQuery.data;
  const selectedProducts = useMemo(() => (data?.products ?? []).filter((row) =>
    selectedAccountIdSet.has(row.channelAccount.id)), [data?.products, selectedAccountIdSet]);
  const selectedOptions = useMemo(() => (data?.options ?? []).filter((row) =>
    selectedAccountIdSet.has(row.channelAccount.id)), [data?.options, selectedAccountIdSet]);
  const onSaleListingIdSet = useMemo(() => new Set(selectedProducts
    .filter((row) => isChannelListingOnSale(row.listing.status))
    .map((row) => row.listing.id)), [selectedProducts]);
  const onSaleListingIds = useMemo(
    () => [...onSaleListingIdSet].sort(),
    [onSaleListingIdSet],
  );
  const isRefreshing = mappingsQuery.isFetching && !mappingsQuery.isLoading;
  const optionsByListingId = useMemo(() => {
    const grouped = new Map<string, ChannelOptionMatchingQueueRow[]>();
    for (const option of selectedOptions) {
      const rows = grouped.get(option.listing.id) ?? [];
      rows.push(option);
      grouped.set(option.listing.id, rows);
    }
    return grouped;
  }, [selectedOptions]);
  const filteredProducts = useMemo(() => selectedProducts.filter((row) => {
    if (activeOnly && !onSaleListingIdSet.has(row.listing.id)) return false;
    if (status === 'all') return true;
    return operatorMatchingStatus(productMatchingDecision(
        row,
        optionsByListingId.get(row.listing.id) ?? [],
        automationGroupsByListingId.get(row.listing.id),
      )) === status;
  }), [activeOnly, automationGroupsByListingId, onSaleListingIdSet, optionsByListingId, selectedProducts, status]);
  const pageRows = filteredProducts.slice((page - 1) * 50, page * 50);
  const pageListingIds = new Set(pageRows.map((row) => row.listing.id));
  const pageOptions = selectedOptions.filter((row) => pageListingIds.has(row.listing.id));

  const updateSelectedAccounts = (nextIds: string[]) => {
    const normalized = [...new Set(nextIds)].sort();
    const allIds = channelAccounts.map((account) => account.id).sort();
    updateUrl({
      accounts: normalized.length === allIds.length ? null : normalized.join(','),
      channelAccountId: null,
    });
  };

  const toggleAccount = (accountId: string) => {
    if (selectedAccountIdSet.has(accountId)) {
      if (selectedAccountIds.length === 1) return;
      updateSelectedAccounts(selectedAccountIds.filter((id) => id !== accountId));
      return;
    }
    updateSelectedAccounts([...selectedAccountIds, accountId]);
  };

  const clearFilters = () => {
    setSearchText('');
    setDebouncedSearch('');
    setStatus('all');
    setActiveOnly(true);
    updateUrl({
      accounts: null,
      activeOnly: null,
      channelAccountId: null,
      search: null,
      status: null,
      focusOptionId: null,
    });
  };

  return (
    <div className="space-y-6 animate-in pb-12">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h1 className="text-2xl font-bold text-slate-900">상품 매칭 센터</h1>
        <div className="flex shrink-0 items-center gap-2">
          {selectedAccount?.channel === 'coupang' ? (
            <button type="button" onClick={() => setImportOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-2 text-sm text-white hover:bg-purple-700">
              <Upload size={14} /> 쿠팡 Wing 상품 엑셀 가져오기
            </button>
          ) : null}
        </div>
      </div>

      {!accountsQuery.error && selectedAccountIds.length > 0 && !mappingsQuery.error ? (
        <RecipeAutomationPanel
          channelAccountIds={selectedAccountIds}
          includedChannelListingIds={activeOnly ? onSaleListingIds : undefined}
          inclusionFilterLoading={activeOnly && mappingsQuery.isLoading}
        />
      ) : null}

      <section aria-label="상품 매칭 필터" className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5">
        <fieldset className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <legend className="text-sm font-extrabold text-slate-800">채널 범위</legend>
            <button
              type="button"
              onClick={() => updateSelectedAccounts(channelAccounts.map((account) => account.id))}
              disabled={selectedAccountIds.length === channelAccounts.length}
              className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-purple-700 hover:bg-purple-50 disabled:text-slate-400"
            >
              전체 계정 선택
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {channelAccounts.map((account) => {
              const checked = selectedAccountIdSet.has(account.id);
              const productCount = (data?.products ?? []).filter((row) =>
                row.channelAccount.id === account.id).length;
              return (
                <label
                  key={account.id}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-3 transition-colors ${checked ? 'border-purple-300 bg-purple-50/70' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                >
                  <input
                    type="checkbox"
                    aria-label={`채널 계정 ${account.name}`}
                    checked={checked}
                    disabled={checked && selectedAccountIds.length === 1}
                    onChange={() => toggleAccount(account.id)}
                    className="sr-only"
                  />
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${checked ? 'border-purple-600 bg-purple-600 text-white' : 'border-slate-300 bg-white text-transparent'}`}>
                    <Check size={13} strokeWidth={3} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-slate-800">{account.name}</span>
                    <span className="mt-0.5 block text-xs text-slate-500">{account.channel} · 상품 {formatCount(productCount)}개</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="grid gap-4 xl:grid-cols-[minmax(320px,1fr)_minmax(520px,1.5fr)]">
          <label className="space-y-1.5 text-xs font-semibold text-slate-600">
            <span>채널 상품·옵션 검색</span>
            <span className="relative block">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input aria-label="채널 상품·옵션 검색" value={searchText} onChange={(event) => { setSearchText(event.target.value); updateUrl({ search: event.target.value.trim() || null }); }} placeholder="상품명, 외부 상품 ID, SKU, 바코드" className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm font-normal text-slate-900 outline-none focus:border-purple-600" />
            </span>
          </label>
          <fieldset className="space-y-1.5">
            <legend className="text-xs font-semibold text-slate-600">상품·재고 상태</legend>
            <div className="flex flex-wrap gap-2">
              <label className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-2 text-xs font-bold ${activeOnly ? 'border-purple-200 bg-purple-50 text-purple-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
                <input
                  type="checkbox"
                  checked={activeOnly}
                  onChange={(event) => {
                    const nextActiveOnly = event.target.checked;
                    setActiveOnly(nextActiveOnly);
                    updateUrl({ activeOnly: nextActiveOnly ? null : 'false' });
                  }}
                  className="h-4 w-4 rounded border-slate-300 accent-purple-600"
                />
                판매중 상품만
              </label>
              {STATUS_OPTIONS.map(([value, label]) => (
                <label key={value} className="cursor-pointer">
                  <input
                    type="radio"
                    name="matching-status"
                    value={value}
                    checked={status === value}
                    onChange={() => {
                      setStatus(value);
                      updateUrl({ status: value === 'all' ? null : value });
                    }}
                    className="sr-only"
                  />
                  <span className={`inline-flex rounded-full border px-3 py-2 text-xs font-bold ${status === value ? 'border-purple-600 bg-purple-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
                    {label}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>
        {(selectedAccountIds.length !== channelAccounts.length || !activeOnly || status !== 'all' || searchText.trim()) ? (
          <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800">
            <X size={13} /> 필터 초기화
          </button>
        ) : null}
      </section>

      {accountsQuery.error ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{friendlyError(accountsQuery.error)}</p> : null}
      {!accountsQuery.isLoading && !accountsQuery.error && channelAccounts.length === 0 ? <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">활성화된 coupang 또는 rocket 채널 계정이 없습니다. 계정 설정을 먼저 확인해 주세요.</p> : null}
      {selectedAccountIds.length > 0 && mappingsQuery.error ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{friendlyError(mappingsQuery.error)}</p> : null}
      {isRefreshing ? <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-500"><Loader2 size={13} className="animate-spin text-purple-600" /> 목록 갱신 중</div> : null}

      {!accountsQuery.error && selectedAccountIds.length > 0 && !mappingsQuery.error ? (
        <ProductInventoryMatchingTable
          products={pageRows}
          options={pageOptions}
          productGroups={automationPreviews.flatMap((preview) => preview.productGroups)}
          loading={mappingsQuery.isLoading && !data}
          onEditProduct={setProductTarget}
          onEditVariant={setVariantTarget}
          onShowRecipeSuggestion={setSuggestionTarget}
          automationItemsByOptionId={automationItemsByOptionId}
          focusOptionId={focusOptionId}
        />
      ) : null}
      {selectedAccountIds.length > 0 && !mappingsQuery.error && filteredProducts.length > 50 ? <Pagination page={page} limit={50} total={filteredProducts.length} onPageChange={(nextPage) => updateUrl({ page: String(nextPage) }, false)} /> : null}

      <CoupangWingCatalogImportDialog open={importOpen} account={selectedAccount?.channel === 'coupang' ? selectedAccount : null} onOpenChange={setImportOpen} onSuccess={() => void mappingsQuery.refetch()} />
      {productTarget ? <ProductLinkDialog open row={productTarget} onOpenChange={(next) => { if (!next) setProductTarget(null); }} /> : null}
      {variantTarget ? <VariantLinkDialog open row={variantTarget} onOpenChange={(next) => { if (!next) setVariantTarget(null); }} /> : null}
      {suggestionTarget ? <RecipeSuggestionDialog open row={suggestionTarget} onOpenChange={(next) => { if (!next) setSuggestionTarget(null); }} /> : null}
    </div>
  );
}

function formatCount(value: number): string {
  return value.toLocaleString('ko-KR');
}

function normalizedOperatorStatus(value: string | null): typeof STATUS_OPTIONS[number][0] {
  if (value === 'matched' || value === 'auto_apply' || value === 'already_configured') {
    return 'matched';
  }
  if (value === 'quantity_review') return 'quantity_review';
  if (
    value === 'unmatched'
    || value === 'operator_review'
    || value === 'blocked'
    || value === 'needs_review'
  ) {
    return 'unmatched';
  }
  return 'all';
}
