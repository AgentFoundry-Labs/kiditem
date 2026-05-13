'use client';

interface Props {
  draftCount: number;
  totalCount: number;
}

export default function SourcingStats({ draftCount, totalCount }: Props) {
  return (
    <div className="flex items-center gap-6 px-5 h-11 border-b border-slate-200 text-xs">
      <div className="flex items-baseline gap-1.5">
        <span className="text-slate-500">승격 대기</span>
        <span className="font-bold text-slate-900 text-sm tabular-nums">{draftCount}</span>
        <span className="text-slate-400">개</span>
      </div>
      <div className="w-px h-3 bg-slate-200" />
      <div className="flex items-baseline gap-1.5">
        <span className="text-slate-500">전체</span>
        <span className="font-bold text-slate-900 text-sm tabular-nums">{totalCount}</span>
        <span className="text-slate-400">개</span>
      </div>
    </div>
  );
}
