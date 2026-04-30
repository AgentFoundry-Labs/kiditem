'use client';

import { AlertTriangle } from 'lucide-react';

export default function DeadStock() {
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 p-8">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-800">
              악성재고 분석은 준비 중입니다
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              악성재고 판정은 판매속도 / 최종판매일 지표 연결 후 제공됩니다.
              현재 재고 상태(<code className="px-1 rounded bg-slate-100 text-slate-700">healthy</code>
              {' / '}
              <code className="px-1 rounded bg-slate-100 text-slate-700">low</code>
              {' / '}
              <code className="px-1 rounded bg-slate-100 text-slate-700">out</code>)
              만으로는 악성재고를 판정하지 않습니다.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
