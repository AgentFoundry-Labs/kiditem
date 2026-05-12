import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle,
  Loader2,
  Wand2,
  XCircle,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import type {
  RecomposeVariantKey,
  ThumbnailAnalysisResult,
  ThumbnailGenerationItem,
} from '@kiditem/shared/ai';
import { isActive, isApplied, isReady } from '../../_shared/lib/thumbnail-status';
import {
  useDeleteGeneration,
  useReEditGeneration,
} from '../../_shared/hooks/useThumbnailGenerations';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ProductCard } from '../../_shared/components/thumbnails/ProductCard';
import { RecomposeVariantPicker } from '../../_shared/components/thumbnails/RecomposeVariantPicker';
import { ThumbnailStatusBadge } from '../../_shared/components/thumbnails/ThumbnailStatusBadge';
import { buildEditHref } from '@/app/(media-ai)/thumbnail-editor/edit/lib/build-edit-href';
import { ReadyGenerationSection } from './ReadyGenerationSection';

type EditFilter = 'pending' | 'generating' | 'ready' | 'applied' | 'failed';

interface AiEditTabProps {
  generations: ThumbnailGenerationItem[];
  pendingProducts: ThumbnailAnalysisResult[];
  editFilter: EditFilter;
  onChangeFilter: (f: EditFilter) => void;
  editJobsPending: boolean;
  wingRegisteringIds: Set<string>;
  onSelectGen: (g: ThumbnailGenerationItem) => void;
  /**
   * 단일 상품 편집. variantKey 가 지정되면 사용자가 카드에서 명시적으로 고른 레이아웃,
   * 없으면 서버 기본값(auto)으로 진행.
   */
  onEditSingle: (productId: string, variantKey?: RecomposeVariantKey) => void;
  onEditBatch: (productIds: string[]) => void;
  onSelectCandidate: (id: string, url: string) => void;
  onOpenCoupangEdit: (g: ThumbnailGenerationItem) => void;
}

const byNewestGen = (a: ThumbnailGenerationItem, b: ThumbnailGenerationItem) =>
  new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();

const byNewestAnalysis = (a: ThumbnailAnalysisResult, b: ThumbnailAnalysisResult) => {
  const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
  const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
  return tb - ta;
};

