'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Pagination } from '@/components/ui/Pagination';
import { formatNumber } from '@/lib/utils';
import { queryKeys } from '@/lib/query-keys';
import { ProductPipelineHeader } from '../_shared/components/inbox/ProductPipelineHeader';
import { ProductPipelineStats } from '../_shared/components/inbox/ProductPipelineStats';
import { ProductInboxListFrame } from '../_shared/components/inbox/ProductInboxListFrame';
import { ProductInboxToolbar } from '../_shared/components/inbox/ProductInboxToolbar';
import { channelDisplayName, RegisteredListingCard } from './components/RegisteredListingCard';
import { CoupangCatalogImportPanel } from './components/CoupangCatalogImportPanel';
import {
  channelListingsApi,
  type RegisteredChannelListing,
  type RegisteredListingSort,
  type RegisteredMarketCount,
} from './lib/channel-listings-api';
import { registeredListingWorkspaceHref } from './lib/registered-listing-navigation';

type RegisteredListingFilter = 'registered' | 'recent' | 'deleted';
type MarketFilter = 'all' | `channel:${string}`;

const MARKET_SUMMARY_CHANNELS = [
  { channel: 'smartstore', label: '스마트스토어' },
  { channel: 'coupang', label: '쿠팡' },
  { channel: '11st', label: '11번가(일반)' },
  { channel: '11st-global', label: '11번가(글로벌)' },
  { channel: 'esmplus', label: 'ESM Plus' },
] as const;

export default function RegisteredProductsPage() {
  const router = useRouter();
  const recentCreatedSince = useMemo(
    () => new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    [],
  );
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sort, setSort] = useState<RegisteredListingSort>('newest');
  const [filter, setFilter] = useState<RegisteredListingFilter>('registered');
  const [marketFilter, setMarketFilter] = useState<MarketFilter>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const selectedChannel = marketFilter.startsWith('channel:')
    ? marketFilter.slice('channel:'.length)
    : null;
  const listingTab = filter === 'deleted' ? 'deleted' : 'registered';
  const recentFilterCreatedSince = filter === 'recent' ? recentCreatedSince : null;

  const queryParams = {
    page: String(page),
    limit: String(pageSize),
    sort,
    tab: filter,
    market: marketFilter,
    ...(recentFilterCreatedSince ? { createdSince: recentFilterCreatedSince } : {}),
  };
  const summaryQueryParams = {
    tab: listingTab,
  };
  const { data, isLoading, isPlaceholderData } = useQuery({
    queryKey: queryKeys.channelListings.list(queryParams),
    queryFn: () => channelListingsApi.list({
      page,
      limit: pageSize,
      sort,
      tab: listingTab,
      channel: selectedChannel,
      createdSince: recentFilterCreatedSince,
    }),
    placeholderData: previousData => previousData,
  });
  const isRefreshing = isPlaceholderData;
  const { data: summaryData } = useQuery({
    queryKey: queryKeys.channelListings.list(summaryQueryParams),
    queryFn: () => channelListingsApi.list({
      page: 1,
      limit: 1,
      tab: listingTab,
    }),
  });

  const listings = data?.items ?? [];
  const total = data?.total ?? 0;
  const marketCounts = summaryData?.marketCounts ?? data?.marketCounts ?? [];
  const visibleIds = listings.map((item) => item.id);
  const selectedVisibleCount = visibleIds.filter((id) => selectedIds.has(id)).length;
  const allVisibleSelected = visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;

  const setItemSelected = (id: string, selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (selected) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleVisibleSelection = (selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      visibleIds.forEach((id) => {
        if (selected) next.add(id);
        else next.delete(id);
      });
      return next;
    });
  };

  const openListing = (listing: RegisteredChannelListing) => {
    router.push(registeredListingWorkspaceHref(listing));
  };

  const marketTabs = useMemo(() => {
    const channels = new Set(marketCounts.map((item) => item.channel));
    return [
      { key: 'all' as MarketFilter, label: '전체 마켓' },
      ...Array.from(channels).sort().map((channel) => ({
        key: `channel:${channel}` as MarketFilter,
        label: channelDisplayName(channel),
      })),
    ];
  }, [marketCounts]);

  return (
    <div className="flex h-full flex-col bg-slate-50">
      <ProductPipelineHeader
        title="등록 상품"
        subtitle="마켓 채널별 등록 상품 관리"
        searchPlaceholder="상품명 · 상품코드 · 마켓 상품번호 검색"
      />

      <MarketplaceSummaryBar
        counts={marketCounts}
        activeChannel={selectedChannel}
        onSelectChannel={(channel) => {
          setMarketFilter(channel ? `channel:${channel}` : 'all');
          setPage(1);
        }}
      />

      <CoupangCatalogImportPanel />

      <ProductPipelineStats
        draftLabel="선택 상품"
        totalLabel="등록 상품"
        draftCount={selectedIds.size}
        totalCount={total}
      />

      <ProductInboxToolbar
        tabs={[
          { key: 'registered', label: '등록한 상품' },
          { key: 'recent', label: '최근 등록한 상품' },
          { key: 'deleted', label: '모든 마켓에서 삭제한 상품' },
        ]}
        activeTab={filter}
        onTabChange={(nextFilter) => {
          setFilter(nextFilter);
          setSelectedIds(new Set());
          setPage(1);
        }}
        sort={sort}
        sortOptions={[
          { value: 'newest', label: '최종 등록일 최신순' },
          { value: 'oldest', label: '오래된순' },
          { value: 'name_asc', label: '상품명순' },
        ]}
        onSortChange={(nextSort) => {
          setSort(nextSort);
          setPage(1);
        }}
        pageSize={pageSize}
        onPageSizeChange={(nextPageSize) => {
          setPageSize(nextPageSize);
          setPage(1);
        }}
        actions={
          <>
            <div className="flex items-center gap-1">
              {marketTabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  aria-pressed={marketFilter === tab.key}
                  onClick={() => {
                    setMarketFilter(tab.key);
                    setPage(1);
                  }}
                  className={
                    marketFilter === tab.key
                      ? 'h-7 rounded-md bg-slate-900 px-3 font-semibold text-white'
                      : 'h-7 rounded-md border border-slate-200 bg-white px-3 font-medium text-slate-600 hover:bg-slate-50'
                  }
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="flex h-7 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:border-slate-300"
            >
              <SlidersHorizontal size={14} />
              필터
            </button>
            <button
              type="button"
              onClick={() => router.push('/product-pipeline/collected-products')}
              className="flex h-7 items-center gap-1.5 rounded-md bg-emerald-500 px-3 font-semibold text-white transition-colors hover:bg-emerald-600"
            >
              <Plus size={14} />
              상품 등록하기
            </button>
          </>
        }
      />

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {isRefreshing && (
          <div className="mb-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm" aria-live="polite">
            <RefreshCw size={14} className="animate-spin text-emerald-600" />
            등록 상품 목록을 갱신 중입니다.
          </div>
        )}
        <div aria-busy={isRefreshing}>
        <ProductInboxListFrame
          isLoading={isLoading && !data}
          isEmpty={listings.length === 0}
          emptyState={{
            title: filter === 'deleted'
              ? '삭제된 마켓 상품이 없어요.'
              : filter === 'recent'
                ? '최근 7일 동안 등록된 상품이 없어요.'
                : '아직 등록된 상품이 없어요.',
            description: filter === 'deleted'
              ? '모든 마켓에서 삭제 처리된 상품이 생기면 여기에 표시됩니다.'
              : filter === 'recent'
                ? '최근 등록 상품은 등록일 기준 7일 동안 이 탭에 표시됩니다.'
                : '수집 상품에서 제품 등록을 완료한 뒤 마켓에 등록하면 여기에 표시됩니다.',
          }}
          selectionAction={{
            checked: allVisibleSelected,
            onChange: toggleVisibleSelection,
          }}
        >
          {listings.map((listing) => (
            <RegisteredListingCard
              key={listing.id}
              listing={listing}
              selected={selectedIds.has(listing.id)}
              onOpen={openListing}
              onSelectedChange={setItemSelected}
            />
          ))}
        </ProductInboxListFrame>
        </div>

        <div className="mt-4">
          <Pagination page={page} limit={pageSize} total={total} onPageChange={setPage} />
        </div>
      </div>
    </div>
  );
}

