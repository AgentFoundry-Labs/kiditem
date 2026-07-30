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
  emoji: string;
  tone: 'slate' | 'amber' | 'purple' | 'sky' | 'emerald';
}> = [
  { key: 'todayOrders', label: '오늘 주문', emoji: '📦', tone: 'slate' },
  { key: 'waiting', label: '셀피아 전송 대기', emoji: '⏳', tone: 'amber' },
  { key: 'transmissionRequested', label: '셀피아 전송 요청', emoji: '📤', tone: 'purple' },
  { key: 'trackingSent', label: '셀피아 송장 전송', emoji: '🚚', tone: 'sky' },
  { key: 'done', label: '완료', emoji: '✅', tone: 'emerald' },
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
            emoji={stage.emoji}
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
  emoji,
  label,
  value,
  tone,
}: {
  emoji: string;
  label: string;
  value: number;
  tone: 'slate' | 'amber' | 'purple' | 'sky' | 'emerald';
}) {
  const isEmpty = value === 0;
  return (
    <div
      className={cn(
        'flex min-w-[150px] flex-1 items-center gap-2.5 rounded-xl border px-3.5 py-3',
        tone === 'slate' && 'border-slate-200 bg-white',
        tone === 'amber' && 'border-amber-100 bg-amber-50/60',
        tone === 'purple' && 'border-purple-100 bg-purple-50/60',
        tone === 'sky' && 'border-sky-100 bg-sky-50/60',
        tone === 'emerald' && 'border-emerald-100 bg-emerald-50/60',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'flex h-9 w-9 flex-none items-center justify-center rounded-lg text-base leading-none',
          tone === 'slate' && 'bg-slate-100',
          tone === 'amber' && 'bg-amber-100/70',
          tone === 'purple' && 'bg-purple-100/70',
          tone === 'sky' && 'bg-sky-100/70',
          tone === 'emerald' && 'bg-emerald-100/70',
        )}
      >
        {emoji}
      </span>
      <div className="min-w-0">
        <div className="truncate text-[11px] font-medium text-slate-500">{label}</div>
        <div
          className={cn(
            'text-xl font-bold leading-tight tabular-nums',
            isEmpty && 'text-slate-300',
            !isEmpty && tone === 'slate' && 'text-slate-900',
            !isEmpty && tone === 'amber' && 'text-amber-700',
            !isEmpty && tone === 'purple' && 'text-purple-700',
            !isEmpty && tone === 'sky' && 'text-sky-700',
            !isEmpty && tone === 'emerald' && 'text-emerald-700',
          )}
        >
          {formatNumber(value)}
        </div>
      </div>
    </div>
  );
}
