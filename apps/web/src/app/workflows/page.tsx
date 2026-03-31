'use client';

import { useState, useEffect } from 'react';
import { Plus, Filter, AlertCircle, Store } from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { workflowApi } from '@/lib/workflow-api';
import type { WorkflowTemplate } from '@/lib/workflow-types';
import WorkflowList from '@/components/workflows/WorkflowList';
import { marketplaceApi } from '@/lib/marketplace-api';
import type { WorkflowCatalogItem, MarketplaceTab } from '@/lib/marketplace-types';
import { MarketplaceCard } from '@/components/marketplace/MarketplaceCard';
import { InstallModal } from '@/components/marketplace/InstallModal';

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

const categoryFilters: { id: string; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'automation', label: '자동화' },
  { id: 'monitoring', label: '모니터링' },
  { id: 'reporting', label: '리포팅' },
];

export default function WorkflowsPage() {
  const [tab, setTab] = useState<MarketplaceTab>('my');
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [catalog, setCatalog] = useState<WorkflowCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Install modal
  const [installTarget, setInstallTarget] = useState<WorkflowCatalogItem | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      workflowApi.list().catch(() => [] as WorkflowTemplate[]),
      marketplaceApi.listWorkflows().catch(() => [] as WorkflowCatalogItem[]),
    ])
      .then(([t, c]) => { setTemplates(t); setCatalog(c); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [tab]);

  const filteredTemplates =
    filter === 'all'
      ? templates
      : templates.filter((t) => t.module === filter);

  const filteredCatalog =
    categoryFilter === 'all'
      ? catalog
      : catalog.filter((c) => c.category === categoryFilter);

  const reloadAll = async () => {
    const [updated, updatedCatalog] = await Promise.all([
      workflowApi.list(),
      marketplaceApi.listWorkflows(),
    ]);
    setTemplates(updated);
    setCatalog(updatedCatalog);
  };

  const handleInstall = async (params: Record<string, any>) => {
    if (!installTarget) return;
    setInstalling(true);
    try {
      await marketplaceApi.installWorkflow(installTarget.id, { params });
      setInstallTarget(null);
      setTab('my');
      await reloadAll();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setInstalling(false);
    }
  };

  const handleUninstall = async (marketplaceId: string) => {
    if (!confirm('이 워크플로우를 삭제하시겠습니까?')) return;
    try {
      await marketplaceApi.uninstallWorkflow(marketplaceId);
      await reloadAll();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleToggleActive = async (id: string, isActive: boolean) => {
    try {
      await workflowApi.toggleActive(id, isActive);
      await reloadAll();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await workflowApi.delete(id);
      await reloadAll();
    } catch (err: any) {
      setError(err.message);
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
        <>
          {/* Module filters */}
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
            templates={filteredTemplates}
            onToggleActive={handleToggleActive}
            onDelete={handleDelete}
          />
        </>
      ) : (
        <>
          {/* Category filters */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-600" />
            <div className="flex gap-1">
              {categoryFilters.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setCategoryFilter(f.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                    categoryFilter === f.id
                      ? 'bg-white text-gray-900 border border-gray-200'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50 border border-transparent'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Catalog grid */}
          {filteredCatalog.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <Store size={40} className="mb-3" />
              <p className="text-sm">카탈로그가 비어 있습니다</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredCatalog.map((item) => (
                <MarketplaceCard
                  key={item.id}
                  item={item}
                  type="workflow"
                  installed={item.installed}
                  onInstall={() => setInstallTarget(item)}
                  onUninstall={handleUninstall}
                />
              ))}
            </div>
          )}
        </>
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
