'use client';
import {
  X, ImageIcon, Eye, Wand2, Zap, ArrowRight, CheckCircle, ExternalLink,
  SkipForward, Download, Copy, Lightbulb, AlertTriangle, XCircle, Clock,
  Loader2, Sparkles,
} from 'lucide-react';
import { ScoreBreakdown } from './ScoreBreakdown';
import type { ThumbnailAnalysisResult, ThumbnailGenerationItem } from '@kiditem/shared';
import { cn } from '@/lib/utils';
import {
  COMPLIANCE_GRADE_TEXT,
  COMPLIANCE_GRADE_BG,
  COMPLIANCE_GRADE_LABELS,
  VIOLATION_LABELS,
} from '../lib/grade-constants';
import { API_BASE } from '@/lib/api';

function resolveUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('/generated-thumbnails/')) return `${API_BASE}${url}`;
  return url;
}

const GRADE_COLORS: Record<string, string> = {
  S: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  A: 'bg-blue-100 text-blue-700 border-blue-200',
  B: 'bg-amber-100 text-amber-700 border-amber-200',
  C: 'bg-orange-100 text-orange-700 border-orange-200',
  F: 'bg-red-100 text-red-700 border-red-200',
};

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; color: string; icon: React.ElementType }> = {
    pending: { label: '대기중', color: 'bg-slate-100 text-slate-600', icon: Clock },
    generating: { label: '생성중', color: 'bg-blue-100 text-blue-700', icon: Loader2 },
    ready: { label: '후보 선택', color: 'bg-amber-100 text-amber-700', icon: Sparkles },
    applied: { label: '적용 완료', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle },
    skipped: { label: '건너뜀', color: 'bg-slate-100 text-slate-500', icon: SkipForward },
    failed: { label: '생성 실패', color: 'bg-red-100 text-red-700', icon: XCircle },
  };
  const c = config[status] || config.pending;
  const Icon = c.icon;
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium', c.color)}>
      <Icon size={10} className={status === 'generating' ? 'animate-spin' : ''} /> {c.label}
    </span>
  );
}

function ScoreBadge({ score, grade }: { score: number; grade: string }) {
  return (
    <div className={cn('flex items-center gap-1.5 px-2.5 py-1 rounded-lg border', GRADE_COLORS[grade] || 'bg-slate-100 text-slate-700 border-slate-200')}>
      <span className="text-lg font-black">{grade}</span>
      <span className="text-sm font-mono tabular-nums">{score}</span>
    </div>
  );
}

interface DetailModalProps {
  product: ThumbnailAnalysisResult | null;
  gen: ThumbnailGenerationItem | null | undefined;
  aiResult?: ThumbnailAnalysisResult;
  isAiAnalyzing: boolean;
  imageSpec?: { width: number; height: number; aspectRatio: number; fileSizeKB: number; format: string; issues: Array<{ type: string; severity: string; message: string }> } | null;
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
}

