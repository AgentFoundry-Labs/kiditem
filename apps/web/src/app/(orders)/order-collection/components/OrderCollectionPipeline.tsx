import { ChevronRight } from 'lucide-react';
import { cn, formatNumber } from '@/lib/utils';

export interface OrderCollectionPipelineSummary {
  todayOrders: number;
  waiting: number;
  transmissionRequested: number;
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
  { key: 'transmissionRequested', label: '셀피아 전송 요청됨', tone: 'purple' },
  { key: 'trackingSent', label: '셀피아 송장 전송', tone: 'sky' },
  { key: 'done', label: '완료', tone: 'emerald' },
];

export function OrderCollectionPipeline({
  summary,
}: {
  summary: OrderCollectionPipelineSummary;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-stretch gap-1.5 overflow-x-auto pb-1">
        {STAGES.map((stage, index) => (
          <div key={stage.key} className="contents">
            {index > 0 ? (
              <ChevronRight size={18} className="flex-none self-center text-slate-300" />
            ) : null}
            <PipelineStage label={stage.label} value={summary[stage.key]} tone={stage.tone} />
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-500">
        전송 요청은 셀피아 접수 완료를 의미하지 않습니다. 다음 자동 셀피아 재고 최신화가 실제
        재고 반영을 검증합니다.
      </p>
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
  return (
    <div
      className={cn(
        'min-w-[150px] flex-1 rounded-xl border px-4 py-3',
        tone === 'slate' && 'border-slate-200 bg-white',
        tone === 'amber' && 'border-amber-100 bg-amber-50/60',
        tone === 'purple' && 'border-purple-100 bg-purple-50/60',
        tone === 'sky' && 'border-sky-100 bg-sky-50/60',
        tone === 'emerald' && 'border-emerald-100 bg-emerald-50/60',
      )}
    >
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums text-slate-900">
        {formatNumber(value)}
      </div>
    </div>
  );
}
