'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Store } from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { isApiError } from '@/lib/api-error';
import { toast } from 'sonner';
import { queryKeys } from '@/lib/query-keys';
import { useAgents, useAgentOrg, useDeleteAgent } from './hooks/useAgents';
import { useMarketplaceAgents, useInstallAgent, useUninstallAgent } from '@/hooks/useMarketplace';
import type { Agent, OrgNode, FilterTab, ViewMode } from './lib/agent-types';
import type { AgentCatalogItem, MarketplaceTab } from '@/lib/marketplace-types';
import { AgentMarketplace } from './components/AgentMarketplace';
import { AgentToolbar } from './components/AgentToolbar';
import { AgentListPanel } from './components/AgentListPanel';

function matchesFilter(status: string, tab: FilterTab, showTerminated: boolean): boolean {
  if (status === 'terminated') return showTerminated;
  if (tab === 'all') return true;
  if (tab === 'active') return status === 'active' || status === 'running' || status === 'idle';
  if (tab === 'paused') return status === 'paused';
  if (tab === 'error') return status === 'error';
  return true;
}

function filterOrgTree(nodes: OrgNode[], tab: FilterTab, showTerminated: boolean): OrgNode[] {
  return nodes.reduce<OrgNode[]>((acc, node) => {
    const filteredReports = filterOrgTree(node.reports, tab, showTerminated);
    if (matchesFilter(node.status, tab, showTerminated) || filteredReports.length > 0) {
      acc.push({ ...node, reports: filteredReports });
    }
    return acc;
  }, []);
}

export default function AgentsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [pageTab, setPageTab] = useState<MarketplaceTab>('my');
  const [view, setView] = useState<ViewMode>('list');
  const [filter, setFilter] = useState<FilterTab>('all');
  const [showTerminated, setShowTerminated] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [installTarget, setInstallTarget] = useState<AgentCatalogItem | null>(null);

  const { data: agents = [], isLoading: loading, error: agentsError } = useAgents({ refetchInterval: 15_000 });
  const { data: orgTree = [] } = useAgentOrg({ refetchInterval: 15_000 });
  const { data: catalog = [], isLoading: catalogLoading } = useMarketplaceAgents(undefined, {
    enabled: pageTab === 'marketplace',
  });

  const error = agentsError ? (isApiError(agentsError) ? agentsError.detail : '에이전트를 불러오는데 실패했습니다.') : null;

  const installAgent = useInstallAgent();
  const uninstallAgent = useUninstallAgent();
  const deleteAgent = useDeleteAgent();
  const installing = installAgent.isPending;

  const filteredCatalog =
    categoryFilter === 'all' ? catalog : catalog.filter((c) => c.category === categoryFilter);

  const handleInstallAgent = async (params: Record<string, any>) => {
    if (!installTarget) return;
    try {
      await installAgent.mutateAsync({ id: installTarget.id, params });
      setInstallTarget(null);
      setPageTab('my');
    } catch (err) {
      toast.error(isApiError(err) ? err.detail : '에이전트 설치에 실패했습니다.');
    }
  };

  const handleUninstallAgent = async (marketplaceId: string) => {
    if (!confirm('이 에이전트를 삭제하시겠습니까?')) return;
    try {
      await uninstallAgent.mutateAsync(marketplaceId);
    } catch (err) {
      toast.error(isApiError(err) ? err.detail : '에이전트 제거에 실패했습니다.');
    }
  };

  const handleDeleteAgent = async (id: string) => {
    if (!confirm('이 에이전트를 삭제하시겠습니까?')) return;
    try {
      await deleteAgent.mutateAsync(id);
    } catch (err) {
      toast.error(isApiError(err) ? err.detail : '에이전트 삭제에 실패했습니다.');
    }
  };

  const filtered = useMemo(
    () => agents
      .filter((a) => matchesFilter(a.status, filter, showTerminated))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [agents, filter, showTerminated],
  );

  const filteredOrg = useMemo(
    () => filterOrgTree(orgTree, filter, showTerminated),
    [orgTree, filter, showTerminated],
  );

  const agentMap = useMemo(() => {
    const map = new Map<string, Agent>();
    for (const a of agents) map.set(a.id, a);
    return map;
  }, [agents]);

  if (loading) {
    return (
      <div className="p-4 sm:p-8">
        <PageSkeleton variant="list" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8">
      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{error}</span>
        </div>
      )}
      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-gray-200 mb-5">
        <button
          onClick={() => setPageTab('my')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            pageTab === 'my'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          내 에이전트
        </button>
        <button
          onClick={() => setPageTab('marketplace')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
            pageTab === 'marketplace'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Store size={14} />
          마켓플레이스
        </button>
      </div>

      {pageTab === 'marketplace' ? (
        <AgentMarketplace
          catalog={catalog}
          catalogLoading={catalogLoading}
          categoryFilter={categoryFilter}
          setCategoryFilter={setCategoryFilter}
          filteredCatalog={filteredCatalog}
          installTarget={installTarget}
          setInstallTarget={setInstallTarget}
          handleInstallAgent={handleInstallAgent}
          handleUninstallAgent={handleUninstallAgent}
          installing={installing}
        />
      ) : (
        <>
          <AgentToolbar
            filter={filter}
            setFilter={setFilter}
            showTerminated={showTerminated}
            setShowTerminated={setShowTerminated}
            filtersOpen={filtersOpen}
            setFiltersOpen={setFiltersOpen}
            view={view}
            setView={setView}
            onRefresh={() => {
              queryClient.invalidateQueries({ queryKey: queryKeys.agents.all });
              queryClient.invalidateQueries({ queryKey: queryKeys.marketplace.agents() });
            }}
          />

          <AgentListPanel
            agents={agents}
            filtered={filtered}
            filteredOrg={filteredOrg}
            orgTree={orgTree}
            view={view}
            agentMap={agentMap}
            onNavigate={(id) => router.push(`/agents/${id}`)}
            onDelete={handleDeleteAgent}
          />
        </>
      )}
    </div>
  );
}
