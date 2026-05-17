'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  X, ImageIcon, Eye, Wand2, CheckCircle, ExternalLink,
  Download, XCircle,
  Loader2, ChevronLeft, ChevronRight, Maximize2,
  Square,
} from 'lucide-react';
import { toast } from 'sonner';
import type {
  ImageSpec,
  RecomposeVariantKey,
  ThumbnailAnalysisResult,
  ThumbnailGenerationItem,
} from '@kiditem/shared/ai';
import { cn } from '@/lib/utils';
import { resolveImageUrl } from '@/lib/resolve-url';
import { isApplied } from '../../lib/thumbnail-status';
import { CoupangSearchCardPreview } from '@/components/coupang/CoupangPreview';
import { buildEditHref } from '@/app/(product-pipeline)/product-pipeline/thumbnail-generation/edit/lib/build-edit-href';
import { downloadImageFile } from '@/lib/browser-download';
import { DetailModalAnalysisPanel } from './DetailModalAnalysisPanel';

const GRADE_CONFIG: Record<string, { bg: string; text: string }> = {
  S: { bg: '#10b981', text: '#fff' },
  A: { bg: '#3b82f6', text: '#fff' },
  B: { bg: '#f59e0b', text: '#fff' },
  C: { bg: '#f97316', text: '#fff' },
  F: { bg: '#ef4444', text: '#fff' },
};

interface DetailModalProps {
  product: ThumbnailAnalysisResult | null;
  gen: ThumbnailGenerationItem | null | undefined;
  productGenerations: ThumbnailGenerationItem[];
  aiResult?: ThumbnailAnalysisResult;
  isAiAnalyzing: boolean;
  imageSpec?: ImageSpec | null;
  generatedProductIds: Set<string>;
  hideEdit?: boolean;
  onClose: () => void;
  onAiAnalyze: () => void;
  /**
   * 컴플라이언스 편집 시작.
   * variantKey 가 지정되면 사용자가 picker 에서 명시적으로 고른 레이아웃,
   * 없으면 서버 기본값(auto)으로 진행.
   */
  onEditCompliance: (variantKey?: RecomposeVariantKey) => void;
  onEditQuality: (variantKey?: RecomposeVariantKey) => void;
  onSelectCandidate: (url: string) => void;
  onApply: () => void;
  onSkip: () => void;
  onDelete: () => void;
  onCancel?: () => void;
  onSelectGen: (gen: ThumbnailGenerationItem) => void;
}

