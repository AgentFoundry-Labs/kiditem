'use client';

import { SlidersHorizontal, Plus } from 'lucide-react';

interface Props {
  onAdd: () => void;
}

export default function OptionMasterHeader({ onAdd }: Props) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="page-title flex items-center gap-2">
          <SlidersHorizontal size={22} /> 옵션 마스터
        </h1>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onAdd}
          className="flex items-center gap-1 px-3 py-1.5 bg-purple-600 text-white rounded-md text-xs hover:bg-purple-700"
        >
          <Plus size={12} /> 옵션 추가
        </button>
      </div>
    </div>
  );
}
