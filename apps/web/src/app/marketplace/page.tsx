'use client';

import { useState, useMemo } from 'react';
import { Search, Store } from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { MarketplaceCard } from '@/components/marketplace/MarketplaceCard';
import { AgentDetailModal } from '@/components/marketplace/AgentDetailModal';
import { WorkflowDetailModal } from '@/components/marketplace/WorkflowDetailModal';
import { useMarketplaceAgents, useMarketplaceWorkflows, useInstallAgent, useInstallWorkflow, useUninstallAgent, useUninstallWorkflow } from '@/hooks/useMarketplace';
import { isApiError } from '@/lib/api-error';
import { toast } from 'sonner';
import type { AgentCatalogItem, WorkflowCatalogItem } from './lib/marketplace-types';

type TypeFilter = 'all' | 'agent' | 'workflow' | 'installed';
type SortKey = 'installCount' | 'createdAt' | 'name';

type UnifiedItem =
  | (AgentCatalogItem & { itemType: 'agent' })
  | (WorkflowCatalogItem & { itemType: 'workflow' });

export default function MarketplacePage() {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [sort, setSort] = useState<SortKey>('installCount');
  const [installTarget, setInstallTarget] = useState<UnifiedItem | null>(null);

  const { data: agents = [], isLoading: agentsLoading } = useMarketplaceAgents();
  const { data: workflows = [], isLoading: workflowsLoading } = useMarketplaceWorkflows();

  const installAgent = useInstallAgent();
  const installWorkflow = useInstallWorkflow();
  const uninstallAgent = useUninstallAgent();
  const uninstallWorkflow = useUninstallWorkflow();

  const loading = agentsLoading || workflowsLoading;
  const installing = installAgent.isPending || installWorkflow.isPending;

  const unified = useMemo<UnifiedItem[]>(() => {
    const agentItems: UnifiedItem[] = agents.map((a) => ({ ...a, itemType: 'agent' as const }));
    const workflowItems: UnifiedItem[] = workflows.map((w) => ({ ...w, itemType: 'workflow' as const }));
    return [...agentItems, ...workflowItems];
  }, [agents, workflows]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const item of unified) {
      if (item.category) set.add(item.category);
    }
    return Array.from(set).sort();
  }, [unified]);

  const filtered = useMemo(() => {
    let items = unified;

    if (typeFilter === 'agent') items = items.filter((i) => i.itemType === 'agent');
    if (typeFilter === 'workflow') items = items.filter((i) => i.itemType === 'workflow');
    if (typeFilter === 'installed') items = items.filter((i) => i.installed);

    if (categoryFilter !== 'all') items = items.filter((i) => i.category === categoryFilter);

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      items = items.filter(
        (i) => i.name.toLowerCase().includes(q) || i.description.toLowerCase().includes(q),
      );
    }

    return [...items].sort((a, b) => {
      if (sort === 'installCount') return b.installCount - a.installCount;
      if (sort === 'name') return a.name.localeCompare(b.name);
      return 0;
    });
  }, [unified, typeFilter, categoryFilter, search, sort]);

  const handleInstall = async (params: Record<string, any>) => {
    if (!installTarget) return;
    try {
      if (installTarget.itemType === 'agent') {
        await installAgent.mutateAsync({ id: installTarget.id, params });
      } else {
        await installWorkflow.mutateAsync({ id: installTarget.id, params });
      }
      setInstallTarget(null);
    } catch (err) {
      toast.error(isApiError(err) ? err.detail : '설치에 실패했습니다.');
    }
  };

  const handleUninstall = async () => {
    if (!installTarget) return;
    if (!confirm('삭제하시겠습니까?')) return;
    try {
      if (installTarget.itemType === 'agent') {
        await uninstallAgent.mutateAsync(installTarget.id);
      } else {
        await uninstallWorkflow.mutateAsync(installTarget.id);
      }
      setInstallTarget(null);
    } catch (err) {
      toast.error(isApiError(err) ? err.detail : '삭제에 실패했습니다.');
    }
  };

  const TYPE_TABS: { id: TypeFilter; label: string }[] = [
    { id: 'all', label: '전체' },
    { id: 'agent', label: '에이전트' },
    { id: 'workflow', label: '워크플로우' },
    { id: 'installed', label: '설치됨' },
  ];

  const SORT_OPTIONS: { value: SortKey; label: string }[] = [
    { value: 'installCount', label: '인기순' },
    { value: 'createdAt', label: '최신순' },
    { value: 'name', label: '이름순' },
  ];

  const CATEGORY_LABELS: Record<string, string> = {
    automation: '자동화',
    monitoring: '모니터링',
    reporting: '리포팅',
    operations: '운영',
    analytics: '분석',
  };

  return (
    <div className="p-4 sm:p-8 max-w-[1200px]">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">마켓플레이스</h1>
        <p className="text-sm text-gray-500 mt-1">에이전트와 워크플로우를 설치하세요</p>
      </div>

      {/* Type filter tabs */}
      <div className="flex items-center gap-1 border-b border-gray-200 mb-5">
        {TYPE_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setTypeFilter(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              typeFilter === tab.id
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Toolbar: search + category + sort */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="이름 또는 설명 검색"
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Category pills */}
        <div className="flex gap-1 flex-wrap">
          <button
            onClick={() => setCategoryFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
              categoryFilter === 'all'
                ? 'bg-white text-gray-900 border border-gray-200 shadow-sm'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50 border border-transparent'
            }`}
          >
            전체
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                categoryFilter === cat
                  ? 'bg-white text-gray-900 border border-gray-200 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50 border border-transparent'
              }`}
            >
              {CATEGORY_LABELS[cat] || cat}
            </button>
          ))}
        </div>

        {/* Sort */}
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="ml-auto px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Grid */}
      {loading ? (
        <PageSkeleton variant="list" />
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <Store size={40} className="mb-3" />
          <p className="text-sm">검색 결과가 없습니다</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((item) => (
            <MarketplaceCard
              key={`${item.itemType}-${item.id}`}
              item={item}
              type={item.itemType}
              installed={item.installed}
              onClick={() => setInstallTarget(item)}
            />
          ))}
        </div>
      )}

      {/* Detail Modals */}
      {installTarget?.itemType === 'agent' && (
        <AgentDetailModal
          open
          onClose={() => setInstallTarget(null)}
          item={installTarget}
          installed={installTarget.installed}
          onInstall={handleInstall}
          onUninstall={handleUninstall}
          installing={installing}
        />
      )}
      {installTarget?.itemType === 'workflow' && (
        <WorkflowDetailModal
          open
          onClose={() => setInstallTarget(null)}
          item={installTarget}
          installed={installTarget.installed}
          onInstall={handleInstall}
          onUninstall={handleUninstall}
          installing={installing}
        />
      )}
    </div>
  );
}
