'use client';
import { Users, Package } from 'lucide-react';

export interface FaultSplit {
  customer: number;
  vendor: number;
}

interface Props {
  faultSplit: FaultSplit;
}

export function ReturnFaultSplit({ faultSplit }: Props) {
  const total = faultSplit.customer + faultSplit.vendor;
  const customerPct = total > 0 ? Math.round((faultSplit.customer / total) * 100) : 0;
  const vendorPct = total > 0 ? 100 - customerPct : 0;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h3 className="text-base font-semibold text-gray-900 mb-4">귀책 구분</h3>
      <div className="space-y-4">
        <div className="flex h-8 rounded-lg overflow-hidden">
          {customerPct > 0 && (
            <div
              className="bg-blue-500 flex items-center justify-center text-white text-xs font-semibold"
              style={{ width: `${customerPct}%` }}
            >
              {customerPct}%
            </div>
          )}
          {vendorPct > 0 && (
            <div
              className="bg-red-500 flex items-center justify-center text-white text-xs font-semibold"
              style={{ width: `${vendorPct}%` }}
            >
              {vendorPct}%
            </div>
          )}
        </div>
        <div className="flex gap-6">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-500" />
            <span className="text-sm text-gray-700">고객 귀책</span>
            <span className="text-sm font-semibold text-gray-900">
              {faultSplit.customer}건 ({customerPct}%)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-red-500" />
            <span className="text-sm text-gray-700">판매자 귀책</span>
            <span className="text-sm font-semibold text-gray-900">
              {faultSplit.vendor}건 ({vendorPct}%)
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