export function AiEditTab({
  generations,
  pendingProducts,
  editFilter,
  onChangeFilter,
  editJobsPending,
  wingRegisteringIds,
  onSelectGen,
  onEditSingle,
  onEditBatch,
  onSelectCandidate,
  onOpenCoupangEdit,
}: AiEditTabProps) {
  const generatingGens = generations.filter((g) => isActive(g)).sort(byNewestGen);
  const readyGens = generations.filter((g) => isReady(g)).sort(byNewestGen);
  const appliedGens = generations.filter((g) => isApplied(g)).sort(byNewestGen);
  const failedGens = generations
    .filter((g) => g.status === 'failed' || g.status === 'cancelled')
    .sort(byNewestGen);
  const sortedPendingProducts = [...pendingProducts].sort(byNewestAnalysis);

  // 생성중 탭에 머물러 있는데 모든 generation 이 완료되면 → 선택 대기 탭으로 자동 전환
  const prevGeneratingCount = useRef(generatingGens.length);
  useEffect(() => {
    const prev = prevGeneratingCount.current;
    const curr = generatingGens.length;
    if (editFilter === 'generating' && prev > 0 && curr === 0 && readyGens.length > 0) {
      onChangeFilter('ready');
      toast.success(`생성 완료 — 선택 대기로 이동 (${readyGens.length}개)`);
    }
    prevGeneratingCount.current = curr;
  }, [editFilter, generatingGens.length, readyGens.length, onChangeFilter]);

  const deleteMutation = useDeleteGeneration();
  const [deleteTarget, setDeleteTarget] = useState<ThumbnailGenerationItem | null>(null);
  const handleDelete = (g: ThumbnailGenerationItem) => setDeleteTarget(g);
  const confirmDelete = () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    // optimistic 삭제 → 다이얼로그 즉시 닫고 UI 바로 업데이트
    setDeleteTarget(null);
    deleteMutation.mutate(id, {
      onSuccess: () => toast.success('삭제되었습니다'),
      onError: () => toast.error('삭제 실패'),
    });
  };

  const filterCards: Array<{ key: EditFilter; label: string; count: number; color: string; desc: string; icon: LucideIcon }> = [
    { key: 'pending', label: '대기 중', count: pendingProducts.length, color: '#f59e0b', desc: '편집 시작 전', icon: AlertTriangle },
    { key: 'generating', label: '생성 중', count: generatingGens.length, color: '#3182f6', desc: 'AI 처리 중', icon: Loader2 },
    { key: 'ready', label: '선택 대기', count: readyGens.length, color: '#7048e8', desc: '이미지 선택 필요', icon: Wand2 },
    { key: 'applied', label: '적용 완료', count: appliedGens.length, color: '#00c471', desc: '쿠팡 반영', icon: CheckCircle },
    { key: 'failed', label: '실패', count: failedGens.length, color: '#ef4444', desc: '재시도 필요', icon: XCircle },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {filterCards.map((s) => {
          const isActive = editFilter === s.key;
          return (
            <button
              key={s.key}
              onClick={() => onChangeFilter(s.key)}
              className="rounded-2xl px-4 py-4 flex items-center gap-3 text-left transition-all"
              style={{
                background: isActive ? `${s.color}12` : 'var(--thumb-card-bg)',
                border: `2px solid ${isActive ? s.color : 'var(--thumb-border-subtle)'}`,
                boxShadow: isActive ? `0 0 0 1px ${s.color}30` : 'var(--thumb-shadow-sm)',
              }}
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: `${s.color}15` }}
              >
                <s.icon size={18} style={{ color: s.color }} />
              </div>
              <div>
                <div
                  className="text-[22px] font-black tabular-nums leading-none"
                  style={{ color: s.count > 0 ? s.color : 'var(--thumb-text-disabled)' }}
                >
                  {s.count}
                </div>
                <div className="text-[12px] font-bold mt-0.5" style={{ color: 'var(--thumb-text-secondary)' }}>
                  {s.label}
                </div>
                <div className="text-[11px]" style={{ color: 'var(--thumb-text-quaternary)' }}>
                  {s.desc}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {editFilter === 'pending' && (
        <PendingSection
          products={sortedPendingProducts}
          editJobsPending={editJobsPending}
          onEditSingle={onEditSingle}
          onEditBatch={onEditBatch}
          onChangeFilter={onChangeFilter}
        />
      )}

      {editFilter === 'generating' && (
        <GeneratingSection generations={generatingGens} onSelectGen={onSelectGen} onDelete={handleDelete} />
      )}

      {editFilter === 'ready' && (
        <ReadyGenerationSection
          generations={readyGens}
          wingRegisteringIds={wingRegisteringIds}
          onSelectCandidate={onSelectCandidate}
          onOpenCoupangEdit={onOpenCoupangEdit}
          onDelete={handleDelete}
        />
      )}

      {editFilter === 'applied' && (
        <AppliedSection generations={appliedGens} onSelectGen={onSelectGen} onDelete={handleDelete} />
      )}

      {editFilter === 'failed' && (
        <FailedSection
          generations={failedGens}
          onSelectGen={onSelectGen}
          onDelete={handleDelete}
          onChangeFilter={onChangeFilter}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        tone="danger"
        title="생성 결과를 삭제할까요?"
        description={
          deleteTarget ? (
            <>
              <span className="font-semibold text-[var(--text-primary,#0f172a)]">
                {deleteTarget.product?.name ?? '이 상품'}
              </span>
              의 AI 생성 결과가 영구 삭제됩니다. 복구할 수 없습니다.
            </>
          ) : null
        }
        confirmText="삭제"
        cancelText="취소"
        onConfirm={confirmDelete}
      />
    </div>
  );
}

function PendingSection({
  products,
  editJobsPending,
  onEditSingle,
  onEditBatch,
  onChangeFilter,
}: {
  products: ThumbnailAnalysisResult[];
  editJobsPending: boolean;
  onEditSingle: (productId: string, variantKey?: RecomposeVariantKey) => void;
  onEditBatch: (productIds: string[]) => void;
  onChangeFilter: (f: EditFilter) => void;
}) {
  const startBatchAndNavigate = (productIds: string[], label: string) => {
    if (productIds.length === 0) return;
    onEditBatch(productIds);
    toast.success(`${label} — 생성 중 탭으로 이동`);
    // 생성중 탭으로 자동 전환 — 폴링 3초로 진행상황 확인 가능
    onChangeFilter('generating');
  };

  /**
   * 단일 상품 클릭 — 분석 시점에 저장된 recompose 분류 결과를 사용해서 카드 안에서 바로 variant 선택.
   * 박스/상품 동일 케이스에서만 picker 가 옵션 버튼을 노출하고, 그 외엔 분류 뱃지만 표시.
   */
  const startSingle = (product: ThumbnailAnalysisResult, variantKey?: RecomposeVariantKey) => {
    onEditSingle(product.productId, variantKey);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-bold" style={{ color: '#f59e0b' }}>
          대기 중 — 편집 시작 전 ({products.length})
        </span>
        <span className="text-[11px]" style={{ color: 'var(--thumb-text-quaternary)' }}>
          이미지 클릭 = 쿠팡 썸네일 변환 자동 실행
        </span>
        <div className="flex-1" />
        <button
          onClick={() =>
            startBatchAndNavigate(
              products.map((p) => p.productId),
              `${products.length}개 편집 시작`,
            )
          }
          disabled={products.length === 0 || editJobsPending}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-40"
          style={{ background: '#7048e8' }}
        >
          {editJobsPending ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
          전체 편집 시작
        </button>
      </div>
      {products.length === 0 ? (
        <div className="py-12 text-center text-sm" style={{ color: 'var(--thumb-text-quaternary)' }}>
          대기 중인 상품이 없습니다
        </div>
      ) : (
        <div className="grid grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
          {products.map((p) => (
            <div key={p.productId} className="flex flex-col gap-1.5">
              <ProductCard
                imageUrl={p.imageUrl}
                name={p.productName}
                badge={
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-700">
                    {p.grade}
                  </span>
                }
                onClick={() => startSingle(p)}
              />
              {p.recompose && (
                <RecomposeVariantPicker
                  classification={p.recompose}
                  loading={editJobsPending}
                  onSelect={(variantKey) => startSingle(p, variantKey)}
                  layout="card"
                />
              )}
              <Link
                href={buildEditHref({ productId: p.productId, imageUrl: p.imageUrl })}
                onClick={(e) => e.stopPropagation()}
              >
                <button className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-semibold transition-colors bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-100">
                  <Wand2 size={10} /> 편집 화면으로
                </button>
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function GeneratingSection({
  generations,
  onSelectGen,
  onDelete,
}: {
  generations: ThumbnailGenerationItem[];
  onSelectGen: (g: ThumbnailGenerationItem) => void;
  onDelete: (g: ThumbnailGenerationItem) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
        <span className="text-[13px] font-bold" style={{ color: '#3182f6' }}>
          생성 중 ({generations.length})
        </span>
      </div>
      {generations.length === 0 ? (
        <div className="py-12 text-center text-sm" style={{ color: 'var(--thumb-text-quaternary)' }}>
          생성 중인 작업이 없습니다
        </div>
      ) : (
        <div className="grid grid-cols-4 md:grid-cols-6 xl:grid-cols-8 gap-3">
          {generations.map((g) => (
            <ProductCard
              key={g.id}
              imageUrl={g.originalUrl ?? g.product?.imageUrl ?? null}
              name={g.product?.name ?? ''}
              badge={<ThumbnailStatusBadge status={g.status} phase={g.phase ?? null} />}
              overlay="generating"
              onClick={() => onSelectGen(g)}
              onDelete={() => onDelete(g)}
              deleteLabel="생성 취소 / 삭제"
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AppliedSection({
  generations,
  onSelectGen,
  onDelete,
}: {
  generations: ThumbnailGenerationItem[];
  onSelectGen: (g: ThumbnailGenerationItem) => void;
  onDelete: (g: ThumbnailGenerationItem) => void;
}) {
  return (
    <div className="space-y-3">
      <span className="text-[13px] font-bold" style={{ color: '#00c471' }}>
        적용 완료 ({generations.length})
      </span>
      {generations.length === 0 ? (
        <div className="py-12 text-center text-sm" style={{ color: 'var(--thumb-text-quaternary)' }}>
          적용 완료된 항목이 없습니다
        </div>
      ) : (
        <div className="grid grid-cols-4 md:grid-cols-6 xl:grid-cols-8 gap-3">
          {generations.map((g) => (
            <ProductCard
              key={g.id}
              imageUrl={g.selectedUrl ?? g.originalUrl ?? g.product?.imageUrl ?? null}
              name={g.product?.name ?? ''}
              badge={<ThumbnailStatusBadge status={g.status} phase={g.phase ?? null} />}
              overlay="applied"
              onClick={() => onSelectGen(g)}
              onDelete={() => onDelete(g)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FailedSection({
  generations,
  onSelectGen,
  onDelete,
  onChangeFilter,
}: {
  generations: ThumbnailGenerationItem[];
  onSelectGen: (g: ThumbnailGenerationItem) => void;
  onDelete: (g: ThumbnailGenerationItem) => void;
  onChangeFilter: (f: EditFilter) => void;
}) {
  const reEditMutation = useReEditGeneration();

  return (
    <div className="space-y-3">
      <span className="text-[13px] font-bold" style={{ color: '#ef4444' }}>
        실패 ({generations.length})
      </span>
      {generations.length === 0 ? (
        <div className="py-12 text-center text-sm" style={{ color: 'var(--thumb-text-quaternary)' }}>
          실패한 작업이 없습니다
        </div>
      ) : (
        <div className="grid grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
          {generations.map((g) => (
            <div key={g.id} className="flex flex-col gap-1.5">
              <ProductCard
                imageUrl={g.originalUrl ?? g.product?.imageUrl ?? null}
                name={g.product?.name ?? ''}
                badge={<ThumbnailStatusBadge status={g.status} phase={g.phase ?? null} />}
                onClick={() => onSelectGen(g)}
                onDelete={() => onDelete(g)}
              />
              <div
                className="min-h-[32px] rounded-lg border border-red-100 bg-red-50 px-2 py-1.5 text-[11px] leading-4 text-red-700 line-clamp-2"
                title={g.errorMessage ?? undefined}
              >
                {g.errorMessage ?? (g.status === 'cancelled' ? '사용자 또는 시스템에 의해 취소됨' : '생성 실패')}
              </div>
              <button
                type="button"
                onClick={() => {
                  reEditMutation.mutate(g.id, {
                    onSuccess: () => toast.success('재생성을 요청했습니다'),
                    onError: () => {
                      toast.error('재생성 요청 실패');
                      onChangeFilter('failed');
                    },
                  });
                  onChangeFilter('generating');
                }}
                disabled={reEditMutation.isPending}
                className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-semibold transition-colors bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >
                {reEditMutation.isPending ? <Loader2 size={10} className="animate-spin" /> : <Wand2 size={10} />}
                다시 생성
              </button>
              <Link href={buildEditHref({ productId: g.productId, generationId: g.id, imageUrl: g.product?.imageUrl })}>
                <button className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-semibold transition-colors bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-100">
                  <Wand2 size={10} /> 편집 화면으로
                </button>
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
