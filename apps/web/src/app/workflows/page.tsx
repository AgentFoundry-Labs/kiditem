'use client';

import { useState } from 'react';
import { Plus, Filter } from 'lucide-react';
import { useStore } from '@/store/useStore';
import WorkflowList from '@/components/workflows/WorkflowList';
import type { ModuleCategory } from '@/types';

const moduleFilters: { id: ModuleCategory | 'all'; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'order', label: '주문관리' },
  { id: 'accounting', label: '회계/경리' },
  { id: 'inventory', label: '재고관리' },
  { id: 'cs', label: 'CS관리' },
  { id: 'report', label: '보고서' },
  { id: 'product', label: '상품관리' },
  { id: 'marketing', label: '마케팅' },
];

export default function WorkflowsPage() {
  const { workflows } = useStore();
  const [filter, setFilter] = useState<ModuleCategory | 'all'>('all');

  const filtered = filter === 'all'
    ? workflows
    : workflows.filter((w) => w.module === filter);

  return (
    <div className="space-y-6 max-w-[1200px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Workflows</h1>
          <p className="text-sm text-gray-500 mt-1">
            {workflows.length}개 워크플로우 ({workflows.filter((w) => w.isActive).length}개 활성)
          </p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium transition-colors">
          <Plus className="w-4 h-4" />
          새 워크플로우
        </button>
      </div>

      {/* Filters */}
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

      {/* Workflow List */}
      <WorkflowList workflows={filtered} />
    </div>
  );
}
