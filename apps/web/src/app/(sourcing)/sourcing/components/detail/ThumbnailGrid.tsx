'use client';

import { GripVertical, Loader2, Plus, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ThumbnailGridProps {
  thumbnails: string[];
  onThumbnailsChange: (thumbnails: string[]) => void;
  onGenerateThumbnail?: () => void;
  isGeneratingThumbnail?: boolean;
}

export default function ThumbnailGrid({
  thumbnails,
  onThumbnailsChange,
  onGenerateThumbnail,
  isGeneratingThumbnail = false,
}: ThumbnailGridProps) {
  const handleRemove = (index: number) => {
    onThumbnailsChange(thumbnails.filter((_, i) => i !== index));
  };
  const canGenerate = thumbnails.length > 0 && !!onGenerateThumbnail && !isGeneratingThumbnail;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <label className="text-base font-semibold text-[var(--text-primary)]">
            썸네일 이미지
          </label>
          <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">
            첫 번째 이미지가 상세 미리보기 대표 이미지로 사용됩니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-[var(--surface-sunken)] px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)]">
            {thumbnails.length}/10장
          </span>
          {onGenerateThumbnail && (
            <button
              type="button"
              onClick={onGenerateThumbnail}
              disabled={!canGenerate}
              className={cn(
                'inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-bold transition-all',
                'bg-violet-600 text-white shadow-sm shadow-violet-500/20 hover:bg-violet-700',
                'disabled:cursor-not-allowed disabled:bg-[var(--surface-sunken)] disabled:text-[var(--text-muted)] disabled:shadow-none',
              )}
              title={thumbnails.length === 0 ? '먼저 원본 이미지를 추가하세요' : '대표 이미지로 AI 썸네일 생성'}
            >
              {isGeneratingThumbnail ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Sparkles size={14} />
              )}
              AI 썸네일 생성
            </button>
          )}
        </div>
      </div>
      <div className="flex gap-2 flex-wrap">
        {thumbnails.map((url, index) => (
          <div
            key={`thumb-${index}`}
            className="relative group w-[140px] h-[140px] rounded-lg overflow-hidden border-2 border-slate-200 hover:border-emerald-400 transition-colors cursor-grab"
          >
            <img
              src={url}
              alt={`상품 이미지 ${index + 1}`}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors" />
            <div className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <GripVertical
                size={14}
                className="text-white drop-shadow-md"
              />
            </div>
            {index === 0 && (
              <span className="absolute bottom-0 left-0 right-0 bg-emerald-600 text-white text-xs text-center py-1 font-semibold">
                대표
              </span>
            )}
            <button
              onClick={() => handleRemove(index)}
              className="absolute top-1 right-1 w-5 h-5 bg-black/50 hover:bg-red-500 text-white rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-all"
              title="삭제"
            >
              ×
            </button>
          </div>
        ))}

        <button
          onClick={() =>
            onThumbnailsChange([
              ...thumbnails,
              `https://placehold.co/400x400/e2e8f0/64748b?text=상품+${thumbnails.length + 1}`,
            ])
          }
          className="w-[140px] h-[140px] rounded-lg border-2 border-dashed border-slate-300 hover:border-emerald-400 flex flex-col items-center justify-center gap-1.5 text-slate-400 hover:text-emerald-500 transition-colors"
        >
          <Plus size={28} />
          <span className="text-xs font-medium">이미지 추가</span>
        </button>
      </div>
    </div>
  );
}
