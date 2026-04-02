'use client';

import { BarChart3 } from 'lucide-react';

export default function AdsCampaignsPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-gray-400">
      <BarChart3 className="w-12 h-12 mb-4" />
      <h1 className="text-lg font-semibold text-gray-600">캠페인 분석</h1>
      <p className="text-sm mt-1">캠페인별 성과 분석 · 상품 드릴다운</p>
    </div>
  );
}
