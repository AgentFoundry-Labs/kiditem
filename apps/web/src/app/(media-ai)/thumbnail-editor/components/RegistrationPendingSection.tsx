'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as Dialog from '@radix-ui/react-dialog';
import { toast } from 'sonner';
import { AlertCircle, Check, ChevronLeft, ChevronRight, Copy, Loader2, Store, X } from 'lucide-react';

import {
  useGenerationList,
  useBatchWingRegister,
  useClearRegistrationError,
  type WingBatchItemResult,
} from '../../_shared/hooks/useThumbnailGenerations';
import { apiClient } from '@/lib/api-client';
import { resolveImageUrl } from '@/lib/resolve-url';
import { cn } from '@/lib/utils';
import type { ThumbnailGenerationItem } from '@kiditem/shared/ai';

import { ImgWithSkeleton } from './ImgWithSkeleton';

function isPendingRegistration(g: ThumbnailGenerationItem): boolean {
  if (g.phase !== 'applied') return false;
  const rs = g.registrationStatus;
  return rs == null || rs === 'failed';
}

function previewUrl(g: ThumbnailGenerationItem): string | null {
  return g.selectedUrl ?? g.candidates?.[0]?.url ?? g.originalUrl ?? null;
}

type RegGroup = {
  productId: string;
  representative: ThumbnailGenerationItem;
  items: ThumbnailGenerationItem[];
};

function groupByProduct(items: ThumbnailGenerationItem[]): RegGroup[] {
  const map = new Map<string, ThumbnailGenerationItem[]>();
  for (const g of items) {
    const bucket = map.get(g.productId);
    if (bucket) bucket.push(g);
    else map.set(g.productId, [g]);
  }
  const groups: RegGroup[] = [];
  for (const [productId, list] of map) {
    const sorted = [...list].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    groups.push({ productId, representative: sorted[0], items: sorted });
  }
  return groups.sort(
    (a, b) =>
      new Date(b.representative.createdAt).getTime() -
      new Date(a.representative.createdAt).getTime(),
  );
}

const PAGE_SIZE = 12;

export function RegistrationPendingSection() {
  const router = useRouter();
  const { data = [] } = useGenerationList();
  const batch = useBatchWingRegister();
  const clearError = useClearRegistrationError();
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
  const pagedGroups = useMemo(
    () => groups.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [groups, safePage],
  );

  if (groups.length === 0) return null;

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

  const handleClearError = (id: string) => {
    clearError.mutate(id, {
      onSuccess: () => toast.success('에러 초기화 완료 — 다시 등록을 시도할 수 있습니다'),
      onError: (err) => toast.error(err instanceof Error ? err.message : '에러 초기화 실패'),
    });
  };

  const failedIds = items.filter((g) => g.registrationStatus === 'failed').map((g) => g.id);
  const handleClearAllErrors = () => {
    if (failedIds.length === 0) return;
    failedIds.forEach((id) => clearError.mutate(id));
    toast.success(`실패 ${failedIds.length}개 초기화 완료`);
  };

  const startBatch = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    try {
      const status = await apiClient.get<{ connected: boolean; error?: string }>(
        '/api/thumbnail-analysis/playwriter-status',
      );
      if (!status.connected) {
        toast.error(
          status.error ??
            '활성 Playwriter 세션이 없습니다. 터미널에서 `playwriter session new` 실행 후 쿠팡 Wing 에 로그인하세요.',
          { duration: 8000 },
        );
        return;
      }
    } catch {
      toast.error('Playwriter 상태 확인에 실패했습니다.');
      return;
    }

    setRunningIds(ids);
    setResults(null);
    setDialogOpen(true);

    try {
      const res = await batch.mutateAsync(ids);
      setResults(res.results);
      const ok = res.results.filter((r) => r.success).length;
      const fail = res.results.length - ok;
      if (fail === 0) toast.success(`쿠팡 등록 완료 · 성공 ${ok}장`);
      else toast.warning(`쿠팡 등록 완료 · 성공 ${ok} / 실패 ${fail}`);
      setSelectedIds(new Set());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '배치 등록에 실패했습니다');
      setResults(
        ids.map((id) => ({
          id,
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

        <div className="grid grid-cols-3 md:grid-cols-3 xl:grid-cols-4 gap-x-1 gap-y-6">
          {pagedGroups.map((group) => {
            const selectedInGroup = group.items.filter((i) => selectedIds.has(i.id)).length;
            return (
              <RegistrationPendingCard
                key={group.productId}
                group={group}
                selectedCount={selectedInGroup}
                onToggle={() => toggleGroup(group)}
                onEdit={() => {
                  const params = new URLSearchParams({
                    productId: group.productId,
                    generationId: group.representative.id,
                  });
                  router.push(`/thumbnail-editor/edit?${params.toString()}`);
                }}
                onClearError={() => group.items.forEach((i) => handleClearError(i.id))}
              />
            );
          })}
        </div>
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
            {batch.isPending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Store size={14} />
            )}
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
}: {
  group: RegGroup;
  selectedCount: number;
  onToggle: () => void;
  onEdit: () => void;
  onClearError: () => void;
}) {
  const item = group.representative;
  const preview = previewUrl(item);
  const resolved = preview ? resolveImageUrl(preview) : null;
  const anyFailed = group.items.some((i) => i.registrationStatus === 'failed');
  const firstError = group.items.find((i) => i.registrationStatus === 'failed')?.registrationError ?? null;
  const fullSelected = selectedCount === group.items.length;
  const partialSelected = selectedCount > 0 && !fullSelected;
  const multi = group.items.length > 1;

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
        {resolved && (
          <ImgWithSkeleton src={resolved} alt={item.product.name} fit="cover" />
        )}

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
        <p className="text-[11px] font-bold text-gray-900 truncate">{item.product.name}</p>
        {anyFailed && (
          <div className="flex items-start gap-1 mt-0.5">
            <p
              className="text-[10px] font-bold text-rose-600 truncate flex-1"
              title={firstError ?? undefined}
            >
              등록 실패{multi && group.items.filter((i) => i.registrationStatus === 'failed').length > 1 ? ` ${group.items.filter((i) => i.registrationStatus === 'failed').length}건` : ''}
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

function BatchProgressDialog({
  open,
  onOpenChange,
  isRunning,
  runningIds,
  results,
  itemsById,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  isRunning: boolean;
  runningIds: string[];
  results: WingBatchItemResult[] | null;
  itemsById: Map<string, ThumbnailGenerationItem>;
}) {
  const okCount = results?.filter((r) => r.success).length ?? 0;
  const failCount = results ? results.length - okCount : 0;

  const rows: Array<{ id: string; name: string; state: 'running' | 'ok' | 'fail'; error?: string; screenshotPath?: string | null }> =
    results
      ? results.map((r) => ({
          id: r.id,
          name: itemsById.get(r.id)?.product.name ?? r.id,
          state: r.success ? 'ok' : 'fail',
          error: r.error,
          screenshotPath: r.screenshotPath,
        }))
      : runningIds.map((id) => ({
          id,
          name: itemsById.get(id)?.product.name ?? id,
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
                  배치 완료 · 성공 <span className="text-violet-600">{okCount}</span>
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
                <button
                  type="button"
                  className="p-1 rounded-md text-gray-500 hover:bg-gray-100"
                  aria-label="Close"
                >
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
