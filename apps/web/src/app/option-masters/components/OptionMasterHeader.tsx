'use client';

import { SlidersHorizontal, Plus } from 'lucide-react';

interface Props {
  onAdd: () => void;
}

export default function OptionMasterHeader({ onAdd }: Props) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-sm font-semibold text-gray-900 uppercase tracking-wide flex items-center gap-2">
          <SlidersHorizontal size={18} /> Option Masters
        </h1>
        <p className="text-xs text-gray-400 font-mono mt-0.5">
          옵션 항목 관리 (색상, 사이즈 등)
        </p>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onAdd}
          className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-md text-xs hover:bg-blue-700"
        >
          <Plus size={12} /> 옵션 추가
        </button>
      </div>
    </div>
  );
}
