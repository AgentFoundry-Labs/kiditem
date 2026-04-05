'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { isApiError } from '@/lib/api-error';
import { toast } from 'sonner';
import { queryKeys } from '@/lib/query-keys';
import { useAgents, useAgentOrg, useDeleteAgent } from '../hooks/useAgents';
import type { Agent, OrgNode, FilterTab, ViewMode } from '../lib/agent-types';
import { AgentToolbar } from './AgentToolbar';
import { AgentListPanel } from './AgentListPanel';
import OrgTree from '../org/components/OrgTree';
import OrgLegend from '../org/components/OrgLegend';

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

export default function AgentOverview({ onAddAgent }: { onAddAgent?: () => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [pageTab, setPageTab] = useState<'my' | 'org'>('my');
  const [view, setView] = useState<ViewMode>('list');
  const [filter, setFilter] = useState<FilterTab>('all');
  const [showTerminated, setShowTerminated] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const { data: agents = [], isLoading: loading, error: agentsError } = useAgents({ refetchInterval: 15_000 });
  const { data: orgTree = [] } = useAgentOrg({ refetchInterval: 15_000 });

  const error = agentsError ? (isApiError(agentsError) ? agentsError.detail : '에이전트를 불러오는데 실패했습니다.') : null;

  const deleteAgent = useDeleteAgent();

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
          onClick={() => setPageTab('org')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            pageTab === 'org'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          조직도
        </button>
      </div>

      {pageTab === 'org' ? (
        <>
          {orgTree.length === 0 ? (
            <div className="flex items-center justify-center py-32 text-sm text-gray-400">
              등록된 에이전트가 없습니다.
            </div>
          ) : (
            <>
              <div className="bg-white rounded-xl border border-gray-200 overflow-auto p-10">
                <div className="flex justify-center">
                  <OrgTree nodes={filteredOrg} router={router} />
                </div>
              </div>
              <OrgLegend />
            </>
          )}
        </>
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
            }}
            onAddAgent={onAddAgent}
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
