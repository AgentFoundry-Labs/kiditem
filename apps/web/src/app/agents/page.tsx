'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { List, GitBranch, RefreshCw, SlidersHorizontal, Plus, Bot, Store, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { agentApi } from '@/lib/agent-api';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { agentStatusDot, agentStatusDotDefault } from '@/lib/status-colors';
import { relativeTime, formatCost } from '@/lib/agent-utils';
import { ADAPTER_LABELS, ROLE_LABELS } from '@/lib/agent-types';
import type { Agent, OrgNode, FilterTab, ViewMode } from '@/lib/agent-types';
import { marketplaceApi } from '@/lib/marketplace-api';
import type { AgentCatalogItem, MarketplaceTab } from '@/lib/marketplace-types';
import { MarketplaceCard } from '@/components/marketplace/MarketplaceCard';
import { InstallModal } from '@/components/marketplace/InstallModal';

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

const agentCategoryFilters: { id: string; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'operations', label: '운영' },
  { id: 'analytics', label: '분석' },
  { id: 'monitoring', label: '모니터링' },
];

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

  const fetchAll = useCallback(async () => {
    try {
      const [agentList, org] = await Promise.all([
        agentApi.list(),
        agentApi.org(),
      ]);
      setAgents(agentList);
      setOrgTree(org);
    } catch (err) {
      console.error('Failed to fetch agents:', err);
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

  const installedMarketplaceIds = new Set(
    agents.map((a) => (a as any).marketplaceId).filter(Boolean),
  );

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
      await fetchAll();
    } catch (err) {
      console.error('Failed to install agent:', err);
    } finally {
      setInstalling(false);
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
          목록
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
        <>
          {/* Category filters */}
          <div className="flex items-center gap-2 mb-4">
            <Filter className="w-4 h-4 text-gray-600" />
            <div className="flex gap-1">
              {agentCategoryFilters.map((f) => (
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

          {catalogLoading ? (
            <PageSkeleton variant="list" />
          ) : filteredCatalog.length === 0 ? (
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
                  type="agent"
                  installed={installedMarketplaceIds.has(item.id)}
                  onInstall={() => setInstallTarget(item)}
                />
              ))}
            </div>
          )}

          {installTarget && (
            <InstallModal
              open={!!installTarget}
              onClose={() => setInstallTarget(null)}
              onInstall={handleInstallAgent}
              title={installTarget.name}
              description={installTarget.description}
              configurableParams={installTarget.configurableParams}
              type="agent"
              installing={installing}
            />
          )}
        </>
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

/* ---- List row ---- */

function AgentListRow({ agent, onClick }: { agent: Agent; onClick: () => void }) {
  const dotClass = agentStatusDot[agent.status] ?? agentStatusDotDefault;
  const isLive = agent.status === 'running';

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-0 transition-colors"
      onClick={onClick}
    >
      {/* Status dot */}
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        <span className={cn('absolute inline-flex h-full w-full rounded-full', dotClass)} />
      </span>

      {/* Icon placeholder */}
      <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 text-sm font-semibold text-gray-500">
        {agent.icon ?? agent.name.charAt(0).toUpperCase()}
      </div>

      {/* Name + meta */}
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-gray-900">{agent.name}</span>
        <span className="hidden sm:inline text-xs text-gray-500 ml-2">
          {ROLE_LABELS[agent.role] ?? agent.role}
          {agent.title ? ` · ${agent.title}` : ''}
        </span>
        {agent.description && (
          <p className="text-xs text-gray-400 truncate mt-0.5">{agent.description}</p>
        )}
      </div>

      {/* Trailing info */}
      <div className="hidden sm:flex items-center gap-3 shrink-0">
        {isLive && (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 text-[11px] font-medium">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-500" />
            </span>
            Live
          </span>
        )}
        {agent.runtimeState && agent.runtimeState.totalCostCents > 0 && (
          <span className="text-xs text-gray-400 font-mono text-right">
            {formatCost(agent.runtimeState.totalCostCents)}
          </span>
        )}
        <span className="text-xs text-gray-400 font-mono w-14 text-right">
          {ADAPTER_LABELS[agent.adapterType] ?? agent.adapterType}
        </span>
        <span className="text-xs text-gray-400 w-16 text-right">
          {relativeTime(agent.lastHeartbeatAt)}
        </span>
        <span className="w-20 flex justify-end">
          <StatusBadge status={agent.status} />
        </span>
      </div>
    </div>
  );
}

/* ---- Org tree node ---- */

function OrgTreeNode({
  node,
  depth,
  agentMap,
  onNavigate,
}: {
  node: OrgNode;
  depth: number;
  agentMap: Map<string, Agent>;
  onNavigate: (id: string) => void;
}) {
  const agent = agentMap.get(node.id);
  const dotClass = agentStatusDot[node.status] ?? agentStatusDotDefault;
  const isLive = node.status === 'running';

  return (
    <div style={{ paddingLeft: depth * 24 }}>
      <div
        className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-0 transition-colors"
        onClick={() => onNavigate(node.id)}
      >
        {/* Status dot */}
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className={cn('absolute inline-flex h-full w-full rounded-full', dotClass)} />
        </span>

        {/* Agent icon */}
        <div className="w-7 h-7 rounded-md bg-gray-100 flex items-center justify-center shrink-0 text-xs font-semibold text-gray-500">
          {node.name.charAt(0).toUpperCase()}
        </div>

        {/* Name + meta */}
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-gray-900">{node.name}</span>
          <span className="text-xs text-gray-500 ml-2">
            {ROLE_LABELS[node.role] ?? node.role}
            {node.title ? ` · ${node.title}` : ''}
          </span>
        </div>

        {/* Trailing info */}
        <div className="hidden sm:flex items-center gap-3 shrink-0">
          {isLive && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 text-[11px] font-medium">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-500" />
              </span>
              Live
            </span>
          )}
          {agent?.runtimeState && agent.runtimeState.totalCostCents > 0 && (
            <span className="text-xs text-gray-400 font-mono text-right">
              {formatCost(agent.runtimeState.totalCostCents)}
            </span>
          )}
          {agent && (
            <span className="text-xs text-gray-400 font-mono w-14 text-right">
              {ADAPTER_LABELS[agent.adapterType] ?? agent.adapterType}
            </span>
          )}
          <span className="text-xs text-gray-400 w-16 text-right">
            {relativeTime(node.lastHeartbeatAt)}
          </span>
          <span className="w-20 flex justify-end">
            <StatusBadge status={node.status} />
          </span>
        </div>
        <div className="flex sm:hidden">
          <StatusBadge status={node.status} />
        </div>
      </div>

      {/* Children with border-left connector */}
      {node.reports && node.reports.length > 0 && (
        <div className="border-l border-gray-200 ml-8">
          {node.reports.map((child) => (
            <OrgTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              agentMap={agentMap}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  );
}
