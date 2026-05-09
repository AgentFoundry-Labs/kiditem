'use client';

import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ChevronLeft, Layers, MoreHorizontal, Radio,
} from 'lucide-react';
import { ActionTaskSchema, type ActionTask } from '@kiditem/shared/action-task';
import type { AgentInstanceSummary, AgentRunSummary } from '@kiditem/shared/agent-os';
import type { DashboardAdSummary, DashboardSalesSummary } from '@kiditem/shared/dashboard';
import type { PanelItem } from '@kiditem/shared/panel';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';
import { usePanelStream } from '@/components/panel/hooks/usePanelStream';
import { usePanelStore } from '@/components/panel/lib/panel-store';
import { ActionBoardOverlay } from './components/ActionBoardOverlay';
import { AgentNetworkCanvas } from './components/AgentNetworkCanvas';
import { AgentOsBottomDashboard } from './components/AgentOsBottomDashboard';
import { AgentOsHeader } from './components/AgentOsHeader';
import { AgentsListPanel } from './components/AgentsListPanel';
import { LiveActivityPanel, type RecentLog } from './components/LiveActivityPanel';
import { classifyAction, classifyAgentCategory, flattenNodes } from './lib/agent-os-helpers';
import { type OrgNode, useTeamStyle } from './lib/agent-os-types';

// Synthesize the org tree the canvas expects from Agent OS instances.
// `reports` is built from `reportsToId`; running runs flag instances as `running`.
function buildOrgNodes(
  instances: AgentInstanceSummary[],
  runningInstanceIds: Set<string>,
): OrgNode[] {
  const childrenByParent = new Map<string | null, AgentInstanceSummary[]>();
  for (const inst of instances) {
    const parentId = inst.reportsToId ?? null;
    const list = childrenByParent.get(parentId) ?? [];
    list.push(inst);
    childrenByParent.set(parentId, list);
  }
  const buildNode = (inst: AgentInstanceSummary): OrgNode => {
    const reports = (childrenByParent.get(inst.id) ?? []).map(buildNode);
    return {
      id: inst.id,
      name: inst.name,
      type: inst.role === 'ceo' ? 'manager' : reports.length > 0 ? 'manager' : 'specialist',
      role: inst.role,
      title: inst.title ?? inst.role,
      status: runningInstanceIds.has(inst.id) ? 'running' : 'idle',
      lastHeartbeatAt: inst.lifecycleStatus === 'active' ? new Date().toISOString() : null,
      reports: reports.length > 0 ? reports : undefined,
    };
  };
  return (childrenByParent.get(null) ?? []).map(buildNode);
}

