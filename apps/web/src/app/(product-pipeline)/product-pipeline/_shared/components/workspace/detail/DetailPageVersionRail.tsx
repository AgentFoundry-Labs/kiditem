'use client';

import { CheckCircle2, Loader2, Trash2 } from 'lucide-react';
import { cn, formatDateTime } from '@/lib/utils';
import type { DetailGenerationRow } from './detail-generation-rows';

interface DetailPageVersionRailProps {
  rows: DetailGenerationRow[];
  selectedKey: string | null;
  applyingKey: string | null;
  onSelect: (key: string) => void;
  onApply: (row: DetailGenerationRow) => void;
  onDelete: (row: DetailGenerationRow) => void;
}

export default function DetailPageVersionRail({
  rows,
  selectedKey,
  applyingKey,
  onSelect,
  onApply,
  onDelete,
}: DetailPageVersionRailProps) {
  return (
    <aside className="w-[300px] shrink-0 rounded-lg border border-slate-200 bg-white p-3">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-black text-slate-900">상세페이지 버전</h3>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">
          {rows.length}
        </span>
      </div>
      {rows.length === 0 ? (
        <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-slate-200 text-center text-xs font-semibold text-slate-400">
          완성된 상세페이지가 없습니다
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => {
            const selected = selectedKey === row.key;
            const applying = applyingKey === row.key;
            return (
              <div
                key={row.key}
                className={cn(
                  'rounded-lg border p-3 transition',
                  selected ? 'border-violet-400 bg-violet-50' : 'border-slate-200 bg-white',
                )}
              >
                <button
                  type="button"
                  onClick={() => onSelect(row.key)}
                  className="w-full text-left"
                >
                  <span className="flex items-start justify-between gap-2">
                    <span>
                      <span className="block text-sm font-black text-slate-900">{row.title}</span>
                      <span className="mt-1 block text-[11px] font-semibold text-slate-500">
                        {row.templateLabel} · {formatDateTime(row.createdAt)}
                      </span>
                    </span>
                    {row.isRegistrationDetail ? (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                        <CheckCircle2 size={10} />
                        등록 상세
                      </span>
                    ) : null}
                  </span>
                </button>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => onApply(row)}
                    disabled={applying}
                    className="inline-flex h-8 items-center rounded-md bg-slate-900 px-3 text-[11px] font-bold text-white disabled:cursor-wait disabled:opacity-70"
                  >
                    {applying ? <Loader2 size={12} className="mr-1 animate-spin" /> : null}
                    {applying ? '적용 중' : '등록 상세로 적용'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(row)}
                    className="inline-flex h-8 items-center rounded-md border border-slate-200 px-2 text-slate-500 hover:bg-slate-50"
                    aria-label="삭제"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
}