export function DetailModal({
  product,
  gen,
  aiResult,
  isAiAnalyzing,
  imageSpec,
  generatedProductIds,
  onClose,
  onAiAnalyze,
  onComplianceCheck,
  onEditCompliance,
  onEditQuality,
  onSelectCandidate,
  onApply,
  onSkip,
  onDelete,
}: DetailModalProps) {
  const display = aiResult || product;
  const candidates = gen?.candidates || [];
  const productName = gen?.product.name || product?.productName || '';
  const originalImage = resolveUrl(gen?.originalUrl || gen?.product.imageUrl || product?.imageUrl || null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-slate-900 line-clamp-1">{productName}</div>
            {display && (
              <div className="flex items-center gap-2 mt-1">
                <ScoreBadge score={display.overallScore} grade={display.grade} />
                {gen && <StatusBadge status={gen.status} />}
              </div>
            )}
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
            <X size={18} className="text-slate-400" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {gen && candidates.length > 0 ? (
            <>
              <div className="flex items-start gap-4">
                <div className="w-40 flex-shrink-0">
                  <div className="text-[10px] font-mono text-slate-400 uppercase mb-1.5">Before</div>
                  <div className="aspect-square rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
                    {originalImage ? (
                      <img src={originalImage} alt="원본" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center"><ImageIcon size={32} className="text-slate-300" /></div>
                    )}
                  </div>
                </div>

                <div className="flex items-center pt-20 flex-shrink-0">
                  <ArrowRight size={20} className="text-slate-300" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="text-[10px] font-mono text-slate-400 uppercase">
                      {gen?.method === 'edit' ? '가이드라인 수정' : 'Gemini AI 후보'} ({candidates.length}장)
                    </div>
                    {gen?.editAnalysis && (
                      <span className={cn(
                        'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold text-white',
                        gen.editAnalysis.complianceGrade === 'PASS' ? 'bg-emerald-600' :
                        gen.editAnalysis.complianceGrade === 'WARN' ? 'bg-amber-500' : 'bg-red-600',
                      )}>
                        편집 후: {gen.editAnalysis.complianceGrade}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {candidates.map((candidate, idx) => {
                      const imgUrl = resolveUrl(typeof candidate === 'string' ? candidate : candidate.url) ?? '';
                      return (
                        <button
                          key={idx}
                          onClick={() => onSelectCandidate(imgUrl)}
                          className={cn(
                            'relative rounded-xl overflow-hidden border-2 transition-all hover:scale-[1.02]',
                            gen.selectedUrl === imgUrl ? 'border-purple-500 ring-2 ring-purple-200' : 'border-slate-200 hover:border-slate-300'
                          )}
                        >
                          <div className="aspect-square bg-slate-100">
                            <img src={imgUrl} alt={`후보 ${idx + 1}`} className="w-full h-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
                          </div>
                          <div className="absolute top-1.5 left-1.5">
                            <span className={cn(
                              'inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold',
                              gen.selectedUrl === imgUrl ? 'bg-blue-500 text-white' : 'bg-white/80 text-slate-600 border border-slate-300'
                            )}>
                              {gen.selectedUrl === imgUrl ? <CheckCircle size={10} /> : String.fromCharCode(65 + idx)}
                            </span>
                          </div>
                          {gen.selectedUrl === imgUrl && (
                            <div className="absolute inset-0 bg-blue-500/10 flex items-center justify-center">
                              <span className="bg-purple-600 text-white text-[10px] font-semibold px-2.5 py-1 rounded-full">선택됨</span>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {gen.status === 'ready' && (
                <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
                  <button
                    onClick={onApply}
                    disabled={!gen.selectedUrl}
                    className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 text-white rounded-lg text-xs font-semibold hover:bg-purple-700 disabled:opacity-40 transition-colors"
                  >
                    <ExternalLink size={14} /> 쿠팡에 적용하기
                  </button>
                  <button
                    onClick={onSkip}
                    className="flex items-center gap-2 px-3 py-2.5 text-slate-500 hover:bg-slate-100 rounded-lg text-xs font-medium transition-colors"
                  >
                    <SkipForward size={14} /> 건너뛰기
                  </button>
                  <button
                    onClick={onDelete}
                    className="flex items-center gap-2 px-3 py-2.5 text-red-500 hover:bg-red-50 rounded-lg text-xs font-medium transition-colors"
                  >
                    <XCircle size={14} /> 삭제
                  </button>
                  {gen.selectedUrl && (
                    <>
                      <div className="flex-1" />
                      <button
                        onClick={() => gen.selectedUrl && window.open(gen.selectedUrl, '_blank')}
                        className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                        title="다운로드"
                      >
                        <Download size={14} />
                      </button>
                      <button
                        onClick={async () => { if (gen.selectedUrl) try { await navigator.clipboard.writeText(gen.selectedUrl); } catch { /* ignore */ } }}
                        className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                        title="URL 복사"
                      >
                        <Copy size={14} />
                      </button>
                    </>
                  )}
                </div>
              )}

              {gen.status === 'ready' && gen.selectedUrl && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 text-blue-800 text-xs">
                  <Lightbulb size={14} className="shrink-0 mt-0.5 text-blue-500" />
                  <div>
                    <div className="font-semibold mb-0.5">적용 방법</div>
                    <ol className="list-decimal list-inside space-y-0.5 text-blue-700">
                      <li>&quot;쿠팡에 적용하기&quot; 클릭 → 쿠팡 Wing 상품수정 페이지 오픈</li>
                      <li>익스텐션 사이드 패널에서 AI 이미지를 확인</li>
                      <li>이미지를 드래그하여 쿠팡 업로드 영역에 드롭</li>
                    </ol>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex items-start gap-4">
              <div className="w-48 flex-shrink-0">
                <div className="aspect-square rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
                  {originalImage && (originalImage.startsWith('http') || originalImage.startsWith('/')) ? (
                    <img src={originalImage} alt={productName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center"><ImageIcon size={36} className="text-slate-300" /></div>
                  )}
                </div>
                {imageSpec && (
                  <div className="mt-2 space-y-1">
                    <div className="text-[10px] font-mono text-slate-400">
                      {imageSpec.width}x{imageSpec.height} · {imageSpec.format.split('/')[1]?.toUpperCase()} · {imageSpec.fileSizeKB}KB
                    </div>
                    {imageSpec.issues.map((issue, i) => (
                      <div
                        key={i}
                        className={cn(
                          'text-[10px] px-1.5 py-0.5 rounded',
                          issue.severity === 'fail' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600',
                        )}
                      >
                        {issue.message}
                      </div>
                    ))}
                    {imageSpec.issues.length === 0 && (
                      <div className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600">
                        이미지 스펙 적합
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0 space-y-3">
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={onAiAnalyze}
                    disabled={isAiAnalyzing}
                    className="flex items-center gap-2 px-3 py-2 bg-purple-600 text-white rounded-lg text-xs font-medium hover:bg-purple-700 disabled:opacity-50"
                  >
                    <Eye size={12} /> {isAiAnalyzing ? 'AI 분석 중...' : 'AI 정밀 분석'}
                  </button>
                  <button
                    onClick={onComplianceCheck}
                    disabled={isAiAnalyzing}
                    className="flex items-center gap-2 px-3 py-2 bg-amber-500 text-white rounded-lg text-xs font-medium hover:bg-amber-600 disabled:opacity-50"
                  >
                    <AlertTriangle size={12} /> {isAiAnalyzing ? '체크 중...' : '가이드라인 체크'}
                  </button>
                  {gen && (gen.status === 'pending' || gen.status === 'generating') && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium">
                      <Loader2 size={12} className="animate-spin" /> AI 편집 진행 중...
                    </div>
                  )}
                  {gen?.status === 'failed' && (
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1 px-3 py-2 bg-red-50 text-red-700 rounded-lg text-xs font-medium">
                        <XCircle size={12} /> AI 편집 실패
                      </span>
                      <button
                        onClick={onEditCompliance}
                        className="flex items-center gap-2 px-3 py-2 bg-amber-600 text-white rounded-lg text-xs font-medium hover:bg-amber-700"
                      >
                        <Wand2 size={12} /> 재시도
                      </button>
                    </div>
                  )}
                  {(!gen || gen.status === 'applied' || gen.status === 'skipped') && (
                    <>
                      {product && (product.complianceGrade === 'FAIL' || product.complianceGrade === 'WARN') && (
                        <button
                          onClick={onEditCompliance}
                          className="flex items-center gap-2 px-3 py-2 bg-amber-600 text-white rounded-lg text-xs font-medium hover:bg-amber-700"
                        >
                          <Wand2 size={12} /> 가이드라인 수정
                        </button>
                      )}
                      {product && (product.grade === 'F' || product.grade === 'C' || product.grade === 'B') && (
                        <button
                          onClick={onEditQuality}
                          className="flex items-center gap-2 px-3 py-2 bg-purple-600 text-white rounded-lg text-xs font-medium hover:bg-purple-700"
                        >
                          <Wand2 size={12} /> 품질 개선
                        </button>
                      )}
                    </>
                  )}
                </div>

                {aiResult && (
                  <div className="flex items-center gap-2 text-[10px] text-purple-600 font-mono">
                    <Zap size={10} /> GEMINI VISION AI 분석 결과
                  </div>
                )}

                {display && display.scores && (
                  <ScoreBreakdown scores={display.scores} />
                )}

                {display && display.issues.length > 0 && (
                  <div>
                    <div className="text-[10px] font-mono text-slate-500 uppercase mb-1.5">
                      발견된 이슈 ({display.issues.filter((i) => i.severity === 'critical').length} critical, {display.issues.filter((i) => i.severity === 'warning').length} warning)
                    </div>
                    <div className="space-y-1">
                      {display.issues.map((issue, idx) => (
                        <div
                          key={idx}
                          className={cn('flex items-start gap-2 p-2 rounded-lg text-xs', {
                            'bg-red-50 text-red-800': issue.severity === 'critical',
                            'bg-amber-50 text-amber-800': issue.severity === 'warning',
                            'bg-blue-50 text-blue-800': issue.severity === 'info',
                          })}
                        >
                          {issue.severity === 'critical' ? <XCircle size={13} className="shrink-0 mt-0.5" /> : issue.severity === 'warning' ? <AlertTriangle size={13} className="shrink-0 mt-0.5" /> : <CheckCircle size={13} className="shrink-0 mt-0.5" />}
                          <span>{issue.message}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {display && display.suggestions.length > 0 && (
                  <div>
                    <div className="text-[10px] font-mono text-slate-500 uppercase mb-1.5">개선 제안</div>
                    <div className="space-y-1">
                      {display.suggestions.map((s, idx) => (
                        <div key={idx} className="flex items-start gap-2 p-2 rounded-lg bg-emerald-50 text-emerald-800 text-xs">
                          <Lightbulb size={13} className="shrink-0 mt-0.5 text-emerald-500" />
                          <span>{s}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {display && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="text-[10px] font-mono text-slate-500 uppercase">가이드라인 준수</div>
                      {display.complianceGrade ? (
                        <span className={cn(
                          'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold text-white',
                          COMPLIANCE_GRADE_BG[display.complianceGrade] || 'bg-slate-400',
                        )}>
                          {COMPLIANCE_GRADE_LABELS[display.complianceGrade] || display.complianceGrade}
                          {display.complianceScores && (
                            <span className="ml-1 opacity-80">({display.complianceScores.violationCount}건)</span>
                          )}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-400">
                          미분석
                        </span>
                      )}
                    </div>
                    {display.complianceScores ? (
                      <div className="grid grid-cols-2 gap-1">
                        {Object.entries(display.complianceScores.violations).map(([key, violated]) => {
                          const confidence = display.complianceScores!.confidence[key];
                          return (
                            <div
                              key={key}
                              className={cn(
                                'flex items-center gap-1.5 p-1.5 rounded-lg text-[11px]',
                                violated ? 'bg-red-50 text-red-700' : 'bg-slate-50 text-slate-500',
                              )}
                            >
                              {violated
                                ? <XCircle size={11} className="shrink-0 text-red-500" />
                                : <CheckCircle size={11} className="shrink-0 text-emerald-500" />
                              }
                              <span className="flex-1 truncate">{VIOLATION_LABELS[key] || key}</span>
                              {confidence !== undefined && (
                                <span className={cn(
                                  'text-[9px] font-mono shrink-0',
                                  violated ? 'text-red-400' : 'text-slate-300',
                                )}>
                                  {confidence}%
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : display.complianceGrade === null && (
                      <div className="text-[11px] text-slate-400 p-2 rounded-lg bg-slate-50">
                        가이드라인 준수 분석을 실행하면 12가지 규칙을 검사합니다.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
