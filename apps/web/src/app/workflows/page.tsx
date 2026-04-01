'use client';

import { useState } from 'react';
import { Plus, AlertCircle, Store } from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { isApiError } from '@/lib/api-error';
import { toast } from 'sonner';
import { useWorkflows, useToggleWorkflow, useDeleteWorkflow } from './hooks/useWorkflows';
import { useMarketplaceWorkflows, useInstallWorkflow, useUninstallWorkflow } from '@/hooks/useMarketplace';
import type { WorkflowCatalogItem, MarketplaceTab } from '@/lib/marketplace-types';
import { InstallModal } from '@/components/marketplace/InstallModal';
import { MyWorkflowsSection } from './components/MyWorkflowsSection';
import { MarketplaceCatalogSection } from './components/MarketplaceCatalogSection';

export default function WorkflowsPage() {
  const [tab, setTab] = useState<MarketplaceTab>('my');
  const [filter, setFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [installTarget, setInstallTarget] = useState<WorkflowCatalogItem | null>(null);

  // Queries
  const { data: templates = [], isLoading: templatesLoading, error: templatesError } = useWorkflows();
  const { data: catalog = [], isLoading: catalogLoading } = useMarketplaceWorkflows();

  const loading = templatesLoading || catalogLoading;
  const error = templatesError ? (isApiError(templatesError) ? templatesError.detail : '워크플로우를 불러오는데 실패했습니다.') : null;

  // Mutations
  const installWorkflow = useInstallWorkflow();
  const uninstallWorkflow = useUninstallWorkflow();
  const toggleWorkflow = useToggleWorkflow();
  const deleteWorkflow = useDeleteWorkflow();
  const installing = installWorkflow.isPending;

  const handleInstall = async (params: Record<string, any>) => {
    if (!installTarget) return;
    try {
      await installWorkflow.mutateAsync({ id: installTarget.id, params });
      setInstallTarget(null);
      setTab('my');
    } catch (err) {
      toast.error(isApiError(err) ? err.detail : '워크플로우 설치에 실패했습니다.');
    }
  };

  const handleUninstall = async (marketplaceId: string) => {
    if (!confirm('이 워크플로우를 삭제하시겠습니까?')) return;
    try {
      await uninstallWorkflow.mutateAsync(marketplaceId);
    } catch (err) {
      toast.error(isApiError(err) ? err.detail : '워크플로우 제거에 실패했습니다.');
    }
  };

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

  if (error && !templates.length && !catalog.length) {
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
            {tab === 'my'
              ? `${templates.length}개 워크플로우 (${templates.filter((t) => t.isActive).length}개 활성)`
              : `${catalog.length}개 카탈로그`}
          </p>
        </div>
        {tab === 'my' && (
          <button className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium transition-colors">
            <Plus className="w-4 h-4" />
            새 워크플로우
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-gray-200">
        <button
          onClick={() => setTab('my')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === 'my'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          내 워크플로우
        </button>
        <button
          onClick={() => setTab('marketplace')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
            tab === 'marketplace'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Store size={14} />
          마켓플레이스
        </button>
      </div>

      {tab === 'my' ? (
        <MyWorkflowsSection
          templates={templates}
          filter={filter}
          setFilter={setFilter}
          onToggleActive={handleToggleActive}
          onDelete={handleDelete}
        />
      ) : (
        <MarketplaceCatalogSection
          catalog={catalog}
          categoryFilter={categoryFilter}
          setCategoryFilter={setCategoryFilter}
          onInstall={setInstallTarget}
          onUninstall={handleUninstall}
        />
      )}

      {/* Install Modal */}
      {installTarget && (
        <InstallModal
          open={!!installTarget}
          onClose={() => setInstallTarget(null)}
          onInstall={handleInstall}
          title={installTarget.name}
          description={installTarget.description}
          configurableParams={installTarget.configurableParams}
          type="workflow"
          installing={installing}
        />
      )}
    </div>
  );
}
