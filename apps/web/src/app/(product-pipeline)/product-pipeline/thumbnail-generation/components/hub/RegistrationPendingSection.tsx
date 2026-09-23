'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as Dialog from '@radix-ui/react-dialog';
import { toast } from 'sonner';
import { AlertCircle, Check, ChevronLeft, ChevronRight, Copy, Loader2, Store, X } from 'lucide-react';

import { thumbnailJobTitle, useThumbnailJobs, type ThumbnailJobListItem } from '../../../_shared/hooks/useThumbnailJobs';
import {
  useBatchWingRegister,
  useClearRegistrationError,
  useConfirmRegistrationApplied,
  useMarkRegistrationNotApplied,
  useResendWingRegistration,
  type WingBatchItemResult,
} from '../../../_shared/hooks/useRepresentativeImage';
import type { RepresentativeImageSubject } from '../../../_shared/lib/representative-image-execution';
import { thumbnailGenerationEditHref } from '../../../_shared/lib/product-pipeline-routes';
import { representativeImageUploadedMessage } from '../../../_shared/lib/representative-image-execution';
import { resolveImageUrl } from '@/lib/resolve-url';
import { cn } from '@/lib/utils';

import { ImgWithSkeleton } from '../shared/ImgWithSkeleton';
import { ListingPicker } from './ListingPicker';

/**
 * 등록 대기: 후보를 판매상품 작업공간의 대표이미지로 채택했지만 아직 몰에 반영되지 않은 job, 그리고 채택과
 * 관계없이 그 후보의 살아 있는 실행(`checking`)이 있는 job(Agent 가 올린 것 포함). 살아 있는 실행은 늘 여기서
 * 출구를 가진다. 몰 반영은 판매상품의 것이라 판매상품이 없는 작업공간(리스팅 · 직접 업로드)은 오지 않는다.
 */
function isPendingRegistration(g: ThumbnailJobListItem): boolean {
  if (g.registrationStatus === 'checking') return true;
  if (!g.adoptedCandidate || !g.workspace?.salesProductId) return false;
  return g.registrationStatus !== 'registered';
}

function previewUrl(g: ThumbnailJobListItem): string | null {
  return g.adoptedCandidate?.url ?? g.candidates[0]?.url ?? g.workspace?.imageUrl ?? null;
}

/** 올릴 대표이미지: 판매상품과 채택한 후보 자산. */
function registrationSubject(g: ThumbnailJobListItem): RepresentativeImageSubject | null {
  const salesProductId = g.workspace?.salesProductId;
  if (!salesProductId || !g.adoptedCandidate) return null;
  return { salesProductId, assetId: g.adoptedCandidate.id };
}

type RegGroup = {
  contentWorkspaceId: string;
  representative: ThumbnailJobListItem;
  items: ThumbnailJobListItem[];
};