export function DetailModal({
  product,
  gen,
  productGenerations,
  aiResult,
  isAiAnalyzing,
  imageSpec,
  hideEdit = false,
  onClose,
  onAiAnalyze,
  onEditCompliance,
  onSelectCandidate,
  onApply,
  onSkip,
  onDelete,
  onCancel,
  onSelectGen,
}: DetailModalProps) {
  const [zoomImage, setZoomImage] = useState<string | null>(null);
  const [slideIndex, setSlideIndex] = useState(0);

  const display = aiResult || product;
  const analysisMethodLabel =
    display?.method === 'ai' ? 'Gemini' : display?.method === 'rule' ? '룰 기반' : 'AI';
  const candidates = gen?.candidates || [];
  const productName = gen?.product?.name || product?.productName || '';
  const originalImage = resolveImageUrl(gen?.originalUrl || gen?.product?.imageUrl || product?.imageUrl || null);
  const hasCandidates = candidates.length > 0;
  const hasAnalysis = !!(display?.scores || display?.complianceScores);
  // 이미지 생성 + 분석 데이터가 둘 다 있으면 combined 뷰: 위 Before/After, 아래 분석.
  const isCombined = hasCandidates && hasAnalysis;
  const isUnclassified = !gen && !hasCandidates && !display?.scores && !display?.complianceScores;
  const isGenerationFailed = gen?.status === 'failed' || gen?.status === 'cancelled';
  const isGenerationRunning = gen?.status === 'pending' || gen?.status === 'running';
  const editHref = buildEditHref({
    productId: product?.productId ?? gen?.productId ?? '',
    generationId: gen?.id,
    imageUrl: product?.imageUrl ?? gen?.product?.imageUrl ?? null,
  });
  const grade = display?.grade;
  const gradeConf = grade ? GRADE_CONFIG[grade] : null;

  // gen이 바뀌면 슬라이드를 기존 selectedUrl 위치로 초기화
  useEffect(() => {
    if (!gen || candidates.length === 0) { setSlideIndex(0); return; }
    const idx = candidates.findIndex((c) => {
      const raw = typeof c === 'string' ? c : c.url;
      return raw === gen.selectedUrl || resolveImageUrl(raw) === resolveImageUrl(gen.selectedUrl ?? null);
    });
    setSlideIndex(idx >= 0 ? idx : 0);
  }, [gen?.id]);

  const currentRawUrl = candidates[slideIndex]
    ? (typeof candidates[slideIndex] === 'string' ? candidates[slideIndex] : (candidates[slideIndex] as { url: string }).url)
    : '';
  const currentImgUrl = resolveImageUrl(currentRawUrl) ?? '';
  const isCurrentSelected = resolveImageUrl(gen?.selectedUrl ?? null) === currentImgUrl;

  return (
    <>
      {/* 줌 */}
      {zoomImage && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 cursor-zoom-out"
          onClick={() => setZoomImage(null)}
        >
          <img src={zoomImage} alt="" className="max-w-[90vw] max-h-[90vh] object-contain rounded-2xl" referrerPolicy="no-referrer" />
          <button className="absolute top-5 right-5 w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors" onClick={() => setZoomImage(null)}>
            <X size={18} className="text-white" />
          </button>
        </div>
      )}

      {/* 백드롭 */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/40" onClick={onClose}>
        <div
          className={cn(
            'bg-white rounded-2xl w-full max-h-[90vh] flex flex-col overflow-hidden',
            isCombined
              ? 'max-w-4xl'
              : hasCandidates
                ? 'max-w-3xl'
                : isUnclassified
                  ? 'max-w-md'
                  : 'max-w-4xl',
          )}
          style={{ boxShadow: '0 24px 64px rgba(0,0,0,0.22)' }}
          onClick={(e) => e.stopPropagation()}
        >

          {/* ── 헤더 ── */}
          <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 flex-shrink-0">
            {gradeConf && grade && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm font-black flex-shrink-0" style={{ background: gradeConf.bg, color: gradeConf.text }}>
                {grade}
                <span className="font-mono text-xs font-semibold opacity-80">{display?.overallScore}</span>
              </span>
            )}
            <h2 className="flex-1 text-[15px] font-semibold text-slate-900 truncate min-w-0">{productName}</h2>
            {isGenerationRunning && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg flex-shrink-0">
                <Loader2 size={12} className="animate-spin" /> 생성 중
              </span>
            )}
            {isGenerationRunning && onCancel && (
              <button
                type="button"
                onClick={onCancel}
                aria-label="썸네일 생성 중단"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
              >
                <Square size={12} />
                중단
              </button>
            )}
            {isGenerationFailed && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 bg-red-50 px-2.5 py-1 rounded-lg flex-shrink-0">
                <XCircle size={12} /> {gen?.status === 'cancelled' ? '취소됨' : '생성 실패'}
              </span>
            )}
            {gen && isApplied(gen) && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg flex-shrink-0">
                <CheckCircle size={12} /> 적용 완료
              </span>
            )}
            <button onClick={onClose} className="w-8 h-8 rounded-xl hover:bg-slate-100 flex items-center justify-center transition-colors flex-shrink-0">
              <X size={16} className="text-slate-400" />
            </button>
          </div>

          {/* ── 바디 ── */}
          <div className="flex-1 overflow-y-auto">
            {isGenerationFailed && (
              <div className="mx-5 mt-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-800">
                <div className="flex items-center gap-2 font-semibold">
                  <XCircle size={15} className="shrink-0" />
                  {gen?.status === 'cancelled' ? '생성이 취소되었습니다' : 'AI 썸네일 생성에 실패했습니다'}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-red-700/85">
                  {gen?.errorMessage ?? (gen?.status === 'cancelled' ? '사용자 또는 시스템에 의해 취소되었습니다.' : '오류 메시지가 없습니다.')}
                </p>
              </div>
            )}

            {isCombined ? (
              /* ── Combined: 위 Before/After, 아래 분석 ── */
              <div className="flex flex-col">
                {/* Before / After (분석이 있는 경우에도 이미지 비교 먼저) */}
                <div className="grid grid-cols-2 gap-4 mt-4 px-4 pb-2">
                  {/* Before */}
                  <div className="flex flex-col">
                    <div className="pb-1.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Before</span>
                    </div>
                    <div
                      className="aspect-square relative cursor-zoom-in overflow-hidden bg-slate-50 rounded-xl border border-slate-100"
                      onClick={() => originalImage && setZoomImage(originalImage)}
                    >
                      {originalImage ? (
                        <img src={originalImage} alt="현재" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ImageIcon size={32} className="text-slate-300" />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* After */}
                  <div className="flex flex-col">
                    <div className="pb-1.5 flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">After</span>
                      {candidates.length > 1 && (
                        <span className="text-[10px] text-slate-400 font-medium">
                          {slideIndex + 1} / {candidates.length}
                        </span>
                      )}
                    </div>
                    <div className="aspect-square relative overflow-hidden bg-slate-50 rounded-xl border border-slate-100">
                      {currentImgUrl ? (
                        <img
                          key={currentImgUrl}
                          src={currentImgUrl}
                          alt={`편집 결과 ${slideIndex + 1}`}
                          className="w-full h-full object-contain transition-opacity duration-200"
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          onClick={() => setZoomImage(currentImgUrl)}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ImageIcon size={32} className="text-slate-300" />
                        </div>
                      )}
                      {isCurrentSelected && (
                        <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-indigo-600 text-white text-[11px] font-bold px-2.5 py-1 rounded-full shadow-lg">
                          <CheckCircle size={12} /> 선택됨
                        </div>
                      )}
                      {candidates.length > 1 && (
                        <>
                          <button
                            disabled={slideIndex === 0}
                            onClick={() => setSlideIndex((i) => i - 1)}
                            className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 shadow-md flex items-center justify-center disabled:opacity-30 hover:bg-white transition-colors"
                          >
                            <ChevronLeft size={16} className="text-slate-700" />
                          </button>
                          <button
                            disabled={slideIndex === candidates.length - 1}
                            onClick={() => setSlideIndex((i) => i + 1)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 shadow-md flex items-center justify-center disabled:opacity-30 hover:bg-white transition-colors"
                          >
                            <ChevronRight size={16} className="text-slate-700" />
                          </button>
                          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                            {candidates.map((_, i) => (
                              <button
                                key={i}
                                onClick={() => setSlideIndex(i)}
                                className={cn(
                                  'w-1.5 h-1.5 rounded-full transition-all',
                                  i === slideIndex ? 'bg-indigo-500 w-3' : 'bg-slate-300 hover:bg-slate-400',
                                )}
                              />
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                    <div className="pt-3">
                      <button
                        onClick={() => onSelectCandidate(isCurrentSelected ? '' : currentRawUrl)}
                        className={cn(
                          'w-full py-2 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 transition-all duration-200 border-2',
                          isCurrentSelected
                            ? 'bg-indigo-600 border-indigo-600 text-white'
                            : 'bg-white border-slate-200 text-slate-500 hover:border-indigo-400 hover:text-indigo-600',
                        )}
                      >
                        {isCurrentSelected ? <><CheckCircle size={14} /> 선택됨</> : '이 이미지 선택'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* 구분선 */}
                <div className="px-4 pt-2">
                  <div className="border-t border-slate-100" />
                </div>

                <DetailModalAnalysisPanel
                  display={display}
                  aiResult={aiResult}
                  analysisMethodLabel={analysisMethodLabel}
                  isAiAnalyzing={isAiAnalyzing}
                  layout="combined"
                  className="px-4 pt-4 pb-4"
                  onAiAnalyze={onAiAnalyze}
                  onEditCompliance={onEditCompliance}
                />
              </div>
            ) : hasCandidates ? (
              /* ── Before / After 뷰 ── */
              <div className="grid grid-cols-2 gap-4 max-w-3xl mx-auto mt-4 px-4 pb-4">

                {/* ── Before ── */}
                <div className="flex flex-col">
                  <div className="pb-1.5 flex-shrink-0">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Before</span>
                  </div>
                  <div
                    className="aspect-square relative cursor-zoom-in overflow-hidden bg-slate-50 rounded-xl border border-slate-100"
                    onClick={() => originalImage && setZoomImage(originalImage)}
                  >
                    {originalImage ? (
                      <img src={originalImage} alt="현재" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageIcon size={32} className="text-slate-300" />
                      </div>
                    )}
                    <button
                      className="absolute bottom-3 right-3 w-7 h-7 rounded-full bg-black/35 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
                      onClick={(e) => { e.stopPropagation(); if (originalImage) setZoomImage(originalImage); }}
                    >
                      <Maximize2 size={12} className="text-white" />
                    </button>
                  </div>
                </div>

                {/* ── After ── */}
                <div className="flex flex-col">
                  <div className="pb-1.5 flex-shrink-0 flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">After</span>
                    {candidates.length > 1 && (
                      <span className="text-[10px] text-slate-400 font-medium">
                        {slideIndex + 1} / {candidates.length}
                      </span>
                    )}
                  </div>

                  {/* 슬라이드 이미지 */}
                  <div className="aspect-square relative overflow-hidden bg-slate-50 rounded-xl border border-slate-100">
                    {currentImgUrl ? (
                      <img
                        key={currentImgUrl}
                        src={currentImgUrl}
                        alt={`편집 결과 ${slideIndex + 1}`}
                        className="w-full h-full object-contain transition-opacity duration-200"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        onClick={() => setZoomImage(currentImgUrl)}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageIcon size={32} className="text-slate-300" />
                      </div>
                    )}

                    {/* 선택됨 오버레이 */}
                    {isCurrentSelected && (
                      <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-indigo-600 text-white text-[11px] font-bold px-2.5 py-1 rounded-full shadow-lg">
                        <CheckCircle size={12} /> 선택됨
                      </div>
                    )}

                    {/* 확대 버튼 */}
                    <button
                      className="absolute bottom-3 right-3 w-7 h-7 rounded-full bg-black/35 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
                      onClick={(e) => { e.stopPropagation(); if (currentImgUrl) setZoomImage(currentImgUrl); }}
                    >
                      <Maximize2 size={12} className="text-white" />
                    </button>

                    {/* 슬라이드 좌우 버튼 */}
                    {candidates.length > 1 && (
                      <>
                        <button
                          disabled={slideIndex === 0}
                          onClick={() => setSlideIndex((i) => i - 1)}
                          className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 shadow-md flex items-center justify-center disabled:opacity-30 hover:bg-white transition-colors"
                        >
                          <ChevronLeft size={16} className="text-slate-700" />
                        </button>
                        <button
                          disabled={slideIndex === candidates.length - 1}
                          onClick={() => setSlideIndex((i) => i + 1)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 shadow-md flex items-center justify-center disabled:opacity-30 hover:bg-white transition-colors"
                        >
                          <ChevronRight size={16} className="text-slate-700" />
                        </button>
                        {/* 점 인디케이터 */}
                        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                          {candidates.map((_, i) => (
                            <button
                              key={i}
                              onClick={() => setSlideIndex(i)}
                              className={cn(
                                'w-1.5 h-1.5 rounded-full transition-all',
                                i === slideIndex ? 'bg-indigo-500 w-3' : 'bg-slate-300 hover:bg-slate-400',
                              )}
                            />
                          ))}
                        </div>
                      </>
                    )}
                  </div>

                  {/* 선택 버튼 */}
                  <div className="pt-3 flex-shrink-0">
                    <button
                      onClick={() => onSelectCandidate(isCurrentSelected ? '' : currentRawUrl)}
                      className={cn(
                        'w-full py-2 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 transition-all duration-200 border-2',
                        isCurrentSelected
                          ? 'bg-indigo-600 border-indigo-600 text-white'
                          : 'bg-white border-slate-200 text-slate-500 hover:border-indigo-400 hover:text-indigo-600',
                      )}
                    >
                      {isCurrentSelected ? <><CheckCircle size={14} /> 선택됨</> : '이 이미지 선택'}
                    </button>
                  </div>
                </div>
              </div>
            ) : isUnclassified ? (
              /* ── 미분류: 세로 스택 + AI 분석만 ── */
              <div className="flex flex-col px-5 py-5 gap-5">
                <div onClick={() => originalImage && setZoomImage(originalImage)} className="cursor-zoom-in">
                  <CoupangSearchCardPreview imageUrl={originalImage ?? ''} productName={productName} />
                </div>
                <button
                  onClick={onAiAnalyze}
                  disabled={isAiAnalyzing}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {isAiAnalyzing ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}
                  AI 분석
                </button>
              </div>
            ) : (
              /* ── 분류됨: 왼쪽 이미지 + 오른쪽 분석 ── */
              <div className="grid grid-cols-[minmax(0,420px)_1fr] gap-5 p-5">
                {/* 좌: 쿠팡 미리보기 + 과거 이력 */}
                <div className="flex flex-col gap-3">
                  <div onClick={() => originalImage && setZoomImage(originalImage)} className="cursor-zoom-in">
                    <CoupangSearchCardPreview imageUrl={originalImage ?? ''} productName={productName} />
                  </div>
                  {productGenerations.length > 1 && (() => {
                    const past = productGenerations.filter((g) => g.id !== gen?.id).slice(0, 3);
                    if (!past.length) return null;
                    return (
                      <div>
                        <p className="text-[10px] text-slate-400 uppercase font-semibold tracking-wide mb-2">과거 이력</p>
                        <div className="flex gap-2">
                          {past.map((pg) => {
                            const url = resolveImageUrl(pg.selectedUrl || pg.candidates?.[0]?.url || pg.originalUrl);
                            return (
                              <button key={pg.id} onClick={() => onSelectGen(pg)} className="flex-1 group">
                                <div className={cn(
                                  'aspect-square rounded-lg overflow-hidden border-2 transition-colors group-hover:border-indigo-400',
                                  isApplied(pg) ? 'border-emerald-400' : 'border-slate-200',
                                )}>
                                  {url
                                    ? <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
                                    : <div className="w-full h-full bg-slate-100 flex items-center justify-center"><ImageIcon size={12} className="text-slate-300" /></div>
                                  }
                                </div>
                                <p className="text-[9px] text-slate-400 text-center mt-1">
                                  {new Date(pg.createdAt).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}
                                </p>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                <DetailModalAnalysisPanel
                  display={display}
                  aiResult={aiResult}
                  analysisMethodLabel={analysisMethodLabel}
                  isAiAnalyzing={isAiAnalyzing}
                  layout="side"
                  className="min-w-0"
                  onAiAnalyze={onAiAnalyze}
                  onEditCompliance={onEditCompliance}
                />
              </div>
            )}
          </div>

          {/* ── 푸터 (미분류는 없음) ── */}
          {!isUnclassified && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/60 flex-shrink-0">
            <div className="flex items-center gap-2">
              {hasCandidates && (
                <>
                  <button onClick={onDelete} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm text-red-400 hover:bg-red-50 transition-colors font-medium">
                    <XCircle size={14} /> 삭제
                  </button>
                  {!hideEdit && (
                    <Link
                      href={editHref}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm text-slate-500 hover:bg-slate-200 transition-colors font-medium"
                    >
                      <Wand2 size={14} /> 편집 페이지
                    </Link>
                  )}
                  {gen?.selectedUrl && (
                    <button
                      onClick={async () => {
                        const url = resolveImageUrl(gen.selectedUrl) ?? gen.selectedUrl;
                        if (!url) return;
                        try {
                          await downloadImageFile(url, `${productName}.png`);
                        } catch (err) {
                          console.error('[thumbnail-detail] download failed', err);
                          toast.error('이미지 다운로드에 실패했어요. 다시 시도해주세요.');
                        }
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm text-slate-500 hover:bg-slate-200 transition-colors font-medium"
                    >
                      <Download size={14} /> 다운로드
                    </button>
                  )}
                </>
              )}
              {!hasCandidates && !hideEdit && (
                <Link
                  href={editHref}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm text-slate-500 hover:bg-slate-200 transition-colors font-medium"
                >
                  <Wand2 size={14} /> 편집 페이지
                </Link>
              )}
            </div>

            {hasCandidates ? (
              <button
                onClick={onApply}
                disabled={!gen?.selectedUrl}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-35 disabled:cursor-not-allowed transition-all shadow-sm shadow-indigo-200"
              >
                <ExternalLink size={14} />
                {gen?.selectedUrl ? '쿠팡에 적용하기' : '이미지를 선택하세요'}
              </button>
            ) : !hideEdit ? (
              <Link
                href={editHref}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors"
              >
                <Wand2 size={14} /> AI 편집 시작
              </Link>
            ) : null}
          </div>
          )}

        </div>
      </div>
    </>
  );
}
