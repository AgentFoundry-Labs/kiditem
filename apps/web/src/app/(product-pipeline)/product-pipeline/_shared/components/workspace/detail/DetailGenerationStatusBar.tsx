'use client';

import { AlertCircle, Clock } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';
import type { DetailGenerationRow } from './detail-generation-rows';

interface DetailGenerationStatusBarProps {
  rows: DetailGenerationRow[];
}

export default function DetailGenerationStatusBar({ rows }: DetailGenerationStatusBarProps) {
  if (rows.length === 0) return null;
  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50 p-3">
      <h3 className="mb-2 text-sm font-black text-slate-900">상세페이지 생성 상태</h3>
      <div className="flex flex-wrap gap-2">
        {rows.map((row) => {
          const failed = row.status.toUpperCase() === 'FAILED';
          const Icon = failed ? AlertCircle : Clock;
          return (
            <div key={row.key} className="flex min-w-[220px] flex-1 items-start gap-2 rounded-lg bg-white p-3">
              <Icon size={16} className={failed ? 'mt-0.5 text-red-500' : 'mt-0.5 text-amber-600'} />
              <div>
                <p className="text-sm font-bold text-slate-900">{row.title}</p>
                <p className="text-xs font-medium text-slate-500">
                  {row.status} · {formatDateTime(row.createdAt)}
                </p>
                {row.errorMessage ? (
                  <p className="mt-1 text-xs font-semibold text-red-600">{row.errorMessage}</p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
