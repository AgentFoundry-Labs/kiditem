'use client';

import { useState } from 'react';
import { ArrowLeft, Check, Lock, Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useGenerateDetailPage, type GenerateMode } from '../../[id]/hooks/useGenerateDetailPage';
import { useKidsPlayfulFromSourcing } from '../../[id]/hooks/useKidsPlayfulFromSourcing';
import { useKidsPlayfulInProgress } from '@/app/(media-ai)/generate/hooks/useKidsPlayfulGenerate';
import TemplateSelectionModal from '../../[id]/components/TemplateSelectionModal';

interface ProductEditHeaderProps {
  productName: string;
  productId: string;
  isEditComplete: boolean;
  isLocked: boolean;
  onToggleEditComplete: () => void;
  onToggleLocked: () => void;
  onBack: () => void;
  /** product.raw_data — kids-playful 모드에서 1688 필드 추출용. loading/error view 에선 null. */
  rawData?: Record<string, unknown> | null;
  imageUrls?: string[];
}

export default function ProductEditHeader({
  productName,
  productId,
  isEditComplete,
  isLocked,
  onToggleEditComplete,
  onToggleLocked,
  onBack,
  rawData = null,
  imageUrls = [],
}: ProductEditHeaderProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const { mutate: runGenerate, isPending } = useGenerateDetailPage(productId);
  const kp = useKidsPlayfulFromSourcing();
  const kpInProgress = useKidsPlayfulInProgress(productId);
  const generateBusy = isPending || kp.isPending || !!kpInProgress;

  const handleConfirm = (templateId: string, mode: GenerateMode) => {
    if (templateId === 'kids-playful' || templateId === 'bold-vertical') {
      kp.trigger({ productId, productName, rawData, templateId, imageUrls });
      return;
    }
    runGenerate({ mode, templateId });
  };
  return (
    <div className="h-12 border-b border-slate-200 flex items-center justify-between px-4 shrink-0">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <button
          onClick={onBack}
          className="p-1 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors shrink-0"
        >
          <ArrowLeft size={16} />
        </button>

        <div className="min-w-0 flex items-baseline gap-2">
          <h1 className="text-sm font-semibold text-slate-900 truncate">
            {productName}
          </h1>
          <p className="text-[10px] text-slate-400 truncate font-mono">
            {productId.slice(0, 8)}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0 ml-4 text-xs">
        {/* Trend/KIDITEM 진행 중 — 페이지 자유롭게 다닐 수 있도록 inline 진행 배지. templateId 별 라벨. */}
        {kpInProgress && (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-violet-50 border border-violet-200 px-2.5 py-1 text-[11px] font-semibold text-violet-700">
            <Loader2 size={11} className="animate-spin" />
            {(() => {
              const label =
                kpInProgress.templateId === 'bold-vertical'
                  ? 'KIDITEM DESIGN'
                  : 'Trend Vertical';
              return kpInProgress.imageProcessingStatus === 'pending'
                ? `${label} 카피 생성 중...`
                : `${label} 이미지 생성 중...`;
            })()}
          </span>
        )}
        {/* 상세페이지 생성 — 클릭 시 템플릿 + 모드 선택 모달. */}
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          disabled={generateBusy}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors',
            generateBusy ? 'cursor-wait bg-violet-400' : 'bg-violet-600 hover:bg-violet-700',
          )}
          title="템플릿 + 모드 선택 후 생성"
        >
          {generateBusy ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Sparkles size={12} />
          )}
          {generateBusy ? '생성 중...' : '상세페이지 생성'}
        </button>
        <TemplateSelectionModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          onConfirm={handleConfirm}
        />

        <label className="flex items-center gap-1.5 cursor-pointer select-none group">
          <div
            className={cn('w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors', isEditComplete ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 group-hover:border-slate-400')}
          >
            {isEditComplete && (
              <Check size={10} className="text-white" strokeWidth={3} />
            )}
          </div>
          <input
            type="checkbox"
            checked={isEditComplete}
            onChange={onToggleEditComplete}
            className="sr-only"
          />
          <span className="text-slate-600 whitespace-nowrap">편집완료</span>
        </label>

        <label className="flex items-center gap-1.5 cursor-pointer select-none group">
          <div
            className={cn('w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors', isLocked ? 'bg-amber-500 border-amber-500' : 'border-slate-300 group-hover:border-slate-400')}
          >
            {isLocked && (
              <Lock size={9} className="text-white" strokeWidth={3} />
            )}
          </div>
          <input
            type="checkbox"
            checked={isLocked}
            onChange={onToggleLocked}
            className="sr-only"
          />
          <span className="text-slate-600 whitespace-nowrap">상품잠금</span>
        </label>
      </div>
    </div>
  );
}
