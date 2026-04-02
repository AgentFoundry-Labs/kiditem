'use client';

import { Download } from 'lucide-react';

export default function AdsCollectPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-gray-400">
      <Download className="w-12 h-12 mb-4" />
      <h1 className="text-lg font-semibold text-gray-600">데이터 수집</h1>
      <p className="text-sm mt-1">쿠팡 광고센터 데이터 수집 관리</p>
    </div>
  );
}
