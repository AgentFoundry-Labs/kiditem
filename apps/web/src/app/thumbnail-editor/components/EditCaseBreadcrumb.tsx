'use client';
import { ArrowLeft } from 'lucide-react';

interface Props {
  caseName: string;
  onChange: () => void;
}

export function EditCaseBreadcrumb({ caseName, onChange }: Props) {
  return (
    <div
      className="flex items-center gap-2 px-4 py-2 bg-gray-50"
      style={{ borderBottom: '1px solid #e5e7eb' }}
    >
      <span className="text-[11px] font-semibold text-gray-700">{caseName}</span>
      <button
        type="button"
        onClick={onChange}
        className="ml-auto flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-900 transition-colors"
      >
        <ArrowLeft size={10} />
        용도 변경
      </button>
    </div>
  );
}
