'use client';

interface ProductPipelineStatsProps {
  draftCount: number;
  totalCount: number;
  draftLabel?: string;
  totalLabel?: string;
}

export function ProductPipelineStats({
  draftCount,
  totalCount,
  draftLabel = '등록 대기',
  totalLabel = '전체',
}: ProductPipelineStatsProps) {
  return (
    <div className="flex items-center gap-6 px-5 h-11 border-b border-slate-200 text-xs">
      <div className="flex items-baseline gap-1.5">
        <span className="text-slate-500">{draftLabel}</span>
        <span className="font-bold text-slate-900 text-sm tabular-nums">{draftCount}</span>
        <span className="text-slate-400">개</span>
      </div>
      <div className="w-px h-3 bg-slate-200" />
      <div className="flex items-baseline gap-1.5">
        <span className="text-slate-500">{totalLabel}</span>
        <span className="font-bold text-slate-900 text-sm tabular-nums">{totalCount}</span>
        <span className="text-slate-400">개</span>
      </div>
    </div>
  );
}
