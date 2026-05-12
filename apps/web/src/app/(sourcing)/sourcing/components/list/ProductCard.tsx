'use client';

import { Loader2, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import SourcingStatusBadge from './SourcingStatusBadge';
import { useKidsPlayfulInProgress } from '@/app/(media-ai)/generate/hooks/useKidsPlayfulGenerate';
import type { SourcedProduct } from '../../lib/sourcing-api';

interface Props {
  product: SourcedProduct;
  isProcessing: boolean;
  isDeleting: boolean;
  onDelete: (id: string) => void;
  onNavigate: (id: string) => void;
}

export default function ProductCard({
  product,
  isProcessing,
  isDeleting,
  onDelete,
  onNavigate,
}: Props) {
  // Phase 7 (#192) — generation entrypoints moved to the master-side flow.
  // The sourcing list card stays read-only here: it still surfaces any
  // post-promotion KP generation that's in flight against the promoted
  // master so the existing "AI 생성 중" indicator keeps working.
  const kpInProgress = useKidsPlayfulInProgress(product.promotedMasterId ?? product.id);

  const inProgressTemplateLabel =
    kpInProgress?.templateId === 'bold-vertical' ? 'KIDITEM DESIGN' : 'Trend Vertical';
  const progressLabel = kpInProgress
    ? kpInProgress.imageProcessingStatus === 'pending'
      ? `${inProgressTemplateLabel} 카피 생성 중...`
      : `${inProgressTemplateLabel} 이미지 생성 중...`
    : null;

  const showProgress = (isProcessing || !!kpInProgress) && !!progressLabel;
  const sourceLabel = product.sourcePlatform === 'detail-page-generator'
    ? '자체제작'
    : product.sourcePlatform || '미지정';

  return (
    <div
      className={cn(
        'bg-[var(--surface)] rounded-xl overflow-hidden shadow-sm border border-[var(--border-subtle)] hover:shadow-lg hover:-translate-y-0.5 transition-all group relative',
        isDeleting && 'opacity-50 pointer-events-none',
        showProgress && 'ring-2 ring-violet-400 ring-offset-1',
      )}
    >
      {showProgress && (
        <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-center gap-1.5 bg-violet-600 px-2 py-1 text-[10px] font-semibold text-white shadow">
          <Loader2 size={10} className="animate-spin" />
          {progressLabel}
        </div>
      )}
      <div
        className="aspect-square relative overflow-hidden bg-[var(--surface-sunken)] cursor-pointer"
        onClick={() => onNavigate(product.id)}
      >
        {product.thumbnailUrl ? (
          <img
            src={product.thumbnailUrl}
            alt={product.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[var(--text-muted)] text-sm">
            No Image
          </div>
        )}

        <div className="absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-2 p-2">
          <div className="flex max-w-[calc(100%-42px)] flex-col gap-1">
            <SourcingStatusBadge status={product.status} />
            <span className="w-fit rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-bold tracking-wide text-white backdrop-blur-sm">
              {sourceLabel}
            </span>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(product.id);
            }}
            disabled={isDeleting}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/45 bg-white/90 text-rose-500 shadow-sm backdrop-blur-sm transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
            title="상품 삭제"
          >
            {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          </button>
        </div>

      </div>

      <div className="p-3 bg-[var(--surface)]">
        <h3
          className="text-xs font-bold text-[var(--text-primary)] mb-2 line-clamp-2 min-h-[32px] leading-4"
          title={product.name}
        >
          {product.name}
        </h3>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onNavigate(product.id);
          }}
          className="w-full flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[var(--text-primary)] bg-white text-[12px] font-extrabold text-[var(--text-primary)] transition-all shadow-sm hover:border-violet-600 hover:bg-violet-600 hover:text-white hover:shadow-md hover:shadow-violet-200"
          title="상세에서 등록/반려"
        >
          상세 열기
        </button>
      </div>
    </div>
  );
}
