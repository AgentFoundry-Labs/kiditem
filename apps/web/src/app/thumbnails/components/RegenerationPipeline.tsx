'use client';
import { ScanSearch, Zap, AlertTriangle, Wand2, CheckCircle, ChevronRight } from 'lucide-react';
import type { ThumbnailAnalysisResult, ThumbnailGenerationItem } from '@kiditem/shared';

interface PipelineStep {
  key: string;
  label: string;
  desc: string;
  color: string;
  bg: string;
  icon: React.ElementType;
  count: number;
  items: string[];
}

interface RegenerationPipelineProps {
  unclassifiedCount: number;
  analyzedCount: number;
  needsFixProducts: ThumbnailAnalysisResult[];
  activeGenerations: ThumbnailGenerationItem[];
  completedGenerations: ThumbnailGenerationItem[];
  onStepClick: (tab: string) => void;
}

export function RegenerationPipeline({
  unclassifiedCount,
  analyzedCount,
  needsFixProducts,
  activeGenerations,
  completedGenerations,
  onStepClick,
}: RegenerationPipelineProps) {
  const appliedCount = completedGenerations.filter((g) => g.status === 'applied').length;

  const steps: PipelineStep[] = [
    {
      key: 'unclassified',
      label: '미분류',
      desc: 'AI 스캔 대기',
      color: '#6b7280',
      bg: 'rgba(107,114,128,0.06)',
      icon: ScanSearch,
      count: unclassifiedCount,
      items: [],
    },
    {
      key: 'all',
      label: 'AI 분류',
      desc: 'Gemini Vision 완료',
      color: '#3182f6',
      bg: 'rgba(49,130,246,0.06)',
      icon: Zap,
      count: analyzedCount,
      items: [],
    },
    {
      key: 'needsfix',
      label: '개선 필요',
      desc: 'F·C등급 AI 편집 대상',
      color: '#f59e0b',
      bg: 'rgba(245,158,11,0.06)',
      icon: AlertTriangle,
      count: needsFixProducts.length,
      items: needsFixProducts.slice(0, 5).map((p) => p.productName),
    },
    {
      key: 'queue',
      label: 'AI 편집',
      desc: 'Gemini 이미지 편집',
      color: '#7048e8',
      bg: 'rgba(112,72,232,0.06)',
      icon: Wand2,
      count: activeGenerations.length,
      items: activeGenerations.slice(0, 5).map((g) => g.product.name),
    },
    {
      key: 'history',
      label: '이력',
      desc: '적용 완료',
      color: '#00c471',
      bg: 'rgba(0,196,113,0.06)',
      icon: CheckCircle,
      count: appliedCount,
      items: completedGenerations.filter((g) => g.status === 'applied').slice(0, 5).map((g) => g.product.name),
    },
  ];

  return (
    <div className="rounded-2xl px-5 py-4 bg-white shadow-md border border-slate-200">
      <div className="flex items-center gap-2 mb-4">
        <Wand2 size={14} className="text-purple-600" />
        <span className="text-sm font-bold uppercase tracking-wider text-purple-600">Thumbnail Pipeline</span>
      </div>

      <div className="flex items-stretch gap-0 w-full">
        {steps.map((step, i) => {
          const StepIcon = step.icon;
          const active = step.count > 0;
          return (
            <div key={step.key} className="flex items-stretch flex-1 min-w-0">
              <button
                onClick={() => onStepClick(step.key)}
                className="flex-1 flex flex-col items-center gap-1 py-3 px-1.5 rounded-xl transition-all hover:opacity-80 text-left"
                style={{
                  background: active ? step.bg : 'transparent',
                  border: active ? `1px solid ${step.color}22` : '1px solid transparent',
                }}
              >
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center transition-all"
                  style={{
                    background: step.color,
                    opacity: active ? 1 : 0.18,
                    boxShadow: active ? `0 4px 12px ${step.color}40` : 'none',
                  }}
                >
                  <StepIcon size={15} className="text-white" />
                </div>
                <span
                  className="text-2xl font-black tabular-nums leading-none mt-1"
                  style={{ color: active ? step.color : '#d1d5db' }}
                >
                  {step.count}
                </span>
                <span
                  className="text-[11px] font-bold leading-tight text-center"
                  style={{ color: active ? step.color : '#9ca3af' }}
                >
                  {step.label}
                </span>
                <span className="text-[10px] leading-tight text-center hidden md:block text-slate-400">
                  {step.desc}
                </span>

                {step.items.length > 0 && (
                  <div className="mt-1.5 w-full space-y-0.5">
                    {step.items.map((name, idx) => (
                      <div
                        key={idx}
                        className="text-[10px] truncate text-center rounded px-1"
                        style={{ color: step.color, background: `${step.color}10` }}
                        title={name}
                      >
                        {name}
                      </div>
                    ))}
                    {step.count > 5 && (
                      <div className="text-[10px] text-center text-slate-400">+{step.count - 5}개 더</div>
                    )}
                  </div>
                )}
              </button>

              {i < 4 && (
                <div className="flex items-center px-0.5 flex-shrink-0">
                  <ChevronRight size={10} className="text-slate-300" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
