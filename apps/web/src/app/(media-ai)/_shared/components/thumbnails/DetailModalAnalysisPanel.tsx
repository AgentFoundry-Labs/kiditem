import { AlertTriangle, CheckCircle, Eye, Loader2, Wand2, XCircle, Zap } from 'lucide-react';
import type { RecomposeVariantKey, ThumbnailAnalysisResult } from '@kiditem/shared/ai';
import { ScoreBreakdown } from '@/app/(media-ai)/thumbnails/components/ScoreBreakdown';
import {
  COMPLIANCE_GRADE_BG,
  COMPLIANCE_GRADE_LABELS,
  VIOLATION_LABELS,
} from '@/app/(media-ai)/thumbnails/lib/grade-constants';
import {
  getEffectiveComplianceGrade,
  getViolationEvidence,
} from '@/app/(media-ai)/thumbnails/lib/thumbnail-classification';
import { cn } from '@/lib/utils';
import { RecomposeVariantPicker } from './RecomposeVariantPicker';

interface DetailModalAnalysisPanelProps {
  display: ThumbnailAnalysisResult | null | undefined;
  aiResult?: ThumbnailAnalysisResult;
  analysisMethodLabel: string;
  isAiAnalyzing: boolean;
  layout: 'combined' | 'side';
  className?: string;
  onAiAnalyze: () => void;
  onEditCompliance: (variantKey?: RecomposeVariantKey) => void;
}

export function DetailModalAnalysisPanel({
  display,
  aiResult,
  analysisMethodLabel,
  isAiAnalyzing,
  layout,
  className,
  onAiAnalyze,
  onEditCompliance,
}: DetailModalAnalysisPanelProps) {
  const violationEvidence = getViolationEvidence(display?.complianceScores);
  const effectiveComplianceGrade = display ? getEffectiveComplianceGrade(display) : null;
  const effectiveViolationKeys = new Set(violationEvidence.map((item) => item.key));

  return (
    <div className={cn('space-y-5', className)}>
      {layout === 'combined' ? (
        <div className="flex items-center gap-2">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">분석 결과</p>
          {aiResult && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] text-purple-500 bg-purple-50 rounded-md font-medium">
              <Zap size={10} /> {analysisMethodLabel}
            </span>
          )}
          <button
            onClick={onAiAnalyze}
            disabled={isAiAnalyzing}
            className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-semibold hover:bg-indigo-100 disabled:opacity-50 transition-colors"
          >
            {isAiAnalyzing ? <Loader2 size={12} className="animate-spin" /> : <Eye size={12} />}
            재분석
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          <button
            onClick={onAiAnalyze}
            disabled={isAiAnalyzing}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {isAiAnalyzing ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}
            AI 분석
          </button>
          {aiResult && (
            <span className="inline-flex items-center gap-1 px-2.5 py-2.5 text-xs text-purple-500 bg-purple-50 rounded-xl font-medium">
              <Zap size={12} /> {analysisMethodLabel} 분석됨
            </span>
          )}
        </div>
      )}

      {display?.scores && (
        <div>
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2.5">점수 분석</p>
          <ScoreBreakdown scores={display.scores} />
        </div>
      )}

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

      {display?.recompose && (
        <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
          <RecomposeVariantPicker
            classification={display.recompose}
            loading={false}
            onSelect={(variantKey) => onEditCompliance(variantKey)}
            layout="detail"
          />
        </div>
      )}

      {display?.complianceScores && (
        <div>
          <div className="flex items-center gap-2 mb-2.5">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">가이드라인 준수</p>
            {effectiveComplianceGrade && (
              <span className={cn('inline-flex items-center px-2 py-0.5 rounded-lg text-[11px] font-bold text-white', COMPLIANCE_GRADE_BG[effectiveComplianceGrade] || 'bg-slate-400')}>
                {COMPLIANCE_GRADE_LABELS[effectiveComplianceGrade] || effectiveComplianceGrade}
                <span className="ml-1 opacity-80">({violationEvidence.length}건)</span>
              </span>
            )}
          </div>
          {effectiveComplianceGrade === 'FAIL' && (
            <div className="mb-2.5 space-y-1.5">
              {violationEvidence.length > 0 ? (
                violationEvidence.map((item) => {
                  const suggestion = display?.complianceScores?.editSuggestions?.[item.key];
                  return (
                    <div
                      key={item.key}
                      className="rounded-xl border border-red-100 bg-red-50 px-3.5 py-2.5 text-sm text-red-800"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">{item.label}</span>
                        {item.confidence != null && (
                          <span className="text-[11px] font-mono text-red-400">
                            {item.confidence}%
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-red-700/85">
                        {item.reason ?? 'AI가 이 항목을 위반으로 표시했지만 근거 문장을 반환하지 않았습니다. 재분석이 필요합니다.'}
                      </p>
                      {suggestion && (
                        <div className="mt-2 rounded-lg bg-white/80 border border-indigo-100 px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <Wand2 size={11} className="text-indigo-500 shrink-0" />
                            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">
                              개선 방향
                            </span>
                          </div>
                          <p className="mt-1 text-[11px] leading-relaxed text-slate-700">
                            {suggestion}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="rounded-xl border border-amber-100 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">
                  위반 근거가 없는 FAIL 결과입니다. 재분석이 필요합니다.
                </div>
              )}
            </div>
          )}
          {display.complianceGrade === 'FAIL' && effectiveComplianceGrade === 'WARN' && (
            <div className="mb-2.5 rounded-xl border border-amber-100 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">
              기존 분석은 위반으로 저장되어 있지만, 현재 근거가 부족합니다. 재분석하면 최신 배경 판정 로직으로 다시 확인됩니다.
            </div>
          )}
          {(() => {
            const passedEntries = Object.entries(display.complianceScores.violations)
              .filter(([key, violated]) => !(violated && effectiveViolationKeys.has(key)));
            if (passedEntries.length === 0) return null;
            return (
              <>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">통과 항목</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {passedEntries.map(([key]) => (
                    <div
                      key={key}
                      className="px-3 py-2 rounded-xl text-xs bg-slate-50 text-slate-500"
                    >
                      <div className="flex items-center gap-2">
                        <CheckCircle size={12} className="shrink-0 text-emerald-400" />
                        <span className="flex-1 truncate font-medium">{VIOLATION_LABELS[key] || key}</span>
                        {display.complianceScores!.confidence[key] !== undefined && (
                          <span className="text-[10px] font-mono shrink-0 text-slate-400">{display.complianceScores!.confidence[key]}%</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}
