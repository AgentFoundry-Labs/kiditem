'use client';

import { useState } from 'react';
import { Loader2, Sparkles, Trash2, Wand2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import SourcingStatusBadge from './SourcingStatusBadge';
import { useGenerateDetailPage, type GenerateMode } from '../../[id]/hooks/useGenerateDetailPage';
import { useKidsPlayfulFromSourcing } from '../../[id]/hooks/useKidsPlayfulFromSourcing';
import { useKidsPlayfulInProgress } from '@/app/(media-ai)/generate/hooks/useKidsPlayfulGenerate';
import TemplateSelectionModal from '../../[id]/components/TemplateSelectionModal';
import { productsApi, type SourcedProduct } from '../../lib/sourcing-api';
import type { DetailPageTemplateId } from '@kiditem/shared/ai';

interface Props {
  product: SourcedProduct;
  isProcessing: boolean;
  isDeleting: boolean;
  onDelete: (id: string) => void;
  onNavigate: (id: string) => void;
  onOpenEditor: (id: string) => void;
}

export default function ProductCard({
  product,
  isProcessing,
  isDeleting,
  onDelete,
  onNavigate,
  onOpenEditor,
}: Props) {
  // 사용자 요구: 소싱 AI 에서는 모달로 템플릿 + 모드 선택 (갤러리 페이지는 다른 용도).
  const [modalOpen, setModalOpen] = useState(false);
  const { mutate: runGenerate, isPending: isGenerating } = useGenerateDetailPage(product.id);
  const kp = useKidsPlayfulFromSourcing();
  // KP 진행 중 row 가 있으면 카드 상단에 progress 배지 (다시 들어와도 유지).
  const generationTargetId = product.promotedMasterId ?? product.id;
  const kpInProgress = useKidsPlayfulInProgress(generationTargetId);
  const generateBusy = isGenerating || isProcessing || kp.isPending || !!kpInProgress;

  const handleConfirm = async (templateId: string, mode: GenerateMode) => {
    if (templateId === 'kids-playful' || templateId === 'bold-vertical') {
      // Trend / KIDITEM 둘 다 fire-and-forget Gemini 직접 호출.
      try {
        const detail = await productsApi.getDetail(product.id);
        await kp.trigger({
          sourceCandidateId: product.id,
          productId: product.promotedMasterId,
          productName: product.name,
          rawData: detail.raw_data,
          templateId: templateId as DetailPageTemplateId,
          imageUrls: detail.image_urls,
        });
      } catch {
        // toast 는 trigger 내부에서 노출
      }
      return;
    }
    runGenerate({ mode, templateId });
  };

  // 진행 중 라벨 — pipeline_step 별 다른 메시지 (사용자 가시성 강화)
  // Trend/KIDITEM 생성 진행 중이면 그것 우선 (templateId 로 라벨 구분).
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
      {/* 진행 중 overlay — 카드 상단에 보라색 진행 배지. 다른 페이지로 이동 후 돌아와도 시각적으로 식별 가능.
          KP 진행 중도 동일 표시 (DB status='pending'/'processing' 인 row 가 있으면). */}
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

        <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/70 via-black/25 to-transparent px-2 pb-2 pt-12 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenEditor(product.id);
            }}
            className="flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-white/95 text-[11px] font-extrabold text-emerald-700 shadow-lg backdrop-blur-sm transition-colors hover:bg-emerald-50"
          >
            <Sparkles size={13} /> 에디터에서 바로 편집
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
            setModalOpen(true);
          }}
          disabled={generateBusy}
          className={cn(
            'w-full flex h-9 items-center justify-center gap-1.5 rounded-lg border text-[12px] font-extrabold transition-all shadow-sm',
            generateBusy
              ? 'cursor-wait border-violet-200 bg-violet-50 text-violet-600'
              : 'border-[var(--text-primary)] bg-white text-[var(--text-primary)] hover:border-violet-600 hover:bg-violet-600 hover:text-white hover:shadow-md hover:shadow-violet-200',
          )}
          title="템플릿 + 생성 모드 선택"
        >
          {generateBusy ? (
            <>
              <Loader2 size={11} className="animate-spin" /> 생성 중...
            </>
          ) : (
            <>
              <Wand2 size={13} /> AI 상세 생성
            </>
          )}
        </button>
        <TemplateSelectionModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          onConfirm={handleConfirm}
        />
      </div>
    </div>
  );
}
