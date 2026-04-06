'use client';

import { AlertTriangle } from 'lucide-react';

interface Props {
  total: number;
  warning: number;
  critical: number;
}

export default function UnshippedSummaryCards({ total, warning, critical }: Props) {
  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="card">
        <div className="card-label">전체</div>
        <div className="card-value">{total}</div>
      </div>
      <div className="bg-orange-50 rounded-xl p-4 border border-orange-200">
        <div className="card-label text-orange-600">주의 (1-2일)</div>
        <div className="card-value text-orange-600">{warning}</div>
      </div>
      <div className="bg-red-50 rounded-xl p-4 border border-red-200">
        <div className="flex items-center gap-1.5 text-sm text-red-600">
          <AlertTriangle size={14} /> 긴급 (3일+)
        </div>
        <div className="card-value text-red-600">{critical}</div>
      </div>
    </div>
  );
}
