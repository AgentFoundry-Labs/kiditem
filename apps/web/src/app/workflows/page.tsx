'use client';

import { useState, useEffect } from 'react';
import { Plus, Filter, Loader2, AlertCircle } from 'lucide-react';
import { workflowApi } from '@/lib/workflow-api';
import type { WorkflowTemplate } from '@/lib/workflow-types';
import WorkflowList from '@/components/workflows/WorkflowList';

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

export default function WorkflowsPage() {
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    workflowApi
      .list()
      .then(setTemplates)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered =
    filter === 'all'
      ? templates
      : templates.filter((t) => t.module === filter);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 gap-2 text-red-500">
        <AlertCircle className="w-5 h-5" />
        <span className="text-sm">{error}</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1200px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Workflows</h1>
          <p className="text-sm text-gray-500 mt-1">
            {templates.length}개 워크플로우 ({templates.filter((t) => t.isActive).length}개 활성)
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
      <WorkflowList templates={filtered} />
    </div>
  );
}
