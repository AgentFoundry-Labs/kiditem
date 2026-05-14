'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Loader2, PlayCircle, X } from 'lucide-react';
import { toast } from 'sonner';

import { useDeleteGeneration, useGenerationList } from '../../_shared/hooks/useThumbnailGenerations';
import { resolveImageUrl } from '@/lib/resolve-url';
import { cn } from '@/lib/utils';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { ThumbnailGenerationItem } from '@kiditem/shared/ai';

import { ImgWithSkeleton } from './ImgWithSkeleton';

function navigate(router: ReturnType<typeof useRouter>, productId: string, generationId: string) {
  const params = new URLSearchParams({ productId, generationId });
  router.push(`/thumbnail-editor/edit?${params.toString()}`);
}

type ProductGroup = {
  productId: string;
  representative: ThumbnailGenerationItem;
  items: ThumbnailGenerationItem[];
};

function groupByProduct(items: ThumbnailGenerationItem[]): ProductGroup[] {
  const map = new Map<string, ThumbnailGenerationItem[]>();
  for (const g of items) {
    if (!g.productId) continue;
    const bucket = map.get(g.productId);
    if (bucket) bucket.push(g);
    else map.set(g.productId, [g]);
  }
  const groups: ProductGroup[] = [];
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

function isInProgress(g: ThumbnailGenerationItem): boolean {
  if (g.status === 'pending' || g.status === 'running') return true;
  if (g.status === 'succeeded' && g.phase !== 'applied') return true;
  return false;
}

const PAGE_SIZE = 12;

export function PendingSection() {
  const router = useRouter();
  const { data = [], isLoading } = useGenerationList();
  const deleteMutation = useDeleteGeneration();
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<ProductGroup | null>(null);

  const inProgress = useMemo(() => data.filter(isInProgress), [data]);
  const groups = useMemo(() => groupByProduct(inProgress), [inProgress]);

  const confirmDeleteGroup = () => {
    if (!deleteTarget) return;
    const items = deleteTarget.items;
    setDeleteTarget(null); // optimistic: 즉시 닫음 + cache onMutate 가 카드 제거
    Promise.allSettled(
      items.map(
        (item) =>
          new Promise<void>((resolve, reject) => {
            deleteMutation.mutate(item.id, {
              onSuccess: () => resolve(),
              onError: (err) => reject(err),
            });
          }),
      ),
    ).then((results) => {
      const ok = results.filter((r) => r.status === 'fulfilled').length;
      const fail = results.length - ok;
      if (fail === 0) toast.success('삭제되었습니다');
      else if (ok === 0) toast.error('삭제 실패');
      else toast.warning(`${ok}개 삭제, ${fail}개 실패`);
    });
  };

  const totalPages = Math.max(1, Math.ceil(groups.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedGroups = useMemo(
    () => groups.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [groups, safePage],
  );

  if (isLoading && data.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-gray-400">
        <Loader2 size={18} className="animate-spin" />
      </div>
    );
  }

  if (inProgress.length === 0) return null;

  return (
    <section className="rounded-3xl bg-white/40 backdrop-blur-xl border border-white/60 shadow-[0_8px_32px_rgba(99,102,241,0.06)] px-6 py-7">
      <div className="flex items-center justify-between mb-6 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-violet-100/70 backdrop-blur-sm border border-white/60 flex items-center justify-center shrink-0">
            <PlayCircle size={16} className="text-violet-600" />
          </div>
          <h3 className="text-xl font-bold text-gray-900">진행 중인 작업</h3>
          <span className="text-xs font-bold text-gray-500 ml-1">전체 {inProgress.length}</span>
        </div>
        {totalPages > 1 && (
          <SectionPager page={safePage} totalPages={totalPages} onChange={setPage} />
        )}
      </div>

      <div className="grid grid-cols-3 md:grid-cols-3 xl:grid-cols-4 gap-x-1 gap-y-6">
        {pagedGroups.map((group) => (
          <PendingCard
            key={group.productId}
            group={group}
            onClick={() => navigate(router, group.productId, group.representative.id)}
            onDelete={() => setDeleteTarget(group)}
          />
        ))}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        tone="danger"
        title={
          deleteTarget && deleteTarget.items.length > 1
            ? `진행 중 작업 ${deleteTarget.items.length}개를 삭제할까요?`
            : '진행 중 작업을 삭제할까요?'
        }
        description={
          deleteTarget ? (
            <>
              <span className="font-semibold text-[var(--text-primary,#0f172a)]">
                {deleteTarget.representative.product?.name ?? '상품 정보 없음'}
              </span>
              의 AI 생성 작업이 삭제됩니다. 복구할 수 없습니다.
            </>
          ) : null
        }
        confirmText="삭제"
        cancelText="취소"
        onConfirm={confirmDeleteGroup}
      />
    </section>
  );
}

function SectionPager({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (p: number) => void;
}) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      <button
        type="button"
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={page === 1}
        className="p-1.5 rounded-lg text-gray-600 hover:bg-white/70 disabled:opacity-30 disabled:hover:bg-transparent"
        aria-label="이전 페이지"
      >
        <ChevronLeft size={16} />
      </button>
      <span className="text-xs font-bold text-gray-600 tabular-nums px-1">
        {page} / {totalPages}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(totalPages, page + 1))}
        disabled={page >= totalPages}
        className="p-1.5 rounded-lg text-gray-600 hover:bg-white/70 disabled:opacity-30 disabled:hover:bg-transparent"
        aria-label="다음 페이지"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

