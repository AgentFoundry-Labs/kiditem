'use client';
import { useState } from 'react';
import { ImageIcon, Zap, Loader2, CheckCircle, Wand2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { QUALITY_GRADE_BG, QUALITY_GRADE_TEXT, QUALITY_GRADE_LABELS, COMPLIANCE_GRADE_COLORS } from '@/app/thumbnails/lib/grade-constants';
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
  onGenerate?: () => void;
  onClick?: () => void;
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
  onGenerate,
  onClick,
}: ProductCardProps) {
  const [imgError, setImgError] = useState(false);
  const resolvedImageUrl = resolveImageUrl(imageUrl);
  const showImage = resolvedImageUrl && (resolvedImageUrl.startsWith('http')) && !imgError;

  return (
    <div
      className={cn(
        'bg-white rounded-xl overflow-hidden group cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5',
        overlay === 'selected'
          ? 'border-2 border-amber-400 ring-2 ring-amber-200 shadow-md shadow-amber-100'
          : overlay === 'needs-fix'
          ? 'border-2 border-amber-400'
          : 'border border-slate-200',
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
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
            <ImageIcon size={32} className="text-slate-300" />
          </div>
        )}

        {grade && (
          <div className="absolute top-2 left-2 flex items-center gap-1">
            <span className={cn('inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-sm font-black text-white', QUALITY_GRADE_BG[grade] || 'bg-slate-500')}>
              {grade}
              {score !== undefined && <span className="font-mono font-medium text-[12px] opacity-80">{score}</span>}
            </span>
            {aiAnalyzed && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[11px] font-bold bg-purple-600 text-white">
                <Zap size={10} /> AI
              </span>
            )}
          </div>
        )}

        {complianceGrade && (
          <div className="absolute top-2 right-2">
            <span
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold text-white"
              style={{ backgroundColor: COMPLIANCE_GRADE_COLORS[complianceGrade] || '#64748b' }}
            >
              {complianceGrade === 'FAIL' ? '위반' : complianceGrade === 'WARN' ? '주의' : '적합'}
            </span>
          </div>
        )}

        {candidateCount !== undefined && candidateCount > 0 && (
          <div className="absolute top-2 right-2">
            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[12px] font-medium bg-blue-500 text-white">
              <Sparkles size={12} /> {candidateCount}장
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
        {overlay === 'needs-fix' && (
          <div className="absolute bottom-0 inset-x-0 bg-amber-500 py-1.5 flex items-center justify-center">
            <span className="text-white text-[12px] font-semibold">개선 필요</span>
          </div>
        )}

        {overlay === 'selected' && (
          <div className="absolute inset-0">
            {/* 우상단 체크 */}
            <div className="absolute top-2 right-2 w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center shadow-lg border-2 border-white">
              <CheckCircle size={18} className="text-white" />
            </div>
            {/* 하단 배너 */}
            <div className="absolute bottom-0 inset-x-0 bg-amber-500 py-1.5 flex items-center justify-center gap-1">
              <CheckCircle size={12} className="text-white" />
              <span className="text-white text-[12px] font-semibold">개선 필요</span>
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
      </div>

      <div className="p-3">
        <div className="text-[14px] font-medium text-slate-900 line-clamp-2 leading-5 min-h-[40px]">{name}</div>
        <div className="mt-1.5">
          {badge || (grade && (
            <span className={cn('text-[12px] font-mono', QUALITY_GRADE_TEXT[grade] || 'text-slate-400')}>
              {QUALITY_GRADE_LABELS[grade] || grade}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
