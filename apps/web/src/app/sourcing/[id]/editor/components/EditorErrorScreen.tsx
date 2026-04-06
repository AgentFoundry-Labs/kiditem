'use client';

import { AlertCircle } from 'lucide-react';

interface Props {
  error: string | null;
  onRetry: () => void;
  onClose: () => void;
}

export default function EditorErrorScreen({ error, onRetry, onClose }: Props) {
  return (
    <div className="flex items-center justify-center h-screen bg-[#F5F7F8]">
      <div className="flex flex-col items-center gap-3 text-slate-500">
        <AlertCircle size={32} className="text-red-400" />
        <p className="text-sm font-medium">{error ?? '상세페이지 데이터가 없습니다.'}</p>
        <div className="flex gap-2 mt-2">
          <button
            onClick={onRetry}
            className="px-4 py-2 bg-emerald-500 text-white text-sm font-bold rounded-lg hover:bg-emerald-600 transition-colors"
          >
            다시 시도
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white text-slate-600 text-sm font-bold rounded-lg border border-slate-300 hover:bg-slate-50 transition-colors"
          >
            돌아가기
          </button>
        </div>
      </div>
    </div>
  );
}
