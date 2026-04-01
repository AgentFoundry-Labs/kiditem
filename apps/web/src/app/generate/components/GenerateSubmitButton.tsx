'use client';
import { Loader2, Sparkles } from 'lucide-react';

interface Props {
  isLoading: boolean;
  isFormValid: boolean;
  onSubmit: () => void;
}

export default function GenerateSubmitButton({ isLoading, isFormValid, onSubmit }: Props) {
  return (
    <div className="pt-4 pb-12 flex flex-col gap-4 items-center max-w-md mx-auto">
      <button
        onClick={onSubmit}
        disabled={isLoading || !isFormValid}
        className={`w-full py-5 rounded-2xl font-black text-xl transition-all flex items-center justify-center gap-3 ${
          isLoading
            ? 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed'
            : !isFormValid
              ? 'bg-gray-800 text-gray-400 cursor-not-allowed opacity-50'
              : 'bg-gray-900 text-white hover:bg-gray-800 shadow-xl shadow-gray-200 active:scale-[0.98]'
        }`}
      >
        {isLoading ? (
          <>
            <Loader2 size={24} className="animate-spin" />
            AI 분석 및 디자인 중...
          </>
        ) : (
          <>
            <Sparkles size={24} className={isFormValid ? 'text-blue-400' : ''} />
            AI 상세페이지 자동 생성
          </>
        )}
      </button>
    </div>
  );
}
