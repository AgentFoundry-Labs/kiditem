'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, RefreshCw, Search, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { friendlyError } from '@/lib/api-error';
import { ChannelSkuComponentDialog } from './components/ChannelSkuComponentDialog';
import { ChannelSkuMappingTable } from './components/ChannelSkuMappingTable';
import { CoupangWingCatalogImportDialog } from './components/CoupangWingCatalogImportDialog';
import { MappingSummaryCards } from './components/MappingSummaryCards';
import {
  MappingStatusTabs,
  type MappingStatusFilter,
} from './components/MappingStatusTabs';
import {
  useChannelAccounts,
  useChannelSkuMappings,
  useRefreshChannelSkuMappingStatuses,
} from './hooks/useChannelSkuMappings';
import type { ChannelSkuMappingCounts, ChannelSkuMappingListItem } from '@kiditem/shared/channel-sku-matching';

const PAGE_LIMIT = 50;
const SEARCH_DEBOUNCE_MS = 300;
const STALE_STATUS_WARNING =
  "매칭 상태를 새로고치지 못했습니다. 목록 상태가 오래되었을 수 있습니다. '새로고침'을 눌러 다시 시도해 주세요.";
const EMPTY_COUNTS: ChannelSkuMappingCounts = {
  all: 0,
  unmatched: 0,
  needsReview: 0,
  matched: 0,
};