function groupByProduct(items: ThumbnailJobListItem[]): RegGroup[] {
  const map = new Map<string, ThumbnailJobListItem[]>();
  for (const g of items) {
    if (!g.contentWorkspaceId) continue;
    const bucket = map.get(g.contentWorkspaceId);
    if (bucket) bucket.push(g);
    else map.set(g.contentWorkspaceId, [g]);
  }
  const groups: RegGroup[] = [];
  for (const [contentWorkspaceId, list] of map) {
    const sorted = [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    groups.push({
      contentWorkspaceId,
      representative: sorted[0],
      items: sorted,
    });
  }
  return groups.sort(
    (a, b) => new Date(b.representative.createdAt).getTime() - new Date(a.representative.createdAt).getTime(),
  );
}

const PAGE_SIZE = 12;

export function RegistrationPendingSection({ returnTo = null }: { returnTo?: string | null }) {
  const router = useRouter();
  const { data = [] } = useThumbnailJobs();
  const batch = useBatchWingRegister();
  const clearError = useClearRegistrationError();
  const resend = useResendWingRegistration();
  const markNotApplied = useMarkRegistrationNotApplied();
  const confirmApplied = useConfirmRegistrationApplied();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [results, setResults] = useState<WingBatchItemResult[] | null>(null);
  const [runningIds, setRunningIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);

  const items = useMemo(() => data.filter(isPendingRegistration), [data]);
  const groups = useMemo(() => groupByProduct(items), [items]);
  const itemsById = useMemo(() => new Map(data.map((g) => [g.id, g] as const)), [data]);
  const failedCount = items.filter((g) => g.registrationStatus === 'failed').length;

  const totalPages = Math.max(1, Math.ceil(groups.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedGroups = useMemo(() => groups.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE), [groups, safePage]);

  const allSelected = items.length > 0 && items.every((g) => selectedIds.has(g.id));
  const toggleGroup = (group: RegGroup) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allInGroup = group.items.every((i) => next.has(i.id));
      if (allInGroup) group.items.forEach((i) => next.delete(i.id));
      else group.items.forEach((i) => next.add(i.id));
      return next;
    });
  };
  const selectAll = () => setSelectedIds(new Set(items.map((g) => g.id)));
  const clearAll = () => setSelectedIds(new Set());

  const handleClearError = (salesProductId: string) => {
    clearError.mutate(salesProductId, {
      onSuccess: () => toast.success('에러 초기화 완료 — 다시 등록을 시도할 수 있습니다'),
      onError: (err) => toast.error(err instanceof Error ? err.message : '에러 초기화 실패'),
    });
  };

  const handleResend = (executionId: string) => {
    resend.mutate(executionId, {
      onSuccess: () => toast.success(representativeImageUploadedMessage({ resent: true })),
      onError: (err) => toast.error(err instanceof Error ? err.message : '다시 보내기에 실패했습니다'),
    });
  };
  const handleMarkNotApplied = (executionId: string) => {
    markNotApplied.mutate(executionId, {
      onSuccess: () => toast.success('반영 안 됨으로 표시했습니다 — 다시 등록할 수 있습니다'),
      onError: (err) => toast.error(err instanceof Error ? err.message : '표시에 실패했습니다'),
    });
  };
  const handleConfirmApplied = (executionId: string) => {
    confirmApplied.mutate(executionId, {
      onSuccess: () => toast.success('반영됨으로 표시했습니다'),
      onError: (err) => toast.error(err instanceof Error ? err.message : '표시에 실패했습니다'),
    });
  };
  const checkingBusy = resend.isPending || markNotApplied.isPending || confirmApplied.isPending;

  const failedSalesProductIds = [...new Set(items
    .filter((g) => g.registrationStatus === 'failed')
    .flatMap((g) => (g.workspace?.salesProductId ? [g.workspace.salesProductId] : [])))];
  const handleClearAllErrors = () => {
    if (failedSalesProductIds.length === 0) return;
    failedSalesProductIds.forEach((salesProductId) => clearError.mutate(salesProductId));
    toast.success(`실패 ${failedSalesProductIds.length}개 초기화 완료`);
  };

  const startBatch = async () => {
    const targets = Array.from(selectedIds).flatMap((id) => {
      const job = itemsById.get(id);
      const subject = job ? registrationSubject(job) : null;
      return subject ? [{ id, subject }] : [];
    });
    const ids = targets.map((target) => target.id);
    if (ids.length === 0) {
      toast.error('채택한 대표이미지가 있는 판매상품만 올릴 수 있습니다');
      return;
    }

    setRunningIds(ids);
    setResults(null);
    setDialogOpen(true);

    try {
      const res = await batch.mutateAsync(targets);
      setResults(res.results);
      const ok = res.results.filter((r) => r.success).length;
      const fail = res.results.length - ok;
      if (fail === 0) toast.success(representativeImageUploadedMessage({ uploaded: ok }));
      else toast.warning(representativeImageUploadedMessage({ uploaded: ok, failed: fail }));
      setSelectedIds(new Set());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '배치 등록에 실패했습니다');
      setResults(
        targets.map(({ id, subject }) => ({
          id,
          subject,
          success: false,
          screenshotPath: null,
          error: err instanceof Error ? err.message : 'unknown',
        })),
      );
    }
  };

  return (
    <>
      <section className="rounded-3xl bg-white/40 backdrop-blur-xl border border-white/60 shadow-[0_8px_32px_rgba(99,102,241,0.06)] px-6 py-7">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-violet-100/70 backdrop-blur-sm border border-white/60 flex items-center justify-center">
              <Store size={16} className="text-violet-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900">쿠팡 등록 대기</h3>
            <span className="text-xs font-bold text-gray-500 ml-1">전체 {groups.length}</span>
            {failedCount > 0 && (
              <span className="text-[11px] font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-md ml-1">
                실패 {failedCount}
              </span>
            )}
          </div>
          <div className="flex gap-1.5 items-center">
            {failedCount > 0 && (
              <button
                type="button"
                onClick={handleClearAllErrors}
                disabled={clearError.isPending}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-50 text-rose-700 border border-rose-100 hover:bg-rose-100 disabled:opacity-50"
                title="실패 상태를 모두 초기화하고 재시도 가능하게 만듭니다"
              >
                실패 {failedCount}개 초기화
              </button>
            )}
            <button
              type="button"
              onClick={allSelected ? clearAll : selectAll}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white/50 text-gray-700 border border-white/60 hover:bg-white/80 backdrop-blur-sm"
            >
              {allSelected ? '전체 해제' : '전체 선택'}
            </button>
            {totalPages > 1 && (
              <div className="flex items-center gap-1 ml-1">
                <button
                  type="button"
                  onClick={() => setPage(Math.max(1, safePage - 1))}
                  disabled={safePage === 1}
                  className="p-1.5 rounded-lg text-gray-600 hover:bg-white/70 disabled:opacity-30 disabled:hover:bg-transparent"
                  aria-label="이전 페이지"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-xs font-bold text-gray-600 tabular-nums px-1">
                  {safePage} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage(Math.min(totalPages, safePage + 1))}
                  disabled={safePage >= totalPages}
                  className="p-1.5 rounded-lg text-gray-600 hover:bg-white/70 disabled:opacity-30 disabled:hover:bg-transparent"
                  aria-label="다음 페이지"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>
        </div>

        {groups.length === 0 ? (
          <div className="flex min-h-[180px] flex-col items-center justify-center rounded-2xl border border-dashed border-violet-100 bg-white/45 px-4 py-10 text-center">
            <Store size={22} className="text-violet-300" />
            <p className="mt-2 text-sm font-bold text-gray-700">쿠팡 등록 대기 없음</p>
            <p className="mt-1 max-w-xs text-xs leading-relaxed text-gray-500">
              생성 결과를 대표이미지로 채택하면 여기에서 Wing 등록을 이어서 할 수 있습니다.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-3 md:grid-cols-3 xl:grid-cols-4 gap-x-1 gap-y-6">
            {pagedGroups.map((group) => {
              const selectedInGroup = group.items.filter((i) => selectedIds.has(i.id)).length;
              return (
                <RegistrationPendingCard
                  key={group.contentWorkspaceId}
                  group={group}
                  selectedCount={selectedInGroup}
                  onToggle={() => toggleGroup(group)}
                  onEdit={() => {
                    router.push(
                      thumbnailGenerationEditHref({
                        generationId: group.representative.id,
                        returnTo,
                        subjectParams: {
                          contentWorkspaceId: group.contentWorkspaceId,
                        },
                      }),
                    );
                  }}
                  onClearError={() => {
                    const salesProductId = group.representative.workspace?.salesProductId;
                    if (salesProductId) handleClearError(salesProductId);
                  }}
                  onResend={handleResend}
                  onMarkNotApplied={handleMarkNotApplied}
                  onConfirmApplied={handleConfirmApplied}
                  checkingBusy={checkingBusy}
                />
              );
            })}
          </div>
        )}
      </section>

      {selectedIds.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 rounded-2xl bg-white/80 backdrop-blur-xl border border-white/60 shadow-xl px-4 py-3 flex items-center gap-3">
          <span className="text-xs font-bold text-gray-700">
            선택 {selectedIds.size} / 전체 {items.length}
          </span>
          <button
            type="button"
            onClick={clearAll}
            className="px-2 py-1 rounded-md text-[11px] font-bold text-gray-600 hover:bg-gray-100"
          >
            해제
          </button>
          <div className="w-px h-5 bg-gray-200" />
          <button
            type="button"
            onClick={startBatch}
            disabled={batch.isPending}
            className="bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 text-white rounded-xl px-4 py-2 text-sm font-bold flex items-center gap-2"
          >
            {batch.isPending ? <Loader2 size={14} className="animate-spin" /> : <Store size={14} />}
            선택 {selectedIds.size}장 쿠팡 등록
          </button>
        </div>
      )}

      <BatchProgressDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        isRunning={batch.isPending}
        runningIds={runningIds}
        results={results}
        itemsById={itemsById}
        onListingUploaded={(id) =>
          setResults((prev) => prev?.map((r) => (r.id === id ? { ...r, success: true, error: undefined, needsListingChoice: false } : r)) ?? prev)
        }
      />
    </>
  );
}

