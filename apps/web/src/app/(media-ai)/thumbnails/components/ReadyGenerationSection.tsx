import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  ImageIcon,
  Loader2,
  Wand2,
  X,
} from 'lucide-react';
import type { ThumbnailGenerationItem } from '@kiditem/shared/ai';
import { cn } from '@/lib/utils';
import { buildEditHref } from '@/app/(media-ai)/thumbnail-editor/edit/lib/build-edit-href';
import { useReEditGeneration } from '../../_shared/hooks/useThumbnailGenerations';
import { resolveImageUrl } from '../lib/resolve-url';

interface ReadyGenerationSectionProps {
  generations: ThumbnailGenerationItem[];
  wingRegisteringIds: Set<string>;
  onSelectCandidate: (id: string, url: string) => void;
  onOpenCoupangEdit: (g: ThumbnailGenerationItem) => void;
  onDelete: (g: ThumbnailGenerationItem) => void;
}

export function ReadyGenerationSection({
  generations,
  wingRegisteringIds,
  onSelectCandidate,
  onOpenCoupangEdit,
  onDelete,
}: ReadyGenerationSectionProps) {
  const reEditMutation = useReEditGeneration();
  const [expandedGenId, setExpandedGenId] = useState<string | null>(null);
  const [expandedSlideIdx, setExpandedSlideIdx] = useState(0);
  const selectedCount = generations.filter((g) => g.selectedUrl).length;

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<20 | 50>(20);

  const total = generations.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

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