function PendingCard({
  group,
  onClick,
  onDelete,
}: {
  group: ProductGroup;
  onClick: () => void;
  onDelete: () => void;
}) {
  const item = group.representative;
  const running = item.status === 'running' || item.status === 'pending';
  const productName = item.product?.name ?? '상품 정보 없음';
  const preview = item.candidates?.[0]?.url ?? item.originalUrl ?? item.product?.imageUrl;
  const resolved = resolveImageUrl(preview);
  const hasBox = Boolean(item.product?.hasBoxImage);
  const hasColor = Boolean(item.product?.hasColorVariantImages);

  return (
    <div
      onClick={onClick}
      className="flex flex-col group relative cursor-pointer hover:opacity-95 transition-opacity"
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        aria-label="삭제"
        title={group.items.length > 1 ? `진행 중 ${group.items.length}개 모두 삭제` : '삭제'}
        className="absolute top-1 right-1 z-20 w-6 h-6 rounded-full bg-black/60 hover:bg-red-600 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center shadow-md"
      >
        <X size={13} />
      </button>
      <div className="aspect-square bg-white relative overflow-hidden">
        {resolved && (
          <ImgWithSkeleton
            src={resolved}
            alt={productName}
            fit="cover"
            className={cn(running && 'blur-[2px] opacity-70')}
          />
        )}
        {running && (
          <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
            <Loader2 size={20} className="text-white animate-spin" />
          </div>
        )}
      </div>
      <div
        className={cn(
          'px-1 py-1 flex items-center gap-1 transition-colors',
          hasBox && hasColor && 'bg-violet-100',
          hasBox && !hasColor && 'bg-amber-100',
          !hasBox && hasColor && 'bg-fuchsia-100',
        )}
      >
        <p
          className={cn(
            'text-[11px] font-bold truncate flex-1',
            hasBox && hasColor && 'text-violet-900',
            hasBox && !hasColor && 'text-amber-900',
            !hasBox && hasColor && 'text-fuchsia-900',
            !hasBox && !hasColor && 'text-gray-900',
          )}
        >
          {productName}
        </p>
        {(hasBox || hasColor) && (
          <span className="flex items-center gap-0.5 text-[11px] leading-none flex-shrink-0">
            {hasBox && <span title="박스 이미지 보유">📦</span>}
            {hasColor && <span title="색상 이미지 보유">🎨</span>}
          </span>
        )}
      </div>
    </div>
  );
}
