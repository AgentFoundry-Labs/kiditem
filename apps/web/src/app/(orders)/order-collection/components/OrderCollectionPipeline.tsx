import { ChevronRight } from 'lucide-react';
import { cn, formatNumber } from '@/lib/utils';

export interface OrderCollectionPipelineSummary {
  todayOrders: number;
  waiting: number;
  transmissionRequested: number;
  inventoryPending: number;
  trackingSent: number;
  done: number;
}

const STAGES: Array<{
  key: keyof OrderCollectionPipelineSummary;
  label: string;
  tone: 'slate' | 'amber' | 'purple' | 'sky' | 'emerald';
}> = [
  { key: 'todayOrders', label: '오늘 주문', tone: 'slate' },
  { key: 'waiting', label: '셀피아 전송 대기', tone: 'amber' },
  { key: 'transmissionRequested', label: '셀피아 전송 요청', tone: 'purple' },
  { key: 'trackingSent', label: '셀피아 송장 전송', tone: 'sky' },
  { key: 'done', label: '완료', tone: 'emerald' },
];

export function OrderCollectionPipeline({
  summary,
}: {
  summary: OrderCollectionPipelineSummary;
}) {
  return (
    <div className="flex items-stretch gap-1.5 overflow-x-auto pb-1">
      {STAGES.map((stage, index) => (
        <div key={stage.key} className="contents">
          {index > 0 ? (
            <ChevronRight size={18} className="flex-none self-center text-slate-300" />
          ) : null}
          <PipelineStage
            label={stage.label}
            value={summary[stage.key]}
            tone={stage.tone}
          />
        </div>
      ))}
    </div>
  );
}

function PipelineStage({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'slate' | 'amber' | 'purple' | 'sky' | 'emerald';
}) {
  const isEmpty = value === 0;
  return (
    <div
      className={cn(
        'flex min-w-[150px] flex-1 flex-col justify-between rounded-xl border px-4 py-5',
        tone === 'slate' && 'border-slate-200 bg-white',
        tone === 'amber' && 'border-amber-100 bg-amber-50/60',
        tone === 'purple' && 'border-purple-100 bg-purple-50/60',
        tone === 'sky' && 'border-sky-100 bg-sky-50/60',
        tone === 'emerald' && 'border-emerald-100 bg-emerald-50/60',
      )}
    >
      <div className="truncate text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-3 flex items-baseline gap-1">
        <span
          className={cn(
            'text-3xl font-bold leading-none tabular-nums',
            isEmpty && 'text-slate-300',
            !isEmpty && tone === 'slate' && 'text-slate-900',
            !isEmpty && tone === 'amber' && 'text-amber-700',
            !isEmpty && tone === 'purple' && 'text-purple-700',
            !isEmpty && tone === 'sky' && 'text-sky-700',
            !isEmpty && tone === 'emerald' && 'text-emerald-700',
          )}
        >
          {formatNumber(value)}
        </span>
        <span className={cn('text-sm font-medium', isEmpty ? 'text-slate-300' : 'text-slate-400')}>
          건
        </span>
      </div>
    </div>
  );
}
