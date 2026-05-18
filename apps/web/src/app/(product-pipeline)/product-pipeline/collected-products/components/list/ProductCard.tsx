'use client';

import { Loader2, Sparkles, Wand2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useKidsPlayfulInProgress } from '@/app/(product-pipeline)/product-pipeline/detail-template-generation/hooks/useKidsPlayfulGenerate';
import { ProductInboxCardShell } from '@/app/(product-pipeline)/product-pipeline/_shared/components/inbox/ProductInboxCardShell';
import type { SourcedProduct } from '../../lib/sourcing-api';
import { getInlineGenerationProgressLabel } from '../../lib/generation-progress-label';
import { sourcePlatformLabel } from '../../lib/source-platform-label';
import SourcingStatusBadge from './SourcingStatusBadge';

interface Props {
  product: SourcedProduct;
  isProcessing: boolean;
  isDeleting: boolean;
  selected?: boolean;
  onDelete: (id: string) => void;
  onSelectedChange?: (id: string, selected: boolean) => void;
  onNavigate: (id: string) => void;
  onOpenEditor: (id: string) => void;
  onOpenQuickProcess: (id: string) => void;
  quickProcessSelectedCount: number;
  isQuickProcessingSelected?: boolean;
}

export default function ProductCard({
  product,
  isProcessing,
  isDeleting,
  selected = false,
  onDelete,
  onSelectedChange,
  onNavigate,
  onOpenEditor,
  onOpenQuickProcess,
  quickProcessSelectedCount,
  isQuickProcessingSelected = false,
}: Props) {
  // KP 진행 중 row 가 있으면 카드 상단에 progress 배지 (다시 들어와도 유지).
  const generationTargetId = product.promotedMasterId ?? product.id;
  const kpInProgress = useKidsPlayfulInProgress(generationTargetId, {
    sourceCandidateId: product.promotedMasterId ? null : product.id,
  });

  // 진행 중 라벨 — pipeline_step 별 다른 메시지 (사용자 가시성 강화)
  // Trend/KIDITEM 생성 진행 중이면 그것 우선 (templateId 로 라벨 구분).
  const inProgressTemplateLabel =
    kpInProgress?.templateId === 'bold-vertical' ? 'KIDITEM DESIGN' : '트렌드 광고형 템플릿';
  const progressLabel = kpInProgress
    ? getInlineGenerationProgressLabel({
        templateLabel: inProgressTemplateLabel,
        imageProcessingStatus: kpInProgress.imageProcessingStatus,
        rawInput: kpInProgress.rawInput,
      })
    : null;

  const showProgress = (isProcessing || !!kpInProgress) && !!progressLabel;
  const sourceLabel = sourcePlatformLabel(product.sourcePlatform);

  // 진행 중 overlay — 카드 상단에 보라색 진행 배지. 다른 페이지로 이동 후 돌아와도 시각적으로 식별 가능.
  // KP 진행 중도 동일 표시 (DB status='pending'/'processing' 인 row 가 있으면).
  const statusBanner = showProgress ? (
    <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-center gap-1.5 bg-violet-600 px-2 py-1 text-[10px] font-semibold text-white shadow">
      <Loader2 size={10} className="animate-spin" />
      {progressLabel}
    </div>
  ) : null;

  return (
    <ProductInboxCardShell
      title={product.name}
      thumbnailUrl={product.thumbnailUrl}
      thumbnailUrls={product.thumbnailPreviewUrls}
      disabled={isDeleting}
      highlighted={showProgress}
      statusBanner={statusBanner}
      selectionAction={onSelectedChange
        ? {
            checked: selected,
            ariaLabel: `${product.name} 선택`,
            onChange: (checked) => onSelectedChange(product.id, checked),
          }
        : undefined}
      thumbnailTopLeft={
        <div className="flex flex-col gap-1">
          <SourcingStatusBadge status={product.status} />
          <span className="w-fit rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-bold tracking-wide text-white backdrop-blur-sm">
            {sourceLabel}
          </span>
        </div>
      }
      deleteAction={{
        isDeleting,
        onDelete: () => onDelete(product.id),
        title: '소싱 후보 삭제',
      }}
      hoverAction={{
        icon: <Sparkles size={13} />,
        label: '에디터에서 바로 편집',
        onClick: () => onOpenEditor(product.id),
      }}
      onOpen={() => onNavigate(product.id)}
      footer={
        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpenQuickProcess(product.id);
          }}
          disabled={isQuickProcessingSelected}
          className={cn(
            'w-full flex h-11 items-center justify-center gap-1.5 rounded-lg border text-[12px] font-extrabold transition-all shadow-sm',
            isQuickProcessingSelected
              ? 'cursor-wait border-violet-200 bg-violet-50 text-violet-600'
              : 'border-[var(--text-primary)] bg-white text-[var(--text-primary)] hover:border-violet-600 hover:bg-violet-600 hover:text-white hover:shadow-md hover:shadow-violet-200',
          )}
          title="선택한 상품만 상세페이지와 썸네일 생성을 시작합니다"
        >
          {isQuickProcessingSelected ? (
            <>
              <Loader2 size={11} className="animate-spin" /> 처리 중...
            </>
          ) : (
            <>
              <Wand2 size={13} />
              {quickProcessSelectedCount > 0 ? `선택 ${quickProcessSelectedCount}개 AI 작업 선택` : 'AI 작업 선택'}
            </>
          )}
        </button>
      }
    />
  );
}
