'use client';

import { CheckCircle2, GripVertical, ImageIcon, Loader2, Plus, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RegistrationThumbnailOption } from '../../lib/registration-selection';

interface ThumbnailGridProps {
  thumbnails: string[];
  registrationOptions?: RegistrationThumbnailOption[];
  selectedRegistrationThumbnailUrl?: string | null;
  onSelectRegistrationThumbnail?: (url: string | null) => void;
  onThumbnailsChange: (thumbnails: string[]) => void;
  onGenerateThumbnail?: () => void;
  onOpenThumbnailEditor?: () => void;
  isGeneratingThumbnail?: boolean;
}

export default function ThumbnailGrid({
  thumbnails,
  registrationOptions,
  selectedRegistrationThumbnailUrl = null,
  onSelectRegistrationThumbnail,
  onThumbnailsChange,
  onGenerateThumbnail,
  onOpenThumbnailEditor,
  isGeneratingThumbnail = false,
}: ThumbnailGridProps) {
  const handleRemove = (index: number) => {
    onThumbnailsChange(thumbnails.filter((_, i) => i !== index));
  };
  const canGenerate = thumbnails.length > 0 && !!onGenerateThumbnail && !isGeneratingThumbnail;
  const displayOptions = registrationOptions ?? thumbnails.map((url) => ({
    url,
    kind: 'source' as const,
    generatedCandidateId: null,
  }));
  const generatedCount = displayOptions.filter((option) => option.kind === 'generated').length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <label className="text-base font-semibold text-[var(--text-primary)]">
            썸네일 이미지
          </label>
          <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">
            등록에 사용할 대표 이미지는 이미지 위 버튼으로 명시 선택합니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-[var(--surface-sunken)] px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)]">
            원본 {thumbnails.length}/10장{generatedCount > 0 ? ` · 생성 ${generatedCount}장` : ''}
          </span>
          {onOpenThumbnailEditor && (
            <button
              type="button"
              onClick={onOpenThumbnailEditor}
              disabled={thumbnails.length === 0}
              className={cn(
                'inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-bold transition-all',
                'border-[var(--border)] bg-white text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]',
                'disabled:cursor-not-allowed disabled:bg-[var(--surface-sunken)] disabled:text-[var(--text-muted)]',
              )}
              title={thumbnails.length === 0 ? '먼저 원본 이미지를 추가하세요' : '썸네일 생성 도구 열기'}
            >
              <ImageIcon size={14} />
              썸네일 생성
            </button>
          )}
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
        {displayOptions.map((option, index) => {
          const isSelected = selectedRegistrationThumbnailUrl === option.url;
          return (
          <div
            key={`${option.kind}-${option.url}`}
            className={cn(
              'relative group w-[140px] h-[140px] rounded-lg overflow-hidden border-2 transition-colors',
              option.kind === 'source' ? 'cursor-grab' : 'cursor-default',
              isSelected
                ? 'border-emerald-500 ring-2 ring-emerald-200'
                : 'border-slate-200 hover:border-emerald-400',
            )}
          >
            <img
              src={option.url}
              alt={`상품 이미지 ${index + 1}`}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors" />
            {option.kind === 'source' && (
              <div className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <GripVertical
                  size={14}
                  className="text-white drop-shadow-md"
                />
              </div>
            )}
            {isSelected && (
              <span className="absolute bottom-0 left-0 right-0 bg-emerald-600 text-white text-xs text-center py-1 font-semibold">
                <CheckCircle2 size={12} className="mr-1 inline-block" />
                등록 대표
              </span>
            )}
            {onSelectRegistrationThumbnail && !isSelected && (
              <button
                type="button"
                onClick={() => onSelectRegistrationThumbnail(option.url)}
                className="absolute bottom-1 left-1 right-1 rounded-md bg-white/95 px-2 py-1 text-[11px] font-bold text-emerald-700 opacity-0 shadow-sm transition-opacity hover:bg-emerald-50 group-hover:opacity-100"
                title="등록 대표로 사용"
              >
                등록 대표로 사용
              </button>
            )}
            {option.kind === 'source' && (
              <button
                onClick={() => handleRemove(thumbnails.indexOf(option.url))}
                className="absolute top-1 right-1 w-5 h-5 bg-black/50 hover:bg-red-500 text-white rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-all"
                title="삭제"
              >
                ×
              </button>
            )}
          </div>
          );
        })}

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
