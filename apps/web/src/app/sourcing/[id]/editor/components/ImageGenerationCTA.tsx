'use client';

import { Loader2, Sparkles } from 'lucide-react';

interface ImageGenerationCTAProps {
  isGenerating: boolean;
  onConfirm: () => void;
  disabled?: boolean;
}

export function ImageGenerationCTA({ isGenerating, onConfirm, disabled }: ImageGenerationCTAProps) {
  if (isGenerating) {
    return (
      <div className="space-y-1">
        <button
          type="button"
          disabled
          className="w-full py-3 px-4 bg-gray-400 cursor-not-allowed text-white font-bold text-sm rounded-lg flex items-center justify-center gap-2"
        >
          <Loader2 size={16} className="animate-spin" />
          이미지 생성 중...
        </button>
        <p className="text-xs text-gray-400 text-center">3초마다 상태를 확인합니다...</p>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onConfirm}
      disabled={disabled}
      className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
    >
      <Sparkles size={16} />
      이미지 생성 확정
    </button>
  );
}
