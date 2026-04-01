'use client';
import { Filter } from 'lucide-react';
import WorkflowList from './WorkflowList';
import type { WorkflowTemplate } from '@kiditem/shared';

const moduleFilters: { id: string; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'order', label: '주문관리' },
  { id: 'accounting', label: '회계/경리' },
  { id: 'inventory', label: '재고관리' },
  { id: 'cs', label: 'CS관리' },
  { id: 'report', label: '보고서' },
  { id: 'product', label: '상품관리' },
  { id: 'marketing', label: '마케팅' },
];

interface Props {
  templates: WorkflowTemplate[];
  filter: string;
  setFilter: (f: string) => void;
  onToggleActive: (id: string, isActive: boolean) => void;
  onDelete: (id: string) => void;
}

export function MyWorkflowsSection({ templates, filter, setFilter, onToggleActive, onDelete }: Props) {
  const filtered = filter === 'all' ? templates : templates.filter((t) => t.module === filter);

  return (
    <>
      <div className="flex items-center gap-2">
        <Filter className="w-4 h-4 text-gray-600" />
        <div className="flex gap-1">
          {moduleFilters.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                filter === f.id
                  ? 'bg-white text-gray-900 border border-gray-200'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50 border border-transparent'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <WorkflowList
        templates={filtered}
        onToggleActive={onToggleActive}
        onDelete={onDelete}
      />
    </>
  );
}
