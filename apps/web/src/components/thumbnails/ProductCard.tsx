'use client';
import { useState } from 'react';
import { ImageIcon, Zap, Loader2, CheckCircle, Wand2, Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { QUALITY_GRADE_BG, COMPLIANCE_GRADE_COLORS } from '@/app/thumbnails/lib/grade-constants';
import { resolveImageUrl } from '@/lib/resolve-url';

interface ProductCardProps {
  imageUrl: string | null;
  name: string;
  grade?: string;
  score?: number;
  badge?: React.ReactNode;
  overlay?: 'generating' | 'selected' | 'ready' | 'applied' | 'skipped' | 'needs-fix';
  candidateCount?: number;
  aiAnalyzed?: boolean;
  isGenerating?: boolean;
  complianceGrade?: string;
  ctr?: number | null;
  onGenerate?: () => void;
  onClick?: () => void;
  onDelete?: () => void;
  deleteLabel?: string;
}

export function ProductCard({
  imageUrl,
  name,
  grade,
  score,
  badge,
  overlay,
  candidateCount,
  aiAnalyzed,
  isGenerating,
  complianceGrade,
  ctr,
  onGenerate,
  onClick,
  onDelete,
  deleteLabel = '삭제',
}: ProductCardProps) {
  const [imgError, setImgError] = useState(false);
  const resolvedImageUrl = resolveImageUrl(imageUrl);
  const showImage = resolvedImageUrl && (resolvedImageUrl.startsWith('http')) && !imgError;

  return (
    <div
      className={cn(
        'bg-white overflow-hidden group cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5',
        overlay === 'selected' && 'shadow-sm',
      )}
      onClick={onClick}
    >
      <div className="relative aspect-square bg-slate-50">
        {showImage ? (
          <img
            src={resolvedImageUrl!}
            alt={name}
            className="w-full h-full object-cover"
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-slate-50">
            <ImageIcon size={32} className="text-slate-300" />
          </div>
        )}

        {aiAnalyzed && (
          <div className="absolute top-1.5 right-1.5">
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-purple-600 text-white shadow-sm">
              <Zap size={10} /> AI
            </span>
          </div>
        )}

        {candidateCount !== undefined && candidateCount > 0 && (
          <div className="absolute top-1.5 left-1.5">
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-blue-500 text-white shadow-sm">
              <Sparkles size={11} /> {candidateCount}장
            </span>
          </div>
        )}

        {overlay === 'generating' && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <div className="text-center">
              <Loader2 size={28} className="text-white animate-spin mx-auto" />
              <div className="text-white text-xs font-medium mt-2">Gemini 생성 중...</div>
            </div>
          </div>
        )}
        {overlay === 'applied' && (
          <div className="absolute inset-0 bg-emerald-500/20 flex items-end justify-center pb-3">
            <span className="bg-emerald-600 text-white text-[12px] font-semibold px-3 py-1 rounded-full flex items-center gap-1">
              <CheckCircle size={12} /> 적용 완료
            </span>
          </div>
        )}
        {overlay === 'skipped' && (
          <div className="absolute inset-0 bg-slate-500/20 flex items-end justify-center pb-3">
            <span className="bg-slate-600 text-white text-[12px] font-semibold px-3 py-1 rounded-full">건너뜀</span>
          </div>
        )}

        {onGenerate && !isGenerating && (
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
            <button
              onClick={(e) => { e.stopPropagation(); onGenerate(); }}
              className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg text-xs font-semibold text-slate-900 shadow-lg hover:bg-slate-50 transition-colors"
            >
              <Wand2 size={14} /> AI 생성
            </button>
          </div>
        )}
        {isGenerating && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <Loader2 size={28} className="text-white animate-spin" />
          </div>
        )}

        {onDelete && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            aria-label={deleteLabel}
            title={deleteLabel}
            className="absolute top-1.5 right-1.5 z-20 w-6 h-6 rounded-full bg-black/60 hover:bg-red-600 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center shadow-md"
          >
            <X size={13} />
          </button>
        )}
      </div>

      <div className="p-3">
        {/* Meta row — grade + compliance side by side (등급 먼저, 적합/위반 뒤) */}
        <div className="min-h-[22px] flex items-center gap-1.5 mb-1.5">
          {grade && (
            <span className={cn('inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-black text-white', QUALITY_GRADE_BG[grade] || 'bg-slate-500')}>
              {grade}
              {score !== undefined && (
                <span className="font-mono font-medium text-[10px] opacity-80">{score}</span>
              )}
            </span>
          )}
          {complianceGrade && (
            <span
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold text-white"
              style={{ backgroundColor: COMPLIANCE_GRADE_COLORS[complianceGrade] || '#64748b' }}
            >
              {complianceGrade === 'FAIL' ? '위반' : complianceGrade === 'WARN' ? '주의' : '적합'}
            </span>
          )}
          {badge}
        </div>

        {/* Name row */}
        <div className="text-[13px] font-medium text-slate-900 line-clamp-2 leading-5 min-h-[40px]">
          {name}
        </div>

        {ctr != null && (
          <div className="mt-1 flex justify-end">
            <span className="text-[11px] font-mono font-semibold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
              CTR {ctr.toFixed(2)}%
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
