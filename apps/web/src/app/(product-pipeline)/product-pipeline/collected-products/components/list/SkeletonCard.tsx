'use client';

export default function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl overflow-hidden shadow-sm border border-slate-100 animate-pulse">
      <div className="aspect-square bg-slate-200" />
      <div className="p-2.5 bg-slate-50 space-y-2">
        <div className="h-3 bg-slate-200 rounded w-3/4" />
        <div className="h-2 bg-slate-100 rounded w-1/2" />
        <div className="h-2 bg-slate-100 rounded w-2/3" />
      </div>
    </div>
  );
}
