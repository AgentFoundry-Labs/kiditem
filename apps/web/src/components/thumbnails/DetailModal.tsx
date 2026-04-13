'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  X, ImageIcon, Eye, Wand2, Zap, CheckCircle, ExternalLink,
  Download, AlertTriangle, XCircle,
  Loader2, ChevronLeft, ChevronRight, Maximize2,
} from 'lucide-react';
import { ScoreBreakdown } from '@/app/thumbnails/components/ScoreBreakdown';
import type { ThumbnailAnalysisResult, ThumbnailGenerationItem, ImageSpec } from '@kiditem/shared';
import { cn } from '@/lib/utils';
import { COMPLIANCE_GRADE_BG, COMPLIANCE_GRADE_LABELS, VIOLATION_LABELS } from '@/app/thumbnails/lib/grade-constants';
import { resolveImageUrl } from '@/lib/resolve-url';

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
  onClose: () => void;
  onAiAnalyze: () => void;
  onComplianceCheck: () => void;
  onEditCompliance: () => void;
  onEditQuality: () => void;
  onSelectCandidate: (url: string) => void;
  onApply: () => void;
  onSkip: () => void;
  onDelete: () => void;
  onSelectGen: (gen: ThumbnailGenerationItem) => void;
}

export function DetailModal({
  product,
  gen,
  productGenerations,
  aiResult,
  isAiAnalyzing,
  imageSpec,
  onClose,
  onAiAnalyze,
  onComplianceCheck,
  onSelectCandidate,
  onApply,
  onSkip,
  onDelete,
  onSelectGen,
}: DetailModalProps) {
  const [zoomImage, setZoomImage] = useState<string | null>(null);
  const [slideIndex, setSlideIndex] = useState(0);

  const display = aiResult || product;
  const candidates = gen?.candidates || [];
  const productName = gen?.product.name || product?.productName || '';
  const originalImage = resolveImageUrl(gen?.originalUrl || gen?.product.imageUrl || product?.imageUrl || null);
  const hasCandidates = candidates.length > 0;
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
      <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/55 backdrop-blur-sm" onClick={onClose}>
        <div
          className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
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
            {gen?.status === 'generating' && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg flex-shrink-0">
                <Loader2 size={12} className="animate-spin" /> 생성 중
              </span>
            )}
            {gen?.status === 'applied' && (
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

            {hasCandidates ? (
              /* ── Before / After 뷰 ── */
              <div className="flex h-full min-h-0">

                {/* ── Before ── */}
                <div className="flex-1 min-w-0 flex flex-col border-r border-slate-100">
                  <div className="px-4 pt-3 pb-1.5 flex-shrink-0">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Before</span>
                  </div>
                  <div
                    className="flex-1 relative cursor-zoom-in overflow-hidden bg-slate-50"
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
                <div className="flex-1 min-w-0 flex flex-col">
                  <div className="px-4 pt-3 pb-1.5 flex-shrink-0 flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">After</span>
                    {candidates.length > 1 && (
                      <span className="text-[10px] text-slate-400 font-medium">
                        {slideIndex + 1} / {candidates.length}
                      </span>
                    )}
                  </div>

                  {/* 슬라이드 이미지 */}
                  <div className="flex-1 relative overflow-hidden bg-slate-50">
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
                  <div className="px-4 py-3 flex-shrink-0 border-t border-slate-100">
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
            ) : (
              /* ── 분석 뷰 ── */
              <div className="flex gap-0 min-h-0">
                {/* 좌: 이미지 */}
                <div className="w-56 flex-shrink-0 bg-slate-50 border-r border-slate-100">
                  <div
                    className="relative cursor-zoom-in"
                    style={{ aspectRatio: '1' }}
                    onClick={() => originalImage && setZoomImage(originalImage)}
                  >
                    {originalImage ? (
                      <img src={originalImage} alt={productName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center gap-2 p-6">
                        <ImageIcon size={36} className="text-slate-300" />
                        <span className="text-xs text-slate-400">이미지 없음</span>
                      </div>
                    )}
                    {imageSpec && (
                      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent px-3 py-3">
                        <p className="text-[10px] text-white/75 font-mono">{imageSpec.width}×{imageSpec.height} · {imageSpec.fileSizeKB}KB</p>
                        {imageSpec.issues[0] && <p className="text-[10px] text-red-300 mt-0.5 line-clamp-1">{imageSpec.issues[0].message}</p>}
                      </div>
                    )}
                  </div>
                  {/* 과거 이력 */}
                  {productGenerations.length > 1 && (() => {
                    const past = productGenerations.filter((g) => g.id !== gen?.id).slice(0, 3);
                    if (!past.length) return null;
                    return (
                      <div className="p-3">
                        <p className="text-[10px] text-slate-400 uppercase font-semibold tracking-wide mb-2">과거 이력</p>
                        <div className="flex gap-2">
                          {past.map((pg) => {
                            const url = resolveImageUrl(pg.selectedUrl || pg.candidates?.[0]?.url || pg.originalUrl);
                            return (
                              <button key={pg.id} onClick={() => onSelectGen(pg)} className="flex-1 group">
                                <div className={cn(
                                  'aspect-square rounded-lg overflow-hidden border-2 transition-colors group-hover:border-indigo-400',
                                  pg.status === 'applied' ? 'border-emerald-400' : 'border-slate-200',
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

                {/* 우: 분석 */}
                <div className="flex-1 overflow-y-auto p-5 space-y-5">

                  {/* 액션 버튼 */}
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={onAiAnalyze}
                      disabled={isAiAnalyzing}
                      className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                    >
                      {isAiAnalyzing ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}
                      AI 분석
                    </button>
                    <button
                      onClick={onComplianceCheck}
                      disabled={isAiAnalyzing}
                      className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-semibold hover:bg-amber-600 disabled:opacity-50 transition-colors"
                    >
                      <AlertTriangle size={14} /> 가이드라인
                    </button>
                    <Link
                      href={`/thumbnail-editor?productId=${product?.productId ?? gen?.productId ?? ''}`}
                      className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-semibold hover:bg-slate-700 transition-colors"
                    >
                      <Wand2 size={14} /> 편집하기
                    </Link>
                    {aiResult && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-2.5 text-xs text-purple-500 bg-purple-50 rounded-xl font-medium">
                        <Zap size={12} /> Gemini 분석됨
                      </span>
                    )}
                  </div>

                  {/* 점수 */}
                  {display?.scores && (
                    <div>
                      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2.5">점수 분석</p>
                      <ScoreBreakdown scores={display.scores} />
                    </div>
                  )}

                  {/* 이슈 */}
                  {display && display.issues.length > 0 && (
                    <div>
                      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2.5">
                        이슈 · <span className="text-red-400">{display.issues.filter((i) => i.severity === 'critical').length} critical</span>{' '}
                        <span className="text-amber-400">{display.issues.filter((i) => i.severity === 'warning').length} warning</span>
                      </p>
                      <div className="space-y-1.5">
                        {display.issues.map((issue, idx) => (
                          <div key={idx} className={cn(
                            'flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl text-sm',
                            issue.severity === 'critical' ? 'bg-red-50 text-red-800' :
                            issue.severity === 'warning' ? 'bg-amber-50 text-amber-800' : 'bg-blue-50 text-blue-800',
                          )}>
                            {issue.severity === 'critical' ? <XCircle size={14} className="shrink-0 mt-0.5 text-red-400" /> :
                             issue.severity === 'warning' ? <AlertTriangle size={14} className="shrink-0 mt-0.5 text-amber-400" /> :
                             <CheckCircle size={14} className="shrink-0 mt-0.5 text-blue-400" />}
                            <span>{issue.message}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 가이드라인 */}
                  {display && (
                    <div>
                      <div className="flex items-center gap-2 mb-2.5">
                        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">가이드라인 준수</p>
                        {display.complianceGrade ? (
                          <span className={cn('inline-flex items-center px-2 py-0.5 rounded-lg text-[11px] font-bold text-white', COMPLIANCE_GRADE_BG[display.complianceGrade] || 'bg-slate-400')}>
                            {COMPLIANCE_GRADE_LABELS[display.complianceGrade] || display.complianceGrade}
                            {display.complianceScores && <span className="ml-1 opacity-80">({display.complianceScores.violationCount}건)</span>}
                          </span>
                        ) : (
                          <span className="text-[11px] px-2 py-0.5 rounded-lg bg-slate-100 text-slate-400">미분석</span>
                        )}
                      </div>
                      {display.complianceScores ? (
                        <div className="grid grid-cols-2 gap-1.5">
                          {Object.entries(display.complianceScores.violations).map(([key, violated]) => (
                            <div key={key} className={cn('flex items-center gap-2 px-3 py-2 rounded-xl text-xs', violated ? 'bg-red-50 text-red-700' : 'bg-slate-50 text-slate-500')}>
                              {violated ? <XCircle size={12} className="shrink-0 text-red-400" /> : <CheckCircle size={12} className="shrink-0 text-emerald-400" />}
                              <span className="flex-1 truncate">{VIOLATION_LABELS[key] || key}</span>
                              {display.complianceScores!.confidence[key] !== undefined && (
                                <span className="text-[10px] font-mono shrink-0 text-slate-300">{display.complianceScores!.confidence[key]}%</span>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-slate-400 px-3 py-2.5 rounded-xl bg-slate-50">
                          가이드라인 체크 시 12가지 규칙을 검사합니다.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── 푸터 ── */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/60 flex-shrink-0">
            <div className="flex items-center gap-2">
              {hasCandidates && (
                <>
                  <button onClick={onDelete} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm text-red-400 hover:bg-red-50 transition-colors font-medium">
                    <XCircle size={14} /> 삭제
                  </button>
                  {gen?.selectedUrl && (
                    <button
                      onClick={async () => {
                        const url = resolveImageUrl(gen.selectedUrl) ?? gen.selectedUrl;
                        const res = await fetch(url!);
                        const blob = await res.blob();
                        const a = document.createElement('a');
                        a.href = URL.createObjectURL(blob);
                        a.download = `${productName}.png`;
                        a.click();
                        URL.revokeObjectURL(a.href);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm text-slate-500 hover:bg-slate-200 transition-colors font-medium"
                    >
                      <Download size={14} /> 다운로드
                    </button>
                  )}
                </>
              )}
              {!hasCandidates && (
                <Link
                  href={`/thumbnail-editor?productId=${product?.productId ?? gen?.productId ?? ''}`}
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
            ) : (
              <Link
                href={`/thumbnail-editor?productId=${product?.productId ?? gen?.productId ?? ''}`}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors"
              >
                <Wand2 size={14} /> AI 편집 시작
              </Link>
            )}
          </div>

        </div>
      </div>
    </>
  );
}
