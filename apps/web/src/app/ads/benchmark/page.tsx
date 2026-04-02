'use client';

import { BarChart3 } from 'lucide-react';

export default function AdsBenchmarkPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-gray-400">
      <BarChart3 className="w-12 h-12 mb-4" />
      <h1 className="text-lg font-semibold text-gray-600">업계 평균 대비 진단</h1>
      <p className="text-sm mt-1">쿠팡 셀러 업계 평균과 비교한 내 광고 효율</p>
    </div>
  );
}