export default function AgentOSPage() {
  const queryClient = useQueryClient();
  const teamStyle = useTeamStyle();
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [showActionBoard, setShowActionBoard] = useState(false);
  const [agentsMinimized, setAgentsMinimized] = useState(false);
  const [activityMinimized, setActivityMinimized] = useState(false);

  const { data: instances = [] } = useQuery({
    queryKey: ['agent-os', 'instances'],
    queryFn: () => apiClient.get<AgentInstanceSummary[]>('/api/agent-os/instances'),
    refetchInterval: 30_000,
  });
  const { data: runningRuns = { items: [] as AgentRunSummary[] } } = useQuery({
    queryKey: ['agent-os', 'runs', 'running'],
    queryFn: () => apiClient.get<{ items: AgentRunSummary[] }>('/api/agent-os/runs?status=running&limit=100'),
    refetchInterval: 15_000,
  });
  const orgNodes = useMemo(() => {
    const runningIds = new Set(runningRuns.items.map((r) => r.agentInstanceId));
    return buildOrgNodes(instances, runningIds);
  }, [instances, runningRuns]);
  const { data: actionTasks = [] } = useQuery({
    queryKey: queryKeys.actionTasks.list(),
    queryFn: () => apiClient.get<ActionTask[]>('/api/action-tasks'),
    refetchInterval: 30_000,
  });
  const { data: salesData } = useQuery({
    queryKey: queryKeys.dashboard.salesBaseline(),
    queryFn: () => apiClient.get<DashboardSalesSummary>('/api/dashboard/sales'),
    refetchInterval: 60_000,
  });
  const { data: adData } = useQuery({
    queryKey: queryKeys.dashboard.adBaseline(),
    queryFn: () => apiClient.get<DashboardAdSummary>('/api/dashboard/ad'),
    refetchInterval: 60_000,
  });
  const { mutate: executeAction, variables: executingId } = useMutation({
    mutationFn: async (id: string) => {
      const raw = await apiClient.post<unknown>(`/api/action-tasks/${id}/execute`, {});
      return ActionTaskSchema.parse(raw);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.actionTasks.list() });
      toast.success('실행 완료');
    },
    onError: () => toast.error('실행 실패'),
  });

  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['agent-os'] });
    queryClient.invalidateQueries({ queryKey: queryKeys.actionTasks.list() });
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
  }, [queryClient]);

  usePanelStream();
  const panelById = usePanelStore((s) => s.byId);
  const panelConnection = usePanelStore((s) => s.connectionStatus);

  const ceo = orgNodes[0];
  const teams = useMemo<OrgNode[]>(
    () => {
      const directReports = ceo?.reports ?? orgNodes;
      const explicitTeams = directReports.filter(n => n.type === 'team');
      if (explicitTeams.length > 0) return explicitTeams;

      const grouped = new Map<string, OrgNode[]>();
      for (const agent of directReports) {
        if (agent.type === 'team' || agent.role === 'manager' || agent.type === 'manager') continue;
        const category = classifyAgentCategory(agent);
        const group = grouped.get(category) ?? [];
        group.push({ ...agent, category });
        grouped.set(category, group);
      }

      const generatedTeams: OrgNode[] = [];
      for (const [category, style] of Object.entries(teamStyle)) {
        const reports = grouped.get(category) ?? [];
        if (reports.length === 0) continue;
        const status = reports.some(agent => agent.status === 'running') ? 'running' : 'idle';
        generatedTeams.push({
            id: `team-${category}`,
            name: style.label,
            type: 'team',
            role: 'team',
            title: style.label,
            status,
            category,
            reports,
          });
      }
      return generatedTeams;
    },
    [ceo, orgNodes, teamStyle],
  );
  const allAgents = useMemo(() => {
    const byId = new Map<string, OrgNode>();
    for (const agent of flattenNodes(orgNodes)) byId.set(agent.id, agent);
    for (const agent of teams.flatMap(team => team.reports ?? [])) byId.set(agent.id, agent);
    return Array.from(byId.values());
  }, [orgNodes, teams]);
  const agents = useMemo(
    () => teams.flatMap(team => team.reports ?? []),
    [teams],
  );

  const allTeamTasks = useMemo(() => {
    const out: Record<string, ActionTask[]> = {};
    for (const cat of Object.keys(teamStyle)) out[cat] = [];
    for (const a of actionTasks) {
      const cat = classifyAction(a);
      (out[cat] ?? out['analytics']).push(a);
    }
    return out;
  }, [actionTasks, teamStyle]);

  const teamTaskCounts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [cat, tasks] of Object.entries(allTeamTasks)) {
      out[cat] = tasks.filter(t => t.type === 'ai').length;
    }
    return out;
  }, [allTeamTasks]);

  const aiActions = useMemo(() => actionTasks.filter(t => t.type === 'ai'), [actionTasks]);
  const runningCount = useMemo(() => agents.filter(a => a.status === 'running').length, [agents]);
  const idleCount = useMemo(
    () => agents.filter(a => a.status !== 'running' && a.lastHeartbeatAt).length,
    [agents],
  );
  const offlineCount = useMemo(() => agents.filter(a => !a.lastHeartbeatAt).length, [agents]);
  const urgentCount = useMemo(() => aiActions.filter(t => t.priority === 'urgent').length, [aiActions]);

  const selectedData = selectedAgent ? allAgents.find(a => a.id === selectedAgent) : null;

  const panelItems = useMemo(() => {
    return Object.values(panelById)
      .filter((item): item is PanelItem & { kind: 'run' } => item.kind === 'run')
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 15);
  }, [panelById]);

  const recentLogs = useMemo<RecentLog[]>(() => {
    const all: RecentLog[] = [];
    for (const t of actionTasks) {
      for (const log of t.activityLog) {
        all.push({
          taskId: t.id, taskLabel: t.label, role: t.role,
          action: log.action, timestamp: log.timestamp, detail: log.detail, success: log.success,
        });
      }
    }
    return all
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 25);
  }, [actionTasks]);

  const select = (id: string) => setSelectedAgent(prev => prev === id ? null : id);
  const title = selectedData?.name ?? ceo?.name ?? 'Agent Network';

  return (
    <div className="fixed inset-0 bg-[#0a0f1a] text-white overflow-hidden flex flex-col">
      <AgentOsHeader ceoName={ceo?.name ?? null} onRefresh={handleRefresh} />

      <div className="shrink-0 px-5 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {selectedData && (
            <button onClick={() => setSelectedAgent(null)} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-white/[0.04]">
              <ChevronLeft size={17} />
            </button>
          )}
          <span className="text-[18px] font-bold">{title}</span>
          {runningCount > 0 && (
            <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />{runningCount} RUNNING
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setShowActionBoard(v => !v)} className="relative w-10 h-10 rounded-xl bg-[#111827] border border-white/10 hover:bg-white/[0.04] flex items-center justify-center text-slate-400">
            <Layers size={15} />
            {urgentCount > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-400 animate-pulse" />}
          </button>
          <button className="w-10 h-10 rounded-xl bg-[#111827] border border-white/10 hover:bg-white/[0.04] flex items-center justify-center text-slate-400">
            <Radio size={15} className={cn(panelConnection === 'connected' && 'text-emerald-400')} />
          </button>
          <button className="w-10 h-10 rounded-xl bg-[#111827] border border-white/10 hover:bg-white/[0.04] flex items-center justify-center text-slate-400">
            <MoreHorizontal size={15} />
          </button>
        </div>
      </div>

      <div className="flex-1 mx-5 rounded-2xl border border-white/10 bg-[#0d1321] overflow-hidden relative min-h-0">
        <AgentNetworkCanvas
          ceo={ceo}
          teams={teams}
          teamStyle={teamStyle}
          teamTaskCounts={teamTaskCounts}
          selectedAgent={selectedAgent}
          onSelect={select}
        />
        <AgentsListPanel
          agents={agents}
          teams={teams}
          teamStyle={teamStyle}
          selectedAgent={selectedAgent}
          minimized={agentsMinimized}
          onToggleMinimize={() => setAgentsMinimized(v => !v)}
          onSelect={select}
        />
        <LiveActivityPanel
          panelItems={panelItems}
          recentLogs={recentLogs}
          connectionStatus={panelConnection}
          minimized={activityMinimized}
          onToggleMinimize={() => setActivityMinimized(v => !v)}
        />
      </div>

      <AgentOsBottomDashboard
        totalAgents={agents.length}
        runningCount={runningCount}
        idleCount={idleCount}
        offlineCount={offlineCount}
        salesData={salesData}
        adData={adData}
        panelItems={panelItems}
        panelConnection={panelConnection}
      />

      <ActionBoardOverlay
        open={showActionBoard}
        onClose={() => setShowActionBoard(false)}
        actionTasks={actionTasks}
        urgentCount={urgentCount}
        teamStyle={teamStyle}
        allTeamTasks={allTeamTasks}
        executingId={executingId}
        onExecute={executeAction}
      />
    </div>
  );
}
