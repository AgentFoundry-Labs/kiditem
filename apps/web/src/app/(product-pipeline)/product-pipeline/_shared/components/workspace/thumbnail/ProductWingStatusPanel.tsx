'use client';

import { AlertTriangle, CheckCircle2, Clock, UploadCloud } from 'lucide-react';
import type { ProductWingStatus } from './thumbnail-workspace-state';

interface ProductWingStatusPanelProps {
  status: ProductWingStatus;
}

export default function ProductWingStatusPanel({ status }: ProductWingStatusPanelProps) {
  const Icon =
    status.kind === 'registered'
      ? CheckCircle2
      : status.kind === 'failed'
        ? AlertTriangle
        : status.kind === 'pending'
          ? Clock
          : UploadCloud;
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-bold text-slate-900">상품 썸네일 상태</h3>
      <div className="flex items-start gap-3 rounded-lg bg-slate-50 p-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-violet-600 shadow-sm">
          <Icon size={18} />
        </span>
        <div>
          <p className="text-sm font-black text-slate-900">{status.label}</p>
          {status.kind === 'failed' && status.error ? (
            <p className="mt-1 text-xs font-medium text-red-600">{status.error}</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