export default function MatchingPage() {
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [mappingStatus, setMappingStatus] = useState<MappingStatusFilter>('all');
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [importOpen, setImportOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ChannelSkuMappingListItem | null>(null);
  const [statusRefreshWarning, setStatusRefreshWarning] = useState<string | null>(null);

  const accountsQuery = useChannelAccounts();
  const channelAccounts = useMemo(
    () =>
      [...(accountsQuery.data ?? [])]
        .filter((account) => account.channel === 'coupang' || account.channel === 'rocket')
        .sort((left, right) => {
          if (left.isPrimary !== right.isPrimary) return left.isPrimary ? -1 : 1;
          const nameOrder = left.name.localeCompare(right.name, 'ko');
          return nameOrder !== 0 ? nameOrder : left.id.localeCompare(right.id);
        }),
    [accountsQuery.data],
  );
  const selectedAccount =
    channelAccounts.find((account) => account.id === selectedAccountId) ??
    channelAccounts[0] ??
    null;

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(searchText.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timeout);
  }, [searchText]);

  const mappingsQuery = useChannelSkuMappings({
    accountMode: 'selected',
    channelAccountId: selectedAccount?.id,
    mappingStatus,
    search: debouncedSearch,
    page,
    limit: PAGE_LIMIT,
  });
  const refreshStatuses = useRefreshChannelSkuMappingStatuses();
  const lastAutoRefreshAccountId = useRef<string | null>(null);

  useEffect(() => {
    if (!selectedAccount?.id || lastAutoRefreshAccountId.current === selectedAccount.id) {
      return;
    }
    const channelAccountId = selectedAccount.id;
    lastAutoRefreshAccountId.current = channelAccountId;
    void refreshStatuses
      .mutateAsync({ channelAccountId })
      .then(() => {
        if (lastAutoRefreshAccountId.current === channelAccountId) {
          setStatusRefreshWarning(null);
        }
      })
      .catch(() => {
        if (lastAutoRefreshAccountId.current === channelAccountId) {
          setStatusRefreshWarning(STALE_STATUS_WARNING);
        }
      });
  }, [refreshStatuses.mutateAsync, selectedAccount?.id]);

  const handleManualRefresh = async () => {
    if (!selectedAccount) return;
    try {
      await refreshStatuses.mutateAsync({ channelAccountId: selectedAccount.id });
      setStatusRefreshWarning(null);
      toast.success('매칭 상태를 새로고침했습니다.');
    } catch (error) {
      setStatusRefreshWarning(STALE_STATUS_WARNING);
      toast.error(friendlyError(error) ?? '매칭 상태 새로고침에 실패했습니다.');
    }
  };

  const data = mappingsQuery.data;
  const counts = data?.counts ?? EMPTY_COUNTS;
  const hasActiveFilter = mappingStatus !== 'all' || debouncedSearch.length > 0;
  const emptyMessage =
    !hasActiveFilter && counts.all === 0
      ? '아직 가져온 Wing 상품 카탈로그가 없습니다.'
      : '현재 필터에 맞는 채널 SKU가 없습니다.';
  const isRefreshing = mappingsQuery.isFetching && !mappingsQuery.isLoading;

  return (
    <div className="space-y-6 animate-in pb-12">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">상품 매칭 센터</h1>
          <p className="mt-1 text-sm text-slate-500">
            쇼핑몰 옵션 SKU와 Sellpia 구성품의 연결 상태를 관리합니다.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={!selectedAccount || refreshStatuses.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw
              size={14}
              className={refreshStatuses.isPending ? 'animate-spin' : ''}
            />
            새로고침
          </button>
          {selectedAccount?.channel === 'coupang' ? (
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-2 text-sm text-white hover:bg-purple-700 disabled:opacity-50"
            >
              <Upload size={14} />
              쿠팡 Wing 상품 엑셀 가져오기
            </button>
          ) : null}
        </div>
      </div>

      <MappingSummaryCards
        counts={counts}
        loading={mappingsQuery.isLoading && !data}
      />

      <section aria-label="채널 SKU 필터" className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(240px,360px)_minmax(280px,1fr)]">
          <label className="space-y-1.5 text-xs font-semibold text-[var(--text-secondary,#475569)]">
            <span>채널 계정</span>
            <select
              aria-label="채널 계정"
              value={selectedAccount?.id ?? ''}
              onChange={(event) => {
                setSelectedAccountId(event.target.value);
                setPage(1);
              }}
              disabled={accountsQuery.isLoading || channelAccounts.length === 0}
              className="w-full rounded-lg border border-[var(--border,#cbd5e1)] bg-[var(--surface,#fff)] px-3 py-2 text-sm font-normal text-[var(--text-primary,#0f172a)] outline-none focus:border-[var(--primary,#7048e8)] disabled:opacity-50"
            >
              {channelAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1.5 text-xs font-semibold text-[var(--text-secondary,#475569)]">
            <span>채널 SKU 검색</span>
            <span className="relative block">
              <Search
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary,#94a3b8)]"
              />
              <input
                aria-label="채널 SKU 검색"
                value={searchText}
                onChange={(event) => {
                  setSearchText(event.target.value);
                  setPage(1);
                }}
                placeholder="상품명, 외부 상품 ID, SKU, 바코드, 모델번호"
                className="w-full rounded-lg border border-[var(--border,#cbd5e1)] bg-[var(--surface,#fff)] py-2 pl-9 pr-3 text-sm font-normal text-[var(--text-primary,#0f172a)] outline-none focus:border-[var(--primary,#7048e8)]"
              />
            </span>
          </label>
        </div>

        <MappingStatusTabs
          active={mappingStatus}
          counts={counts}
          onChange={(status) => {
            setMappingStatus(status);
            setPage(1);
          }}
        />
      </section>

      {accountsQuery.error ? (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {friendlyError(accountsQuery.error)}
        </p>
      ) : null}
      {!accountsQuery.isLoading && channelAccounts.length === 0 ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          활성화된 coupang 또는 rocket 채널 계정이 없습니다. 계정 설정을 먼저 확인해 주세요.
        </p>
      ) : null}
      {mappingsQuery.error ? (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {friendlyError(mappingsQuery.error)}
        </p>
      ) : null}
      {statusRefreshWarning ? (
        <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          {statusRefreshWarning}
        </p>
      ) : null}
      {isRefreshing ? (
        <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border,#e2e8f0)] bg-[var(--surface,#fff)] px-3 py-1.5 text-xs text-[var(--text-secondary,#64748b)]">
          <Loader2 size={13} className="animate-spin text-[var(--primary,#7048e8)]" />
          목록 갱신 중
        </div>
      ) : null}

      <ChannelSkuMappingTable
        items={data?.items ?? []}
        total={data?.total ?? 0}
        page={page}
        limit={PAGE_LIMIT}
        loading={mappingsQuery.isLoading && !data}
        emptyMessage={emptyMessage}
        onPageChange={setPage}
        onEdit={setEditTarget}
      />

      <CoupangWingCatalogImportDialog
        open={importOpen}
        account={selectedAccount?.channel === 'coupang' ? selectedAccount : null}
        onOpenChange={setImportOpen}
        onSuccess={() => setPage(1)}
      />

      {editTarget ? (
        <ChannelSkuComponentDialog
          key={editTarget.sku.id}
          open
          item={editTarget}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setEditTarget(null);
          }}
        />
      ) : null}
    </div>
  );
}
