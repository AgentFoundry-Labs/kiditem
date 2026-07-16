'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, Search, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { SellpiaWorkspaceFreshnessStatus } from '@/components/sellpia-inventory';
import { friendlyError } from '@/lib/api-error';
import { ChannelSkuMappingTable } from './components/ChannelSkuMappingTable';
import { CoupangWingCatalogImportDialog } from './components/CoupangWingCatalogImportDialog';
import { MappingSummaryCards } from './components/MappingSummaryCards';
import { ProductLinkDialog } from './components/ProductLinkDialog';
import { VariantLinkDialog } from './components/VariantLinkDialog';
import { useChannelAccounts, useChannelProductMappings } from './hooks/useChannelSkuMappings';
import type {
  ChannelOptionMatchingQueueRow,
  ChannelProductMatchingCounts,
  ChannelProductMatchingQueueRow,
} from '@kiditem/shared/channel-product-matching';

const SEARCH_DEBOUNCE_MS = 300;
const EMPTY_COUNTS: ChannelProductMatchingCounts = {
  products: { all: 0, matched: 0, unmatched: 0 },
  options: { all: 0, matched: 0, unmatched: 0, configurationRequired: 0, reviewRequired: 0 },
};

export default function MatchingPage() {
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [level, setLevel] = useState<'products' | 'options'>('products');
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [productTarget, setProductTarget] = useState<ChannelProductMatchingQueueRow | null>(null);
  const [variantTarget, setVariantTarget] = useState<ChannelOptionMatchingQueueRow | null>(null);

  const accountsQuery = useChannelAccounts();
  const channelAccounts = useMemo(
    () => [...(accountsQuery.data ?? [])]
      .filter((account) => account.channel === 'coupang' || account.channel === 'rocket')
      .sort((left, right) => {
        if (left.isPrimary !== right.isPrimary) return left.isPrimary ? -1 : 1;
        const nameOrder = left.name.localeCompare(right.name, 'ko');
        return nameOrder !== 0 ? nameOrder : left.id.localeCompare(right.id);
      }),
    [accountsQuery.data],
  );
  const selectedAccount = channelAccounts.find((account) => account.id === selectedAccountId)
    ?? channelAccounts[0]
    ?? null;

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(searchText.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timeout);
  }, [searchText]);

  const mappingsQuery = useChannelProductMappings({
    channelAccountId: selectedAccount?.id,
    search: debouncedSearch,
  });
  const data = mappingsQuery.data;
  const counts = data?.counts ?? EMPTY_COUNTS;
  const isRefreshing = mappingsQuery.isFetching && !mappingsQuery.isLoading;

  const refresh = async () => {
    try {
      const result = await mappingsQuery.refetch();
      if (result.error) throw result.error;
      toast.success('매칭 목록을 새로고침했습니다.');
    } catch (error) {
      toast.error(friendlyError(error) ?? '매칭 목록을 새로고치지 못했습니다.');
    }
  };

  return (
    <div className="space-y-6 animate-in pb-12">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">상품 매칭 센터</h1>
          <p className="mt-1 text-sm text-slate-500">
            채널 상품을 KidItem 상품에 먼저 연결하고, 채널 옵션을 해당 상품의 판매 옵션에 연결합니다.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <SellpiaWorkspaceFreshnessStatus />
          <button type="button" onClick={() => void refresh()} disabled={!selectedAccount || mappingsQuery.isFetching} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw size={14} className={mappingsQuery.isFetching ? 'animate-spin' : ''} /> 새로고침
          </button>
          {selectedAccount?.channel === 'coupang' ? (
            <button type="button" onClick={() => setImportOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-2 text-sm text-white hover:bg-purple-700">
              <Upload size={14} /> 쿠팡 Wing 상품 엑셀 가져오기
            </button>
          ) : null}
        </div>
      </div>

      {!accountsQuery.error && selectedAccount && !mappingsQuery.error ? (
        <MappingSummaryCards counts={counts} loading={mappingsQuery.isLoading && !data} />
      ) : null}

      <section aria-label="상품 매칭 필터" className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(240px,360px)_minmax(280px,1fr)]">
          <label className="space-y-1.5 text-xs font-semibold text-slate-600">
            <span>채널 계정</span>
            <select aria-label="채널 계정" value={selectedAccount?.id ?? ''} onChange={(event) => setSelectedAccountId(event.target.value)} disabled={accountsQuery.isLoading || channelAccounts.length === 0} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-purple-600 disabled:opacity-50">
              {channelAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
            </select>
          </label>
          <label className="space-y-1.5 text-xs font-semibold text-slate-600">
            <span>채널 상품·옵션 검색</span>
            <span className="relative block">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input aria-label="채널 상품·옵션 검색" value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="상품명, 외부 상품 ID, SKU, 바코드" className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm font-normal text-slate-900 outline-none focus:border-purple-600" />
            </span>
          </label>
        </div>
        <div role="group" aria-label="매칭 단계" className="inline-flex rounded-xl bg-slate-100 p-1">
          <button type="button" aria-pressed={level === 'products'} onClick={() => setLevel('products')} className={`rounded-lg px-4 py-2 text-sm font-bold ${level === 'products' ? 'bg-white text-purple-700 shadow-sm' : 'text-slate-600'}`}>1 상품 연결</button>
          <button type="button" aria-pressed={level === 'options'} onClick={() => setLevel('options')} className={`rounded-lg px-4 py-2 text-sm font-bold ${level === 'options' ? 'bg-white text-purple-700 shadow-sm' : 'text-slate-600'}`}>2 옵션 연결</button>
        </div>
      </section>

      {accountsQuery.error ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{friendlyError(accountsQuery.error)}</p> : null}
      {!accountsQuery.isLoading && !accountsQuery.error && channelAccounts.length === 0 ? <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">활성화된 coupang 또는 rocket 채널 계정이 없습니다. 계정 설정을 먼저 확인해 주세요.</p> : null}
      {selectedAccount && mappingsQuery.error ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{friendlyError(mappingsQuery.error)}</p> : null}
      {isRefreshing ? <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-500"><Loader2 size={13} className="animate-spin text-purple-600" /> 목록 갱신 중</div> : null}

      {!accountsQuery.error && selectedAccount && !mappingsQuery.error ? (
        <ChannelSkuMappingTable
          level={level}
          products={data?.products ?? []}
          options={data?.options ?? []}
          loading={mappingsQuery.isLoading && !data}
          onEditProduct={setProductTarget}
          onEditVariant={setVariantTarget}
        />
      ) : null}

      <CoupangWingCatalogImportDialog open={importOpen} account={selectedAccount?.channel === 'coupang' ? selectedAccount : null} onOpenChange={setImportOpen} onSuccess={() => void mappingsQuery.refetch()} />
      {productTarget ? <ProductLinkDialog open row={productTarget} onOpenChange={(next) => { if (!next) setProductTarget(null); }} /> : null}
      {variantTarget ? <VariantLinkDialog open row={variantTarget} onOpenChange={(next) => { if (!next) setVariantTarget(null); }} /> : null}
    </div>
  );
}
