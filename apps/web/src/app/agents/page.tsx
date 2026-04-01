'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { List, GitBranch, RefreshCw, SlidersHorizontal, Plus, Bot, Store } from 'lucide-react';
import { cn } from '@/lib/utils';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { agentApi } from '@/lib/agent-api';
import { isApiError } from '@/lib/api-error';
import type { Agent, OrgNode, FilterTab, ViewMode } from '@/lib/agent-types';
import { marketplaceApi } from '@/lib/marketplace-api';
import type { AgentCatalogItem, MarketplaceTab } from '@/lib/marketplace-types';
import { AgentListRow } from './components/AgentListRow';
import { OrgTreeNode } from './components/OrgTreeNode';
import { AgentMarketplace } from './components/AgentMarketplace';

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
  const [pageTab, setPageTab] = useState<MarketplaceTab>('my');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [orgTree, setOrgTree] = useState<OrgNode[]>([]);
  const [view, setView] = useState<ViewMode>('list');
  const [filter, setFilter] = useState<FilterTab>('all');
  const [loading, setLoading] = useState(true);
  const [showTerminated, setShowTerminated] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Marketplace state
  const [catalog, setCatalog] = useState<AgentCatalogItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [installTarget, setInstallTarget] = useState<AgentCatalogItem | null>(null);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [agentList, org] = await Promise.all([
        agentApi.list(),
        agentApi.org(),
      ]);
      setAgents(agentList);
      setOrgTree(org);
      setError(null);
    } catch (err) {
      setError(isApiError(err) ? err.detail : '에이전트를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 15_000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  useEffect(() => {
    if (pageTab === 'marketplace') {
      setCatalogLoading(true);
      marketplaceApi
        .listAgents()
        .then(setCatalog)
        .catch((err) => console.error('Failed to fetch agent catalog:', err))
        .finally(() => setCatalogLoading(false));
    }
  }, [pageTab]);

  const filteredCatalog =
    categoryFilter === 'all'
      ? catalog
      : catalog.filter((c) => c.category === categoryFilter);

  const handleInstallAgent = async (params: Record<string, any>) => {
    if (!installTarget) return;
    setInstalling(true);
    try {
      await marketplaceApi.installAgent(installTarget.id, { params });
      setInstallTarget(null);
      setPageTab('my');
      const updatedCatalog = await marketplaceApi.listAgents();
      setCatalog(updatedCatalog);
      await fetchAll();
    } catch (err) {
      alert(isApiError(err) ? err.detail : '에이전트 설치에 실패했습니다.');
    } finally {
      setInstalling(false);
    }
  };

  const handleUninstallAgent = async (marketplaceId: string) => {
    if (!confirm('이 에이전트를 삭제하시겠습니까?')) return;
    try {
      await marketplaceApi.uninstallAgent(marketplaceId);
      const updatedCatalog = await marketplaceApi.listAgents();
      setCatalog(updatedCatalog);
      await fetchAll();
    } catch (err) {
      alert(isApiError(err) ? err.detail : '에이전트 제거에 실패했습니다.');
    }
  };

  const handleDeleteAgent = async (id: string) => {
    if (!confirm('이 에이전트를 삭제하시겠습니까?')) return;
    try {
      await agentApi.delete(id);
      await fetchAll();
    } catch (err) {
      alert(isApiError(err) ? err.detail : '에이전트 삭제에 실패했습니다.');
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
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">&times;</button>
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
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-5">
        {/* Filter pills */}
        <div className="flex gap-1">
          {(['all', 'active', 'paused', 'error'] as FilterTab[]).map((tab) => (
            <button
              key={tab}
              className={cn(
                'px-3 py-1.5 text-sm rounded-lg transition-colors',
                filter === tab
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700',
              )}
              onClick={() => setFilter(tab)}
            >
              {{ all: '전체', active: '활성', paused: '일시정지', error: '에러' }[tab]}
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Filters dropdown */}
          <div className="relative">
            <button
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg transition-colors',
                filtersOpen || showTerminated
                  ? 'bg-gray-100 text-gray-900'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900',
              )}
              onClick={() => setFiltersOpen(!filtersOpen)}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Filters
              {showTerminated && (
                <span className="ml-0.5 px-1 bg-gray-900 text-white rounded text-[10px]">1</span>
              )}
            </button>
            {filtersOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setFiltersOpen(false)} />
                <div className="absolute right-0 top-full mt-1 z-20 w-48 bg-white border border-gray-200 rounded-lg shadow-lg p-1">
                  <button
                    className="flex items-center gap-2 w-full px-2 py-1.5 text-xs text-left rounded-md hover:bg-gray-50 transition-colors"
                    onClick={() => setShowTerminated(!showTerminated)}
                  >
                    <span className={cn(
                      'flex items-center justify-center w-3.5 h-3.5 border rounded-sm transition-colors',
                      showTerminated ? 'bg-gray-900 border-gray-900' : 'border-gray-300',
                    )}>
                      {showTerminated && <span className="text-white text-[9px] leading-none">✓</span>}
                    </span>
                    종료된 에이전트 표시
                  </button>
                </div>
              </>
            )}
          </div>

          {/* View toggle */}
          <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
            <button
              className={cn(
                'p-1.5 transition-colors',
                view === 'list' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:bg-gray-50 hover:text-gray-700',
              )}
              onClick={() => setView('list')}
              title="리스트"
            >
              <List className="w-3.5 h-3.5" />
            </button>
            <button
              className={cn(
                'p-1.5 transition-colors',
                view === 'org' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:bg-gray-50 hover:text-gray-700',
              )}
              onClick={() => setView('org')}
              title="조직도"
            >
              <GitBranch className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            onClick={fetchAll}
            className="p-1.5 text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg transition-colors"
            title="새로고침"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>

          {/* New Agent — placeholder */}
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-gray-700"
            title="새 에이전트 (준비 중)"
            disabled
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">새 에이전트</span>
          </button>
        </div>
      </div>

      {/* Agent count */}
      {filtered.length > 0 && (
        <p className="text-xs text-gray-400 mb-3">
          {filtered.length}개 에이전트
          {agents.filter(a => a.status === 'running').length > 0 && (
            <> · <span className="text-cyan-600">{agents.filter(a => a.status === 'running').length}개 실행 중</span></>
          )}
        </p>
      )}

      {/* Empty state */}
      {agents.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 border border-gray-200 rounded-lg">
          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
            <Bot className="w-6 h-6 text-gray-400" />
          </div>
          <p className="text-sm font-medium text-gray-600">등록된 에이전트가 없습니다.</p>
          <p className="text-xs text-gray-400 mt-1">서버에서 에이전트를 시드하거나 API로 추가하세요.</p>
        </div>
      )}

      {/* List view */}
      {view === 'list' && filtered.length > 0 && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          {filtered.map((agent) => (
            <AgentListRow
              key={agent.id}
              agent={agent}
              onClick={() => router.push(`/agents/${agent.id}`)}
              onDelete={handleDeleteAgent}
            />
          ))}
        </div>
      )}

      {view === 'list' && agents.length > 0 && filtered.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-8">필터에 맞는 에이전트가 없습니다.</p>
      )}

      {/* Org view */}
      {view === 'org' && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          {filteredOrg.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">
              {orgTree.length === 0 ? '조직 구조가 정의되지 않았습니다.' : '필터에 맞는 에이전트가 없습니다.'}
            </p>
          ) : (
            filteredOrg.map((node) => (
              <OrgTreeNode
                key={node.id}
                node={node}
                depth={0}
                agentMap={agentMap}
                onNavigate={(id) => router.push(`/agents/${id}`)}
              />
            ))
          )}
        </div>
      )}
      </>
      )}
    </div>
  );
}
