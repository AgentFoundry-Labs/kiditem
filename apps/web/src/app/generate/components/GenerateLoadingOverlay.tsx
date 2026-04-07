'use client';

import { Sparkles } from 'lucide-react';

export default function GenerateLoadingOverlay() {
  return (
    <div className="fixed inset-0 bg-white/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center">
      <div className="w-12 h-12 border-3 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
      <p className="text-purple-600 font-black text-xl mb-3 flex items-center gap-2">
        <Sparkles size={24} />
        AI OCR 텍스트 번역 및 이미지 재생성 중...
      </p>
      <p className="text-slate-500 text-sm">
        중국어 등 외국어를 스캔하여 지우고 한국어로 재생성하고 있습니다.
      </p>
      <p className="text-slate-400 text-sm mt-1">
        이 작업은 약 20~40초가 소요될 수 있습니다.
      </p>
    </div>
  );
}
