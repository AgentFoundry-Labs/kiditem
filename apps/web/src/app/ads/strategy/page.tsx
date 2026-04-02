'use client';

import { Target } from 'lucide-react';

export default function AdsStrategyPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-gray-400">
      <Target className="w-12 h-12 mb-4" />
      <h1 className="text-lg font-semibold text-gray-600">광고 전략 AI</h1>
      <p className="text-sm mt-1">실시간 데이터 기반 ABC 등급 분석 · 자동 전략 제안</p>
    </div>
  );
}
