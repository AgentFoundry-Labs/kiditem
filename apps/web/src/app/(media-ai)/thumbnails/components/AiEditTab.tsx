import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  ImageIcon,
  Loader2,
  Wand2,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import type {
  RecomposeVariantKey,
  ThumbnailAnalysisResult,
  ThumbnailGenerationItem,
} from '@kiditem/shared/ai';
import { cn } from '@/lib/utils';
import { isActive, isApplied, isReady } from '../../_shared/lib/thumbnail-status';
import { useDeleteGeneration, useReEditGeneration } from '../../_shared/hooks/useThumbnailGenerations';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ProductCard } from '../../_shared/components/thumbnails/ProductCard';
import { RecomposeVariantPicker } from '../../_shared/components/thumbnails/RecomposeVariantPicker';
import { ThumbnailStatusBadge } from '../../_shared/components/thumbnails/ThumbnailStatusBadge';
import { resolveImageUrl } from '../lib/resolve-url';
import { buildEditHref } from '@/app/(media-ai)/thumbnail-editor/edit/lib/build-edit-href';

type EditFilter = 'pending' | 'generating' | 'ready' | 'applied';

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
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
        <ReadySection
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

function ReadySection({
  generations,
  wingRegisteringIds,
  onSelectCandidate,
  onOpenCoupangEdit,
  onDelete,
}: {
  generations: ThumbnailGenerationItem[];
  wingRegisteringIds: Set<string>;
  onSelectCandidate: (id: string, url: string) => void;
  onOpenCoupangEdit: (g: ThumbnailGenerationItem) => void;
  onDelete: (g: ThumbnailGenerationItem) => void;
}) {
  const reEditMutation = useReEditGeneration();
  const [expandedGenId, setExpandedGenId] = useState<string | null>(null);
  const [expandedSlideIdx, setExpandedSlideIdx] = useState(0);
  const selectedCount = generations.filter((g) => g.selectedUrl).length;

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<20 | 50>(20);

  const total = generations.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // total / pageSize 변동 시 현재 page 가 범위 밖이면 clamp
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pagedGenerations = useMemo(
    () => generations.slice((page - 1) * pageSize, page * pageSize),
    [generations, page, pageSize],
  );

  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-[13px] font-bold" style={{ color: '#7048e8' }}>
          선택 대기 ({total})
        </span>
        <span className="text-[12px]" style={{ color: 'var(--thumb-text-quaternary)' }}>
          After 이미지 클릭해서 선택
        </span>
        <div className="flex-1" />
        <div className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--thumb-text-tertiary)' }}>
          <span>페이지당</span>
          {[20, 50].map((n) => (
            <button
              key={n}
              onClick={() => {
                setPageSize(n as 20 | 50);
                setPage(1);
              }}
              className={cn(
                'px-2 py-1 rounded-md font-bold transition-colors',
                pageSize === n
                  ? 'bg-[#7048e8] text-white'
                  : 'bg-[var(--thumb-card-bg)] text-[var(--thumb-text-secondary)] border border-[var(--thumb-border-subtle)]',
              )}
            >
              {n}
            </button>
          ))}
        </div>
        {selectedCount > 0 && (
          <button
            onClick={() => {
              generations.filter((g) => g.selectedUrl).forEach((g) => onOpenCoupangEdit(g));
            }}
            disabled={wingRegisteringIds.size > 0}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ background: '#7048e8' }}
          >
            {wingRegisteringIds.size > 0 ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <ExternalLink size={14} />
            )}
            {wingRegisteringIds.size > 0
              ? `Wing 업로드 중... (${wingRegisteringIds.size})`
              : `쿠팡 등록하러 가기 (${selectedCount})`}
          </button>
        )}
      </div>

      {generations.length === 0 ? (
        <div className="py-12 text-center text-sm" style={{ color: 'var(--thumb-text-quaternary)' }}>
          선택 대기 중인 항목이 없습니다
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {pagedGenerations.map((g) => {
            const gCandidates = g.candidates ?? [];
            const slideIdx = expandedGenId === g.id ? expandedSlideIdx : 0;
            const candidateAtIdx = gCandidates[slideIdx];
            const gRaw = candidateAtIdx
              ? typeof candidateAtIdx === 'string'
                ? (candidateAtIdx as string)
                : (candidateAtIdx as { url: string }).url
              : '';
            const gImgUrl = resolveImageUrl(gRaw) ?? '';
            const gOrigUrl = resolveImageUrl(g.originalUrl ?? g.product?.imageUrl ?? null);
            const isSelected = !!g.selectedUrl;

            return (
              <div
                key={g.id}
                className="group relative rounded-xl overflow-hidden border"
                style={{
                  borderColor: isSelected ? '#7048e8' : 'var(--thumb-border-subtle)',
                  background: 'var(--thumb-card-bg)',
                  boxShadow: isSelected ? '0 0 0 1px #7048e830' : undefined,
                }}
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(g);
                  }}
                  aria-label="삭제"
                  title="삭제"
                  className="absolute top-1.5 right-1.5 z-30 w-6 h-6 rounded-full bg-black/60 hover:bg-red-600 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center shadow-md"
                >
                  <X size={13} />
                </button>
                <div className="flex">
                  <div
                    className="flex-1 relative overflow-hidden border-r"
                    style={{ borderColor: 'var(--thumb-border-subtle)', aspectRatio: '1' }}
                  >
                    <div className="absolute top-1 left-1 text-[8px] font-bold uppercase tracking-wider text-white/80 bg-black/30 px-1 rounded z-10">
                      B
                    </div>
                    {gOrigUrl ? (
                      <img
                        src={gOrigUrl}
                        alt="before"
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-full h-full bg-slate-100 flex items-center justify-center">
                        <ImageIcon size={16} className="text-slate-300" />
                      </div>
                    )}
                  </div>

                  <div
                    className="flex-1 relative overflow-hidden cursor-pointer"
                    style={{ aspectRatio: '1' }}
                    onClick={() => {
                      if (gCandidates.length > 1 && expandedGenId !== g.id) {
                        setExpandedSlideIdx(0);
                        setExpandedGenId(g.id);
                      }
                      onSelectCandidate(g.id, isSelected ? '' : gRaw);
                    }}
                  >
                    <div className="absolute top-1 left-1 text-[8px] font-bold uppercase tracking-wider text-white/80 bg-black/30 px-1 rounded z-10">
                      A
                    </div>
                    {gImgUrl ? (
                      <img
                        key={gImgUrl}
                        src={gImgUrl}
                        alt="after"
                        className="w-full h-full object-cover transition-opacity duration-150"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        onError={() => {
                          reEditMutation.mutate(g.id);
                        }}
                      />
                    ) : (
                      <div className="w-full h-full bg-slate-100 flex items-center justify-center">
                        <ImageIcon size={16} className="text-slate-300" />
                      </div>
                    )}
                    {isSelected && (
                      <div className="absolute inset-0 bg-indigo-600/15 flex items-center justify-center">
                        <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center shadow-lg">
                          <CheckCircle size={14} className="text-white" />
                        </div>
                      </div>
                    )}
                    {gCandidates.length > 1 && expandedGenId === g.id && (
                      <>
                        <button
                          disabled={slideIdx === 0}
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedSlideIdx((i) => i - 1);
                          }}
                          className="absolute left-0.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-white/90 shadow flex items-center justify-center disabled:opacity-30"
                        >
                          <ChevronLeft size={11} className="text-slate-700" />
                        </button>
                        <button
                          disabled={slideIdx === gCandidates.length - 1}
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedSlideIdx((i) => i + 1);
                          }}
                          className="absolute right-0.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-white/90 shadow flex items-center justify-center disabled:opacity-30"
                        >
                          <ChevronRight size={11} className="text-slate-700" />
                        </button>
                      </>
                    )}
                    {gCandidates.length > 1 && (
                      <div className="absolute bottom-1 right-1 bg-black/40 text-white text-[8px] font-bold px-1 rounded">
                        {gCandidates.length > 1 && expandedGenId === g.id
                          ? `${slideIdx + 1}/${gCandidates.length}`
                          : `${gCandidates.length}장`}
                      </div>
                    )}
                  </div>
                </div>

                <div className="px-2 pt-1.5 pb-2 flex flex-col gap-1">
                  <p
                    className="text-[13px] font-medium leading-5 truncate"
                    title={g.product?.name}
                    style={{ color: 'var(--thumb-text-primary)' }}
                  >
                    {g.product?.name}
                  </p>
                  <Link href={buildEditHref({ productId: g.productId, generationId: g.id, imageUrl: g.product?.imageUrl })}>
                    <button className="w-full flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold transition-colors bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-100">
                      <Wand2 size={10} /> AI 편집하기
                    </button>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <span className="text-[12px]" style={{ color: 'var(--thumb-text-tertiary)' }}>
            {total}건 중 {start}-{end}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1.5 rounded hover:bg-[var(--thumb-card-bg)] disabled:opacity-30"
              style={{ color: 'var(--thumb-text-secondary)' }}
            >
              <ChevronLeft size={16} />
            </button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              const pageNum = Math.max(1, Math.min(page - 3, totalPages - 6)) + i;
              if (pageNum > totalPages || pageNum < 1) return null;
              const active = pageNum === page;
              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  className={cn(
                    'w-8 h-8 rounded text-sm font-semibold',
                    active
                      ? 'bg-[#7048e8] text-white'
                      : 'text-[var(--thumb-text-secondary)] hover:bg-[var(--thumb-card-bg)]',
                  )}
                >
                  {pageNum}
                </button>
              );
            })}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-1.5 rounded hover:bg-[var(--thumb-card-bg)] disabled:opacity-30"
              style={{ color: 'var(--thumb-text-secondary)' }}
            >
              <ChevronRight size={16} />
            </button>
          </div>
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
