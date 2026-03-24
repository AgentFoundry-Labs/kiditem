'use client';

import { ArrowLeft, Check, ChevronDown, Loader2, Lock, RefreshCw } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

type GenerationMode = 'template' | 'oneshot';

interface ProductEditHeaderProps {
  productName: string;
  productId: string;
  isEditComplete: boolean;
  isLocked: boolean;
  isReprocessing: boolean;
  onToggleEditComplete: () => void;
  onToggleLocked: () => void;
  onReprocess: (mode: GenerationMode) => void;
  onBack: () => void;
}

const MODE_LABELS: Record<GenerationMode, string> = {
  template: '템플릿',
  oneshot: '원샷 (AI 이미지)',
};

export default function ProductEditHeader({
  productName,
  productId,
  isEditComplete,
  isLocked,
  isReprocessing,
  onToggleEditComplete,
  onToggleLocked,
  onReprocess,
  onBack,
}: ProductEditHeaderProps) {
  const [showModeMenu, setShowModeMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowModeMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 shrink-0">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <button
          onClick={onBack}
          className="p-1.5 rounded-lg text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors shrink-0"
        >
          <ArrowLeft size={20} />
        </button>

        <div className="w-px h-6 bg-gray-200 shrink-0" />

        <div className="min-w-0">
          <h1 className="text-sm font-semibold text-gray-800 truncate">
            {productName}
          </h1>
          <p className="text-[10px] text-gray-400 truncate">ID: {productId}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0 ml-4">
        <label className="flex items-center gap-1.5 cursor-pointer select-none group">
          <div
            className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
              isEditComplete
                ? 'bg-emerald-500 border-emerald-500'
                : 'border-gray-300 group-hover:border-gray-400'
            }`}
          >
            {isEditComplete && (
              <Check size={12} className="text-white" strokeWidth={3} />
            )}
          </div>
          <input
            type="checkbox"
            checked={isEditComplete}
            onChange={onToggleEditComplete}
            className="sr-only"
          />
          <span className="text-xs text-gray-600 whitespace-nowrap">편집완료</span>
        </label>

        <label className="flex items-center gap-1.5 cursor-pointer select-none group">
          <div
            className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
              isLocked
                ? 'bg-amber-500 border-amber-500'
                : 'border-gray-300 group-hover:border-gray-400'
            }`}
          >
            {isLocked && (
              <Lock size={10} className="text-white" strokeWidth={3} />
            )}
          </div>
          <input
            type="checkbox"
            checked={isLocked}
            onChange={onToggleLocked}
            className="sr-only"
          />
          <span className="text-xs text-gray-600 whitespace-nowrap">상품잠금</span>
        </label>

        <div className="w-px h-6 bg-gray-200 mx-1" />

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowModeMenu(!showModeMenu)}
            disabled={isReprocessing}
            className="ml-1 px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-700 text-sm font-bold rounded-lg transition-colors border border-amber-200 flex items-center gap-1.5 disabled:opacity-50"
          >
            {isReprocessing ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <RefreshCw size={14} />
            )}
            AI 재가공
            <ChevronDown size={12} />
          </button>

          {showModeMenu && !isReprocessing && (
            <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 w-48 py-1">
              <button
                onClick={() => { onReprocess('template'); setShowModeMenu(false); }}
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 text-gray-700"
              >
                <span className="font-medium">템플릿</span>
                <p className="text-xs text-gray-400 mt-0.5">섹션별 React 템플릿</p>
              </button>
              <button
                onClick={() => { onReprocess('oneshot'); setShowModeMenu(false); }}
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 text-gray-700"
              >
                <span className="font-medium">원샷 (AI 이미지)</span>
                <p className="text-xs text-gray-400 mt-0.5">AI가 이미지 1장 생성</p>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
