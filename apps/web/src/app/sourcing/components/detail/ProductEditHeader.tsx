'use client';

import { ArrowLeft, Check, Lock } from 'lucide-react';

interface ProductEditHeaderProps {
  productName: string;
  productId: string;
  isEditComplete: boolean;
  isLocked: boolean;
  onToggleEditComplete: () => void;
  onToggleLocked: () => void;
  onBack: () => void;
}

export default function ProductEditHeader({
  productName,
  productId,
  isEditComplete,
  isLocked,
  onToggleEditComplete,
  onToggleLocked,
  onBack,
}: ProductEditHeaderProps) {
  return (
    <div className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4 shrink-0">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <button
          onClick={onBack}
          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors shrink-0"
        >
          <ArrowLeft size={20} />
        </button>

        <div className="w-px h-6 bg-slate-200 shrink-0" />

        <div className="min-w-0">
          <h1 className="text-sm font-semibold text-slate-800 truncate">
            {productName}
          </h1>
          <p className="text-[10px] text-slate-400 truncate">ID: {productId}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0 ml-4">
        <label className="flex items-center gap-1.5 cursor-pointer select-none group">
          <div
            className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
              isEditComplete
                ? 'bg-emerald-500 border-emerald-500'
                : 'border-slate-300 group-hover:border-slate-400'
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
          <span className="text-xs text-slate-600 whitespace-nowrap">편집완료</span>
        </label>

        <label className="flex items-center gap-1.5 cursor-pointer select-none group">
          <div
            className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
              isLocked
                ? 'bg-amber-500 border-amber-500'
                : 'border-slate-300 group-hover:border-slate-400'
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
          <span className="text-xs text-slate-600 whitespace-nowrap">상품잠금</span>
        </label>


      </div>
    </div>
  );
}
