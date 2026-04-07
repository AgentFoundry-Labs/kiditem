'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, AlertCircle } from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { isApiError } from '@/lib/api-error';
import { toast } from 'sonner';
import { useWorkflows, useToggleWorkflow, useDeleteWorkflow } from './hooks/useWorkflows';
import { MyWorkflowsSection } from './components/MyWorkflowsSection';

export default function WorkflowsPage({ onAddWorkflow }: { onAddWorkflow?: () => void } = {}) {
  const [filter, setFilter] = useState<string>('all');

  const { data: templates = [], isLoading: loading, error: templatesError } = useWorkflows();

  const error = templatesError ? (isApiError(templatesError) ? templatesError.detail : '워크플로우를 불러오는데 실패했습니다.') : null;

  const toggleWorkflow = useToggleWorkflow();
  const deleteWorkflow = useDeleteWorkflow();

  const handleToggleActive = async (id: string, isActive: boolean) => {
    try {
      await toggleWorkflow.mutateAsync({ id, isActive });
    } catch (err) {
      toast.error(isApiError(err) ? err.detail : '워크플로우 상태 변경에 실패했습니다.');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteWorkflow.mutateAsync(id);
    } catch (err) {
      toast.error(isApiError(err) ? err.detail : '워크플로우 삭제에 실패했습니다.');
    }
  };

  if (loading) {
    return <PageSkeleton variant="table" />;
  }

  if (error && !templates.length) {
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
          <h1 className="page-title">Workflows</h1>
          <p className="text-sm text-slate-500 mt-1">
            {templates.length}개 워크플로우 ({templates.filter((t) => t.isActive).length}개 활성)
          </p>
        </div>
        {onAddWorkflow ? (
          <button onClick={onAddWorkflow} className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-purple-500 hover:bg-purple-600 text-white text-sm font-medium transition-colors">
            <Plus className="w-4 h-4" />
            워크플로우 설치
          </button>
        ) : (
          <Link href="/marketplace" className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-purple-500 hover:bg-purple-600 text-white text-sm font-medium transition-colors">
            <Plus className="w-4 h-4" />
            워크플로우 설치
          </Link>
        )}
      </div>

      <MyWorkflowsSection
        templates={templates}
        filter={filter}
        setFilter={setFilter}
        onToggleActive={handleToggleActive}
        onDelete={handleDelete}
      />
    </div>
  );
}
