'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Check, Loader2, Search, Upload, X } from 'lucide-react';
import { friendlyError } from '@/lib/api-error';
import {
  ProductInventoryMatchingTable,
  productMatchingStatus,
} from './components/ProductInventoryMatchingTable';
import { ChannelCatalogImportDialog } from './components/ChannelCatalogImportDialog';
import { ProductLinkDialog } from './components/ProductLinkDialog';
import { isChannelListingOnSale } from './lib/channel-listing-sale-status';
import { Pagination } from '@/components/ui/Pagination';
import { CollectionStopOnlyControl } from '@/components/collection/CollectionStopOnlyControl';
import { useCollectionSourceControl } from '@/hooks/use-collection-source-control';
import { sellpiaManualMatchCollectionSource } from './lib/sellpia-manual-match-source';
import {
  useChannelAccounts,
  useChannelProductMappings,
  useRunChannelProductMatching,
} from './hooks/useChannelSkuMappings';
import type {
  ChannelOptionMatchingQueueRow,
  ChannelProductMatchingQueueRow,
} from '@kiditem/shared/channel-product-matching';

const SEARCH_DEBOUNCE_MS = 300;
const STATUS_OPTIONS = [
  ['all', '전체'],
  ['attention', '매칭 확인 필요'],
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

  const updateUrl = (changes: Record<string, string | null>, resetPage = true) => {
    const next = new URLSearchParams(searchParams.toString());
    Object.entries(changes).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key));
    if (resetPage) next.set('page', '1');
    if (Object.hasOwn(changes, 'search')) pendingInternalSearch.current = changes.search ?? '';
    router.replace(`${pathname}?${next.toString()}`);
  };

  const accountsQuery = useChannelAccounts();

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

  const mappingsQuery = useChannelProductMappings({ search: debouncedSearch, enabled: true });
  const autoMatch = useRunChannelProductMatching();
  const data = mappingsQuery.data;
  /**
   * 리스팅이 있는 몰은 전부 고를 수 있다.
   *
   * 예전에는 계정 목록(`/api/channels/accounts`)만 읽어 쿠팡 · 로켓만 보여 줬다. 그 목록은
   * `status: 'active'` 만 주는데 몰 계정 행은 `configured` 라, 사방넷 · 키드키즈 ·
   * 아이스크림몰에서 가져온 리스팅은 이어지지 않아도 사람이 확인할 화면이 아예 없었다
   * (사장님 2026-09-17). 그래서 대기열에 실제로 줄이 있는 계정을 함께 센다 — 가져온 몰은
   * 상태와 상관없이 선다. 쿠팡을 앞에 두는 순서는 그대로다 — 가장 많이 보는 계정이다.
   */
  const channelAccounts = useMemo(() => {
    const byId = new Map<string, { id: string; channel: string; name: string }>();
    for (const account of accountsQuery.data ?? []) {
      byId.set(account.id, { id: account.id, channel: account.channel, name: account.name });
    }
    for (const row of [...(data?.products ?? []), ...(data?.options ?? [])]) {
      if (!byId.has(row.channelAccount.id)) byId.set(row.channelAccount.id, row.channelAccount);
    }
    return [...byId.values()].sort((left, right) => {
      const rank = (channel: string) => (channel === 'coupang' ? 0 : channel === 'rocket' ? 1 : 2);
      if (rank(left.channel) !== rank(right.channel)) return rank(left.channel) - rank(right.channel);
      if (left.channel !== right.channel) return left.channel.localeCompare(right.channel);
      const nameOrder = left.name.localeCompare(right.name, 'ko');
      return nameOrder !== 0 ? nameOrder : left.id.localeCompare(right.id);
    });
  }, [accountsQuery.data, data?.options, data?.products]);
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
  /** 불러오기 대화상자는 쿠팡 계정 행 그대로를 받는다 — 대기열에서 센 몰 계정은 그 자리에 못 선다. */
  const selectedAccount = selectedAccountIds.length === 1
    ? (accountsQuery.data ?? []).find((account) => account.id === selectedAccountIds[0]) ?? null
    : null;
  const selectedProducts = useMemo(() => (data?.products ?? []).filter((row) =>
    selectedAccountIdSet.has(row.channelAccount.id)), [data?.products, selectedAccountIdSet]);
  const selectedOptions = useMemo(() => (data?.options ?? []).filter((row) =>
    selectedAccountIdSet.has(row.channelAccount.id)), [data?.options, selectedAccountIdSet]);
  const onSaleListingIdSet = useMemo(() => new Set((data?.products ?? [])
    .filter((row) => isChannelListingOnSale(row.listing.saleStatus))
    .map((row) => row.listing.id)), [data?.products]);
  const matchingSummary = useMemo(() => {
    const products = selectedProducts.filter((row) =>
      !activeOnly || onSaleListingIdSet.has(row.listing.id));
    const listingIds = new Set(products.map(({ listing }) => listing.id));
    const options = selectedOptions.filter(({ listing }) => listingIds.has(listing.id));
    return {
      productCount: products.length,
      linkedProductCount: products.filter(({ listing }) => Boolean(listing.masterProductId)).length,
      optionCount: options.length,
      configuredOptionCount: options.filter(({ option }) => option.inventoryComponents.length > 0).length,
      quantityReviewCount: options.filter(({ option, capacity }) =>
        option.inventoryComponents.length > 0 && capacity === null).length,
    };
  }, [activeOnly, onSaleListingIdSet, selectedOptions, selectedProducts]);
  const visibleProductCountByAccountId = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of data?.products ?? []) {
      if (activeOnly && !onSaleListingIdSet.has(row.listing.id)) continue;
      counts.set(row.channelAccount.id, (counts.get(row.channelAccount.id) ?? 0) + 1);
    }
    return counts;
  }, [activeOnly, data?.products, onSaleListingIdSet]);
  /**
   * 몰마다 매칭률 — 그 계정의 옵션 가운데 셀피아 재고 레시피가 붙은 비율.
   *
   * 어느 몰이 덜 이어졌는지 한눈에 보라고 계정 칩에 적는다. 분모는 지금 화면이 보고 있는
   * 옵션이다(활성만 보기를 켜면 그 범위로 줄어든다) — 칩의 상품 수와 같은 기준이어야
   * 둘이 어긋나 보이지 않는다.
   */
  const matchRateByAccountId = useMemo(() => {
    const totals = new Map<string, { total: number; matched: number }>();
    for (const row of data?.options ?? []) {
      if (activeOnly && !onSaleListingIdSet.has(row.listing.id)) continue;
      const current = totals.get(row.channelAccount.id) ?? { total: 0, matched: 0 };
      current.total += 1;
      if (row.option.inventoryComponents.length > 0) current.matched += 1;
      totals.set(row.channelAccount.id, current);
    }
    return totals;
  }, [activeOnly, data?.options, onSaleListingIdSet]);
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
    const matchingStatus = productMatchingStatus(
      row,
      optionsByListingId.get(row.listing.id) ?? [],
    );
    return status === 'attention'
      ? matchingStatus === 'unmatched' || matchingStatus === 'quantity_review'
      : matchingStatus === status;
  }), [activeOnly, onSaleListingIdSet, optionsByListingId, selectedProducts, status]);
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
          <button
            type="button"
            disabled={autoMatch.isPending || selectedAccountIds.length === 0}
            onClick={() => autoMatch.mutate({ channelAccountIds: selectedAccountIds })}
            className="inline-flex items-center gap-1.5 rounded-lg border border-purple-600 bg-white px-3 py-2 text-sm font-bold text-purple-700 disabled:opacity-50"
          >
            {autoMatch.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} 자동 매칭
          </button>
          <button
            type="button"
            disabled={channelAccounts.length === 0}
            onClick={() => setImportOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-2 text-sm text-white hover:bg-purple-700 disabled:opacity-50"
          >
            <Upload size={14} /> 상품 파일 가져오기
          </button>
        </div>
      </div>

      <SellpiaManualMatchCollectionControl startInFlight={autoMatch.isPending} />

      {autoMatch.error ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{friendlyError(autoMatch.error)}</p> : null}
      {autoMatch.data ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">상품 {autoMatch.data.matchedListings}개 · 재고 구성 {autoMatch.data.configuredOptions}개를 자동 매칭했습니다.</p> : null}

      <MatchingSummaryCards summary={matchingSummary} />

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
              const productCount = visibleProductCountByAccountId.get(account.id) ?? 0;
              const match = matchRateByAccountId.get(account.id);
              const matchRate = match && match.total > 0
                ? Math.round((match.matched / match.total) * 100)
                : null;
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
                    <span className="mt-0.5 block text-xs text-slate-500">
                      {account.channel} · 상품 {formatCount(productCount)}개
                      {matchRate === null ? null : (
                        <>
                          {' · '}
                          <span
                            className={`font-bold ${matchRate >= 70 ? 'text-emerald-700' : matchRate >= 30 ? 'text-amber-700' : 'text-rose-700'}`}
                            title={`옵션 ${formatCount(match!.total)}개 중 ${formatCount(match!.matched)}개가 셀피아 재고에 이어졌습니다.`}
                          >
                            매칭 {matchRate}%
                          </span>
                        </>
                      )}
                    </span>
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
      {!accountsQuery.isLoading && !mappingsQuery.isLoading && !accountsQuery.error && channelAccounts.length === 0 ? <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">리스팅을 가져온 몰 계정이 없습니다. 쇼핑몰 현황에서 몰 상품을 먼저 가져와 주세요.</p> : null}
      {selectedAccountIds.length > 0 && mappingsQuery.error ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{friendlyError(mappingsQuery.error)}</p> : null}
      {isRefreshing ? <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-500"><Loader2 size={13} className="animate-spin text-purple-600" /> 목록 갱신 중</div> : null}

      {!accountsQuery.error && selectedAccountIds.length > 0 && !mappingsQuery.error ? (
        <ProductInventoryMatchingTable
          products={pageRows}
          options={pageOptions}
          loading={mappingsQuery.isLoading && !data}
          onEditProduct={setProductTarget}
          focusOptionId={focusOptionId}
        />
      ) : null}
      {selectedAccountIds.length > 0 && !mappingsQuery.error && filteredProducts.length > 50 ? <Pagination page={page} limit={50} total={filteredProducts.length} onPageChange={(nextPage) => updateUrl({ page: String(nextPage) }, false)} /> : null}

      <ChannelCatalogImportDialog
        open={importOpen}
        accounts={accountsQuery.data ?? []}
        defaultAccount={selectedAccount}
        onOpenChange={setImportOpen}
        onSuccess={() => void mappingsQuery.refetch()}
      />
      {productTarget ? <ProductLinkDialog open row={productTarget} options={selectedOptions.filter(({ listing }) => listing.id === productTarget.listing.id)} onOpenChange={(next) => { if (!next) setProductTarget(null); }} /> : null}
    </div>
  );
}

function MatchingSummaryCards({ summary }: {
  summary: {
    productCount: number;
    linkedProductCount: number;
    optionCount: number;
    configuredOptionCount: number;
    quantityReviewCount: number;
  };
}) {
  const cards = [
    ['현재 필터 채널상품', formatCount(summary.productCount)],
    ['단일 재고상품 요약', `${formatCount(summary.linkedProductCount)} / ${formatCount(summary.productCount)}`],
    ['옵션별 재고 설정', `${formatCount(summary.configuredOptionCount)} / ${formatCount(summary.optionCount)}`],
    ['수량 검토', formatCount(summary.quantityReviewCount)],
  ] as const;
  return <section aria-label="상품 매칭 요약" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([label, value]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs font-bold text-slate-500">{label}</p><p className="mt-1 text-2xl font-extrabold text-slate-900">{value}</p></div>)}</section>;
}

function formatCount(value: number): string {
  return value.toLocaleString('ko-KR');
}

function normalizedOperatorStatus(value: string | null): typeof STATUS_OPTIONS[number][0] {
  if (value === 'attention') return 'attention';
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

/**
 * 셀피아 수동상품매칭 수집의 진행 중 표시와 운영자 중단. 시작은 매칭 실행이 그대로
 * 한다(뒤이어 도는 매칭이 그 스냅샷을 쓴다). 컨트롤은 owner가 말하는 진행 중과
 * 중단만 맡는다(KID-159). 그 매칭이 도는 동안에는 owner를 진행 중 주기로 읽어, 짧은
 * 수집도 중단할 틈을 준다(KID-170 D3).
 */
function SellpiaManualMatchCollectionControl({ startInFlight }: { startInFlight: boolean }) {
  const adapter = useMemo(
    () => sellpiaManualMatchCollectionSource({ localStartInFlight: startInFlight }),
    [startInFlight],
  );
  const control = useCollectionSourceControl(adapter);

  return (
    <CollectionStopOnlyControl
      control={control}
      label="셀피아 수동상품매칭 수집"
      className="rounded-xl px-4"
    />
  );
}
