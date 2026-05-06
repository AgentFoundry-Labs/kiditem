'use client';

import { useMemo, useState } from 'react';
import { Database, Loader2, RefreshCw, ScanLine } from 'lucide-react';
import { toast } from 'sonner';
import { friendlyError } from '@/lib/api-error';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { formatDateTime, formatNumber } from '@/lib/utils';
import { SummaryCards } from './components/SummaryCards';
import { StatusTabs } from './components/StatusTabs';
import { ItemsTable } from './components/ItemsTable';
import { LinkProductOptionModal } from './components/LinkProductOptionModal';
import { scrapeReconciliationRows } from './lib/coupang-scrape';
import {
  type ReconciliationStatusFilter,
  useReconciliationSummary,
  useReconciliationItems,
  useScanReconciliation,
  useSyncReconciliationSnapshots,
  useLinkReconciliationItem,
  useIgnoreReconciliationItem,
} from './hooks/useReconciliation';
import type { ReconciliationItem } from '@kiditem/shared/channel-reconciliation';

const PAGE_LIMIT = 50;

export default function MatchingPage() {
  const [statusFilter, setStatusFilter] =
    useState<ReconciliationStatusFilter>('needs_review');
  const [page, setPage] = useState(1);

  const summaryQuery = useReconciliationSummary();
  const itemsQuery = useReconciliationItems({
    statusFilter,
    page,
    limit: PAGE_LIMIT,
  });

  const scan = useScanReconciliation();
  const snapshotSync = useSyncReconciliationSnapshots();
  const linkMutation = useLinkReconciliationItem();
  const ignoreMutation = useIgnoreReconciliationItem();

  const [linkTarget, setLinkTarget] = useState<ReconciliationItem | null>(null);
  const [ignoreTarget, setIgnoreTarget] = useState<ReconciliationItem | null>(null);

  const summary = summaryQuery.data;
  const counts = useMemo(
    () => ({
      autoLinked: summary?.autoLinked ?? 0,
      needsReview: summary?.needsReview ?? 0,
      conflict: summary?.conflict ?? 0,
      linked: summary?.linked ?? 0,
      ignored: summary?.ignored ?? 0,
    }),
    [summary],
  );

  // Keep a defensive client-side slice for the auto-linked tab; the backend also
  // receives `resolutionSource=auto_legacy_code` so pagination stays accurate.
  const tableItems = useMemo(() => {
    const rows = itemsQuery.data?.items ?? [];
    if (statusFilter === 'auto_linked') {
      return rows.filter((r) => r.resolutionSource === 'auto_legacy_code');
    }
    return rows;
  }, [itemsQuery.data, statusFilter]);

  const handleScan = async () => {
    try {
      const rows = await scrapeReconciliationRows();
      if (rows.length === 0) {
        toast.error('Wing 페이지에서 row 를 찾지 못했습니다');
        return;
      }
      const result = await scan.mutateAsync({ source: 'wing_inventory', rows });
      toast.success(
        `매칭 완료 — 자동 ${formatNumber(result.autoLinkedCount)} / 확인 ${formatNumber(
          result.needsReviewCount,
        )} / 충돌 ${formatNumber(result.conflictCount)} 건`,
      );
      setPage(1);
    } catch (error) {
      toast.error(friendlyError(error) ?? 'Wing 스캔 실패');
    }
  };

  const handleSnapshotSync = async () => {
    try {
      const result = await snapshotSync.mutateAsync();
      toast.success(
        `DB 동기화 완료 — 자동 ${formatNumber(result.autoLinkedCount)} / 확인 ${formatNumber(
          result.needsReviewCount,
        )} / 충돌 ${formatNumber(result.conflictCount)} 건`,
      );
      setPage(1);
    } catch (error) {
      toast.error(friendlyError(error) ?? 'DB 동기화 실패');
    }
  };

  const handleLinkConfirm = async (productOptionId: string) => {
    if (!linkTarget) return;
    try {
      await linkMutation.mutateAsync({ id: linkTarget.id, productOptionId });
      toast.success('연결 완료');
      setLinkTarget(null);
    } catch (error) {
      toast.error(friendlyError(error) ?? '연결 실패');
      throw error;
    }
  };

  const handleIgnoreConfirm = async () => {
    if (!ignoreTarget) return;
    try {
      await ignoreMutation.mutateAsync({ id: ignoreTarget.id });
      toast.success('제외 처리 완료');
      setIgnoreTarget(null);
    } catch (error) {
      toast.error(friendlyError(error) ?? '제외 실패');
    }
  };

  const lastRunLabel = summary?.lastRun?.finishedAt
    ? `마지막 스캔 ${formatDateTime(summary.lastRun.finishedAt)}`
    : summary?.lastRun
      ? '스캔 진행 중'
      : '스캔 이력 없음';

  const pendingActionId =
    linkMutation.variables?.id && linkMutation.isPending
      ? linkMutation.variables.id
      : ignoreMutation.variables?.id && ignoreMutation.isPending
        ? ignoreMutation.variables.id
        : null;

  return (
    <div className="space-y-6 animate-in pb-12">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">상품 매칭 센터</h1>
          <p className="text-sm text-slate-500 mt-1">
            쿠팡 상품을 KidItem 옵션에 연결합니다. 자동 매칭은 legacyCode 정확 일치만 적용되며, 충돌·미매칭은 수동 검토가 필요합니다.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-slate-400 hidden md:inline">{lastRunLabel}</span>
          <button
            type="button"
            onClick={() => {
              summaryQuery.refetch();
              itemsQuery.refetch();
            }}
            disabled={itemsQuery.isFetching || scan.isPending || snapshotSync.isPending}
            className="px-3 py-2 rounded-lg text-sm border border-slate-200 text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw size={14} className={itemsQuery.isFetching ? 'animate-spin' : ''} />
            새로고침
          </button>
          <button
            type="button"
            onClick={handleSnapshotSync}
            disabled={snapshotSync.isPending || scan.isPending}
            className="px-3 py-2 rounded-lg text-sm border border-slate-200 text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            {snapshotSync.isPending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Database size={14} />
            )}
            DB 동기화
          </button>
          <button
            type="button"
            onClick={handleScan}
            disabled={scan.isPending || snapshotSync.isPending}
            className="px-3 py-2 rounded-lg text-sm bg-purple-600 text-white hover:bg-purple-700 inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            {scan.isPending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <ScanLine size={14} />
            )}
            Wing 스캔
          </button>
        </div>
      </div>

      <SummaryCards summary={summary} loading={summaryQuery.isLoading} />

      <div className="space-y-3">
        <StatusTabs
          active={statusFilter}
          onChange={(next) => {
            setStatusFilter(next);
            setPage(1);
          }}
          counts={counts}
        />

        <ItemsTable
          items={tableItems}
          total={
            statusFilter === 'auto_linked'
              ? counts.autoLinked
              : itemsQuery.data?.total ?? 0
          }
          page={page}
          limit={PAGE_LIMIT}
          loading={itemsQuery.isLoading}
          emptyMessage={emptyMessageFor(statusFilter)}
          pendingActionId={pendingActionId}
          onPageChange={setPage}
          onLink={setLinkTarget}
          onIgnore={setIgnoreTarget}
        />
      </div>

      <LinkProductOptionModal
        open={!!linkTarget}
        item={linkTarget}
        isSubmitting={linkMutation.isPending}
        onClose={() => setLinkTarget(null)}
        onConfirm={handleLinkConfirm}
      />

      <ConfirmDialog
        open={!!ignoreTarget}
        onOpenChange={(open) => {
          if (!open) setIgnoreTarget(null);
        }}
        title="이 row 를 매칭 대상에서 제외할까요?"
        description={
          <>
            <span className="font-medium text-slate-700">
              {ignoreTarget?.channelProductName ?? ignoreTarget?.externalId ?? ''}
            </span>{' '}
            를 향후 스캔에서도 자동으로 무시합니다. 다시 매칭하려면 같은 화면에서 “다시 연결” 을 누르세요.
          </>
        }
        confirmText="제외"
        cancelText="취소"
        onConfirm={handleIgnoreConfirm}
      />
    </div>
  );
}

function emptyMessageFor(filter: ReconciliationStatusFilter): string {
  switch (filter) {
    case 'auto_linked':
      return '자동으로 연결된 row 가 없습니다. Wing 스캔을 실행해 보세요.';
    case 'needs_review':
      return '확인이 필요한 row 가 없습니다.';
    case 'conflict':
      return '충돌 row 가 없습니다.';
    case 'linked':
      return '처리 완료된 row 가 없습니다.';
    case 'ignored':
      return '제외된 row 가 없습니다.';
    default:
      return '아직 매칭 row 가 없습니다. Wing 스캔으로 시작하세요.';
  }
}
