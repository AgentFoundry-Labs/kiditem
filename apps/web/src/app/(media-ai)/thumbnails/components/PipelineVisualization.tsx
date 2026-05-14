import {
  AlertTriangle,
  ArrowRight,
  CheckCircle,
  Scan,
  Wand2,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { ThumbnailAnalysisResult, ThumbnailGenerationItem } from '@kiditem/shared/ai';
import { isReady } from '../../_shared/lib/thumbnail-status';

export type PipelineTab = 'unclassified' | 'all' | 'needsfix' | 'ai-edit' | 'history';

interface PipelineVisualizationProps {
  unclassifiedCount: number;
  analyzedCount: number;
  needsFixCount: number;
  appliedCount: number;
  validActiveGenerationCount: number;
  unclassifiedSample: Array<{ productName: string }>;
  recentClassified: ThumbnailAnalysisResult[];
  needsFixSample: ThumbnailAnalysisResult[];
  inGeneration: ThumbnailGenerationItem[];
  recentApplied: ThumbnailGenerationItem[];
  activeTab: PipelineTab;
  onSelectStep: (tab: PipelineTab, grade?: string) => void;
}

interface PipelineStep {
  label: string;
  count: number;
  color: string;
  icon: LucideIcon;
  tab: PipelineTab;
  grade?: string;
  desc: string;
  tasks: Array<{ name: string; status: string }>;
  emptyText: string;
}

export function PipelineVisualization({
  unclassifiedCount,
  analyzedCount,
  needsFixCount,
  appliedCount,
  validActiveGenerationCount,
  unclassifiedSample,
  recentClassified,
  needsFixSample,
  inGeneration,
  recentApplied,
  activeTab,
  onSelectStep,
}: PipelineVisualizationProps) {
  const steps: PipelineStep[] = [
    {
      label: '미분류',
      count: unclassifiedCount,
      color: '#8b95a1',
      icon: Scan,
      tab: 'unclassified',
      desc: 'AI 스캔 대기',
      tasks: unclassifiedSample.map((p) => ({ name: p.productName, status: '대기' })),
      emptyText: '대기 없음',
    },
    {
      label: 'AI 분류',
      count: analyzedCount,
      color: '#3182f6',
      icon: Zap,
      tab: 'all',
      desc: '분류 완료',
      tasks: recentClassified.map((p) => ({ name: p.productName, status: `${p.grade}등급` })),
      emptyText: '분석 대기',
    },
    {
      label: '개선 필요',
      count: needsFixCount,
      color: '#f59e0b',
      icon: AlertTriangle,
      tab: 'needsfix',
      grade: 'critical',
      desc: 'F·C등급 상품',
      tasks: needsFixSample.map((p) => ({
        name: p.productName,
        status:
          p.grade === 'F'
            ? '긴급'
            : p.complianceGrade === 'FAIL'
              ? 'FAIL'
              : p.grade === 'C'
                ? '주의'
                : p.complianceGrade === 'WARN'
                  ? 'WARN'
                  : 'B등급',
      })),
      emptyText: '이슈 없음',
    },
    {
      label: 'AI 편집',
      count: validActiveGenerationCount,
      color: '#7048e8',
      icon: Wand2,
      tab: 'ai-edit',
      desc: '가이드라인 수정 · 품질 개선',
      tasks: inGeneration.map((g) => ({
        name: g.product?.name ?? '상품 정보 없음',
        status: g.status === 'running' ? '생성 중' : isReady(g) ? '준비됨' : '대기',
      })),
      emptyText: '생성 작업 없음',
    },
    {
      label: '적용 완료',
      count: appliedCount,
      color: '#00c471',
      icon: CheckCircle,
      tab: 'history',
      desc: '쿠팡 반영됨',
      tasks: recentApplied.map((g) => ({ name: g.product?.name ?? '상품 정보 없음', status: '완료' })),
      emptyText: '최근 적용 없음',
    },
  ];

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: 'var(--thumb-card-bg)',
        boxShadow: 'var(--thumb-shadow-md)',
        border: '1px solid var(--thumb-border-subtle)',
      }}
    >
      <div className="grid grid-cols-5 gap-0">
        {steps.map((step, idx) => {
          const isActive = step.tab === activeTab;
          return (
            <button
              key={step.label}
              onClick={() => onSelectStep(step.tab, step.grade)}
              className="relative flex flex-col items-center pt-5 pb-3 px-2 transition-all hover:bg-black/[0.02] group"
              style={isActive ? { background: `${step.color}08` } : {}}
            >
              {idx > 0 && (
                <div className="absolute left-0 top-[44px] -translate-x-1/2 w-5 flex items-center">
                  <div className="w-full h-[1.5px]" style={{ background: 'var(--border)' }} />
                  <ArrowRight
                    size={12}
                    className="absolute -right-1"
                    style={{ color: 'var(--thumb-text-disabled)' }}
                  />
                </div>
              )}
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center mb-2 transition-transform group-hover:scale-110"
                style={{
                  background: `${step.color}12`,
                  border: isActive ? `2.5px solid ${step.color}` : `1.5px solid ${step.color}30`,
                }}
              >
                <step.icon size={22} style={{ color: step.color }} />
              </div>
              <span
                className="text-[32px] font-black tabular-nums leading-none mt-1"
                style={{ color: step.count > 0 ? step.color : 'var(--thumb-text-disabled)' }}
              >
                {step.count}
              </span>
              <span className="text-[14px] font-bold mt-1.5" style={{ color: 'var(--thumb-text-primary)' }}>
                {step.label}
              </span>
              <span className="text-[11px] mt-0.5" style={{ color: 'var(--thumb-text-quaternary)' }}>
                {step.desc}
              </span>
              {isActive && (
                <div
                  className="absolute bottom-0 left-3 right-3 h-[3px] rounded-full"
                  style={{ background: step.color }}
                />
              )}
            </button>
          );
        })}
      </div>

      <div
        className="grid grid-cols-5 gap-0 border-t"
        style={{ borderColor: 'var(--thumb-border-subtle)' }}
      >
        {steps.map((step) => (
          <div
            key={step.label}
            className="px-4 py-3.5 border-l first:border-l-0"
            style={{ borderColor: 'var(--thumb-border-subtle)', minHeight: 220 }}
          >
            {step.tasks.length === 0 ? (
              <div
                className="h-full flex items-center justify-center text-[12px]"
                style={{ color: 'var(--thumb-text-quaternary)' }}
              >
                {step.emptyText}
              </div>
            ) : (
              <ul className="space-y-1.5">
                {step.tasks.map((t, ti) => (
                  <li key={ti} className="flex items-center gap-2">
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: step.color }}
                    />
                    <span
                      className="text-[12px] font-medium truncate flex-1"
                      style={{ color: 'var(--thumb-text-secondary)' }}
                    >
                      {t.name}
                    </span>
                    <span
                      className="text-[10px] font-bold shrink-0 px-1.5 py-0.5 rounded"
                      style={{ background: `${step.color}12`, color: step.color }}
                    >
                      {t.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