function MarketplaceSummaryBar({
  counts,
  activeChannel,
  onSelectChannel,
}: {
  counts: RegisteredMarketCount[];
  activeChannel: string | null;
  onSelectChannel: (channel: string | null) => void;
}) {
  const totalsByChannel = new Map<string, number>();
  counts.forEach((item) => {
    totalsByChannel.set(item.channel, (totalsByChannel.get(item.channel) ?? 0) + item.count);
  });
  const knownChannels = new Set<string>(MARKET_SUMMARY_CHANNELS.map((item) => item.channel));
  const cards = [
    ...MARKET_SUMMARY_CHANNELS,
    ...Array.from(totalsByChannel.keys())
      .filter((channel) => !knownChannels.has(channel))
      .sort()
      .map((channel) => ({ channel, label: channelDisplayName(channel) })),
  ];

  return (
    <section className="border-b border-slate-200 px-5 py-4">
      <h2 className="mb-3 text-sm font-bold text-slate-900">마켓별 등록한 상품 수</h2>
      <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-slate-200 bg-white sm:grid-cols-3 lg:grid-cols-5">
        {cards.map((card) => {
          const count = totalsByChannel.get(card.channel) ?? 0;
          const selected = activeChannel === card.channel;
          return (
            <button
              key={card.channel}
              type="button"
              aria-pressed={selected}
              onClick={() => onSelectChannel(selected ? null : card.channel)}
              className="min-h-[88px] border-r border-slate-200 px-5 py-4 text-left transition-colors last:border-r-0 hover:bg-slate-50 aria-pressed:bg-emerald-50"
            >
              <div className="text-sm font-black text-slate-700">{card.label}</div>
              <div className="mt-5 text-2xl font-black tabular-nums text-slate-950">
                {count > 0 ? formatNumber(count) : '-'}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
