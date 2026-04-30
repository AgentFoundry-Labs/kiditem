'use client';

export default function OrgLegend() {
  return (
    <div className="mt-4 flex items-center gap-4 text-[11px] text-slate-500">
      <div className="flex items-center gap-1.5">
        <span className="inline-flex h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
        <span>실행 중</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="inline-flex h-2 w-2 rounded-full bg-green-400" />
        <span>활성</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="inline-flex h-2 w-2 rounded-full bg-slate-400" />
        <span>유휴</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="inline-flex h-2 w-2 rounded-full bg-orange-400" />
        <span>일시정지</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="inline-flex h-2 w-2 rounded-full bg-red-400" />
        <span>오류</span>
      </div>
    </div>
  );
}
