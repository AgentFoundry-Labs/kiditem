'use client';
import { Clock, Loader2, Eye, ExternalLink, CheckCircle, ChevronRight, SkipForward, Wand2 } from 'lucide-react';
import type { ThumbnailAnalysisResult, ThumbnailGenerationItem } from '@kiditem/shared';

interface RegenerationPipelineProps {
  pendingProducts: ThumbnailAnalysisResult[];
  activeGenerations: ThumbnailGenerationItem[];
  completedGenerations: ThumbnailGenerationItem[];
}

export function RegenerationPipeline({ pendingProducts, activeGenerations, completedGenerations }: RegenerationPipelineProps) {
  const fPending = pendingProducts.filter((p) => p.complianceGrade === 'FAIL' || p.grade === 'F');
  const totalPipeline = fPending.length + activeGenerations.length + completedGenerations.length;
  const donePipeline = completedGenerations.filter((g) => g.status === 'applied').length;
  const pipelinePct = totalPipeline > 0 ? Math.round((donePipeline / totalPipeline) * 100) : 0;

  const steps = [
    { label: '재생성 대기', desc: '가이드라인 위반 + F등급', count: fPending.length, color: '#dc2626', bg: 'rgba(220,38,38,0.06)', icon: Clock },
    { label: 'AI 생성 중', desc: 'Gemini 이미지 생성', count: activeGenerations.filter((g) => g.status === 'generating').length, color: '#2563eb', bg: 'rgba(37,99,235,0.06)', icon: Loader2 },
    { label: '후보 선택', desc: '3장 중 1장 선택', count: activeGenerations.filter((g) => g.status === 'ready' && !g.selectedUrl).length, color: '#d97706', bg: 'rgba(217,119,6,0.06)', icon: Eye },
    { label: '쿠팡 적용', desc: 'Wing 이미지 교체', count: activeGenerations.filter((g) => g.status === 'ready' && !!g.selectedUrl).length, color: '#7c3aed', bg: 'rgba(124,58,237,0.06)', icon: ExternalLink },
    { label: '적용 완료', desc: '교체 완료', count: donePipeline, color: '#059669', bg: 'rgba(5,150,105,0.06)', icon: CheckCircle },
  ];

  const skippedCount = completedGenerations.filter((g) => g.status === 'skipped').length;

  return (
    <div className="lg:col-span-3 flex flex-col rounded-2xl px-5 py-4 bg-white shadow-md border border-slate-200">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Wand2 size={14} className="text-purple-600" />
          <span className="text-sm font-bold uppercase tracking-wider text-purple-600">AI Regeneration Pipeline</span>
        </div>
        <span className="text-[13px] font-mono text-slate-400">Gemini Imagen</span>
      </div>

      <div className="flex-1 flex flex-col justify-center">
        {totalPipeline > 0 && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[13px] font-semibold text-slate-600">전체 진행률</span>
              <span className="text-[13px] font-bold tabular-nums text-purple-600">{donePipeline} / {totalPipeline} ({pipelinePct}%)</span>
            </div>
            <div className="h-2 rounded-full overflow-hidden bg-purple-100">
              <div className="h-full rounded-full transition-all duration-500 bg-gradient-to-r from-purple-600 to-blue-600" style={{ width: `${pipelinePct}%` }} />
            </div>
          </div>
        )}

        <div className="flex items-stretch gap-0 w-full">
          {steps.map((step, i) => {
            const StepIcon = step.icon;
            const active = step.count > 0;
            return (
              <div key={i} className="flex items-stretch flex-1 min-w-0">
                <div
                  className="flex-1 flex flex-col items-center gap-1 py-3 px-1.5 rounded-xl transition-all"
                  style={{
                    background: active ? step.bg : 'transparent',
                    border: active ? `1px solid ${step.color}22` : '1px solid transparent',
                  }}
                >
                  <div className="relative">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center transition-all"
                      style={{ background: step.color, opacity: active ? 1 : 0.15, boxShadow: active ? `0 4px 12px ${step.color}40` : 'none' }}
                    >
                      <StepIcon size={16} className={`text-white ${step.label === 'AI 생성 중' && active ? 'animate-spin' : ''}`} />
                    </div>
                    <div
                      className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[8px] font-black flex items-center justify-center"
                      style={{ background: active ? step.color : '#e5e7eb', color: active ? '#fff' : '#9ca3af' }}
                    >
                      {i + 1}
                    </div>
                  </div>
                  <span className="text-xl font-black tabular-nums leading-none mt-1" style={{ color: active ? step.color : '#d1d5db' }}>{step.count}</span>
                  <span className="text-[12px] font-bold leading-tight text-center" style={{ color: active ? step.color : '#9ca3af' }}>{step.label}</span>
                  <span className="text-[11px] leading-tight text-center hidden md:block text-slate-400">{step.desc}</span>
                </div>
                {i < 4 && (
                  <div className="flex items-center px-0.5 flex-shrink-0">
                    <ChevronRight size={10} className="text-slate-300" />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {skippedCount > 0 && (
          <div className="mt-3 pt-3 flex items-center gap-2 border-t border-slate-200">
            <SkipForward size={12} className="text-slate-400" />
            <span className="text-[13px] text-slate-400">건너뜀 {skippedCount}개</span>
          </div>
        )}
      </div>
    </div>
  );
}