function RegistrationPendingCard({
  group,
  selectedCount,
  onToggle,
  onEdit,
  onClearError,
  onResend,
  onMarkNotApplied,
  onConfirmApplied,
  checkingBusy,
}: {
  group: RegGroup;
  selectedCount: number;
  onToggle: () => void;
  onEdit: () => void;
  onClearError: () => void;
  onResend: (executionId: string) => void;
  onMarkNotApplied: (executionId: string) => void;
  onConfirmApplied: (executionId: string) => void;
  checkingBusy: boolean;
}) {
  const item = group.representative;
  const preview = previewUrl(item);
  const resolved = preview ? resolveImageUrl(preview) : null;
  const anyFailed = group.items.some((i) => i.registrationStatus === 'failed');
  // 실패한 생성과 확인할 생성은 따로 보인다 — 한 생성의 실패가 다른 생성의 출구를 가리지 않는다.
  const checkingItems = group.items.filter((i) => i.registrationStatus === 'checking' && i.registrationExecutionId);
  const firstError = group.items.find((i) => i.registrationStatus === 'failed')?.registrationError ?? null;
  const fullSelected = selectedCount === group.items.length;
  const partialSelected = selectedCount > 0 && !fullSelected;
  const multi = group.items.length > 1;
  const productName = thumbnailJobTitle(item);

  return (
    <div
      onClick={onEdit}
      className={cn(
        'flex flex-col group relative cursor-pointer hover:opacity-95 transition-opacity',
        fullSelected && 'ring-2 ring-violet-500 ring-inset',
        partialSelected && 'ring-2 ring-violet-300 ring-inset',
      )}
    >
      <div className="aspect-square bg-white relative overflow-hidden">
        {resolved && <ImgWithSkeleton src={resolved} alt={productName} fit="cover" />}

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          aria-label={fullSelected ? '선택 해제' : '쿠팡 등록 선택'}
          className={cn(
            'absolute top-1.5 left-1.5 w-5 h-5 rounded-md flex items-center justify-center border-2 backdrop-blur-sm transition-colors cursor-pointer',
            fullSelected
              ? 'bg-violet-600 border-violet-600'
              : partialSelected
                ? 'bg-violet-300 border-violet-400'
                : 'bg-white/80 border-white/90 group-hover:border-violet-300',
          )}
        >
          {fullSelected && <Check size={12} className="text-white" strokeWidth={3} />}
          {partialSelected && <div className="w-2 h-0.5 bg-white rounded-full" />}
        </button>

        {multi && (
          <div className="absolute top-1.5 right-1.5 bg-black/60 backdrop-blur-sm text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
            {group.items.length}
          </div>
        )}
      </div>
      <div className="px-1 py-1 bg-white">
        <p className="text-[11px] font-bold text-gray-900 truncate">{productName}</p>
        {checkingItems.map((checking) => (
          <CheckingActions
            key={checking.id}
            executionId={checking.registrationExecutionId!}
            executionStatus={checking.registrationExecutionStatus}
            title={checking.registrationError}
            busy={checkingBusy}
            onConfirmApplied={onConfirmApplied}
            onResend={onResend}
            onMarkNotApplied={onMarkNotApplied}
          />
        ))}
        {anyFailed && (
          <div className="flex items-start gap-1 mt-0.5">
            <p className="text-[10px] font-bold text-rose-600 truncate flex-1" title={firstError ?? undefined}>
              등록 실패
              {multi && group.items.filter((i) => i.registrationStatus === 'failed').length > 1
                ? ` ${group.items.filter((i) => i.registrationStatus === 'failed').length}건`
                : ''}
            </p>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClearError();
              }}
              className="flex-shrink-0 p-0.5 rounded text-rose-500 hover:bg-rose-100"
              title="에러 지우고 재시도 가능 상태로"
              aria-label="에러 지우기"
            >
              <X size={10} strokeWidth={3} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** 살아 있는 실행 하나의 출구. 확인은 올린 뒤 기다리는(`reconciling`) 실행에서만 받는다. */
function CheckingActions({
  executionId,
  executionStatus,
  title,
  busy,
  onConfirmApplied,
  onResend,
  onMarkNotApplied,
}: {
  executionId: string;
  executionStatus: ThumbnailJobListItem['registrationExecutionStatus'];
  title: string | null;
  busy: boolean;
  onConfirmApplied: (executionId: string) => void;
  onResend: (executionId: string) => void;
  onMarkNotApplied: (executionId: string) => void;
}) {
  const act = (run: (executionId: string) => void) => (event: React.MouseEvent) => {
    event.stopPropagation();
    run(executionId);
  };
  return (
    <div className="mt-0.5">
      <p className="text-[10px] font-bold text-amber-600 truncate" title={title ?? '몰에 반영됐는지 아직 모릅니다'}>
        Wing 저장 확인 필요
      </p>
      <div className="mt-1 flex flex-wrap gap-1">
        {executionStatus === 'reconciling' && (
          <button
            type="button"
            disabled={busy}
            onClick={act(onConfirmApplied)}
            className="rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-white hover:bg-[var(--primary-hover)] disabled:opacity-50"
          >
            반영됨으로 표시
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={act(onResend)}
          className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 hover:border-primary hover:text-primary disabled:opacity-50"
        >
          다시 보내기
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={act(onMarkNotApplied)}
          className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 hover:text-slate-700 disabled:opacity-50"
        >
          반영 안 됨으로 표시
        </button>
      </div>
    </div>
  );
}

function BatchProgressDialog({
  open,
  onOpenChange,
  isRunning,
  runningIds,
  results,
  itemsById,
  onListingUploaded,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  isRunning: boolean;
  runningIds: string[];
  results: WingBatchItemResult[] | null;
  itemsById: Map<string, ThumbnailJobListItem>;
  onListingUploaded: (id: string) => void;
}) {
  const okCount = results?.filter((r) => r.success).length ?? 0;
  const failCount = results ? results.length - okCount : 0;

  const rows: Array<{
    id: string;
    name: string;
    state: 'running' | 'ok' | 'fail';
    error?: string;
    screenshotPath?: string | null;
    needsListingChoice?: boolean;
    subject?: RepresentativeImageSubject;
  }> = results
    ? results.map((r) => ({
        id: r.id,
        name: thumbnailJobTitle(itemsById.get(r.id) ?? { workspace: null }, r.id),
        state: r.success ? 'ok' : 'fail',
        error: r.error,
        screenshotPath: r.screenshotPath,
        needsListingChoice: r.needsListingChoice,
        subject: r.subject,
      }))
    : runningIds.map((id) => ({
        id,
        name: thumbnailJobTitle(itemsById.get(id) ?? { workspace: null }, id),
        state: 'running',
      }));

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(v) => {
        if (isRunning) return;
        onOpenChange(v);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(90vw,560px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white shadow-2xl border border-gray-200 flex flex-col max-h-[85vh]">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <Dialog.Title className="text-base font-bold text-gray-900">
              {isRunning ? (
                <span className="flex items-center gap-2">
                  <Loader2 size={16} className="animate-spin text-violet-600" />
                  쿠팡 등록 진행 중 · {runningIds.length}장
                </span>
              ) : (
                <span>
                  {/* 올린 것은 Wing 저장 전이라 성공이 아니다. */}
                  배치 완료 · 올림 <span className="text-violet-600">{okCount}</span>
                  {failCount > 0 && (
                    <>
                      {' / '}
                      실패 <span className="text-rose-600">{failCount}</span>
                    </>
                  )}
                </span>
              )}
            </Dialog.Title>
            {!isRunning && (
              <Dialog.Close asChild>
                <button type="button" className="p-1 rounded-md text-gray-500 hover:bg-gray-100" aria-label="Close">
                  <X size={16} />
                </button>
              </Dialog.Close>
            )}
          </div>

          <div className="px-5 py-3 overflow-y-auto flex-1">
            <ul className="space-y-2">
              {rows.map((r) => (
                <li
                  key={r.id}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 border',
                    r.state === 'running' && 'bg-violet-50/60 border-violet-100',
                    r.state === 'ok' && 'bg-emerald-50/60 border-emerald-100',
                    r.state === 'fail' && 'bg-rose-50/60 border-rose-100',
                  )}
                >
                  <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                    {r.state === 'running' && <Loader2 size={14} className="animate-spin text-violet-600" />}
                    {r.state === 'ok' && <Check size={14} className="text-emerald-600" strokeWidth={3} />}
                    {r.state === 'fail' && <AlertCircle size={14} className="text-rose-600" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-gray-900 truncate">{r.name}</div>
                    {r.state === 'fail' && r.error && (
                      <div className="text-[11px] text-rose-600 truncate" title={r.error}>
                        {r.error}
                      </div>
                    )}
                    {r.state === 'fail' && r.needsListingChoice && r.subject && (
                      <ListingPicker subject={r.subject} onDone={() => onListingUploaded(r.id)} />
                    )}
                    {r.state === 'ok' && r.screenshotPath && (
                      <div className="text-[11px] text-gray-500 truncate font-mono" title={r.screenshotPath}>
                        {r.screenshotPath}
                      </div>
                    )}
                  </div>
                  {r.state === 'ok' && r.screenshotPath && (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(r.screenshotPath!);
                          toast.success('경로 복사됨');
                        } catch {
                          toast.error('복사 실패');
                        }
                      }}
                      className="p-1.5 rounded-md text-gray-600 hover:bg-white"
                      title="스크린샷 경로 복사"
                    >
                      <Copy size={12} />
                    </button>
                  )}
                  {r.state === 'fail' && r.error && (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(r.error!);
                          toast.success('에러 복사됨');
                        } catch {
                          toast.error('복사 실패');
                        }
                      }}
                      className="p-1.5 rounded-md text-gray-600 hover:bg-white"
                      title="에러 복사"
                    >
                      <Copy size={12} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div className="px-5 py-3 border-t border-gray-100 flex justify-end">
            {isRunning ? (
              <span className="text-[11px] text-gray-500">순차 실행 중입니다. 완료될 때까지 기다려주세요.</span>
            ) : (
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold"
                >
                  닫기
                </button>
              </Dialog.Close>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
