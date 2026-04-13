'use client';

import { Tag, Save, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface OptionMaster {
  id: string;
  name: string;
  values: string;
  isActive: boolean;
  createdAt: string;
}

interface Props {
  options: OptionMaster[];
  onEdit: (item: OptionMaster) => void;
  onDelete: (id: string) => void;
}

function parseValues(v: string): string[] {
  try {
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function OptionMasterGrid({ options, onEdit, onDelete }: Props) {
  if (options.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-sm text-slate-400">
        등록된 옵션이 없습니다.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {options.map((opt) => {
        const vals = parseValues(opt.values);
        return (
          <div
            key={opt.id}
            className="card"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Tag size={14} className="text-blue-500" />
                <span className="text-sm font-semibold text-slate-900">
                  {opt.name}
                </span>
                <span
                  className={cn('px-2 py-0.5 rounded-full text-xs', opt.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500')}
                >
                  {opt.isActive ? '활성' : '비활성'}
                </span>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => onEdit(opt)}
                  className="p-1 text-slate-400 hover:text-blue-500"
                >
                  <Save size={13} />
                </button>
                <button
                  onClick={() => onDelete(opt.id)}
                  className="p-1 text-slate-400 hover:text-red-500"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {vals.map((v, i) => (
                <span
                  key={i}
                  className="px-2.5 py-1 bg-slate-100 text-slate-600 text-xs rounded-full"
                >
                  {v}
                </span>
              ))}
              {vals.length === 0 && (
                <span className="text-xs text-slate-400">값 없음</span>
              )}
            </div>
            <div className="text-xs text-slate-400 mt-3 font-mono">
              {vals.length}개 값
            </div>
          </div>
        );
      })}
    </div>
  );
}
