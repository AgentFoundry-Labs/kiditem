'use client';

import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft,
  Layers,
  MessageSquareText,
  Radio,
  Settings2,
  ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  ActionTaskSchema,
  type ActionTask,
} from '@kiditem/shared/action-task';
import type {
  AgentDefinitionSummary,
  AgentInstanceSummary,
  AgentOsLiveReadinessResponse,
  AgentRunSummary,
} from '@kiditem/shared/agent-os';
import type {
  DashboardAdSummary,
  DashboardSalesSummary,
} from '@kiditem/shared/dashboard';
import type { PanelItem } from '@kiditem/shared/panel';
import { usePanelStream } from '@/components/panel/hooks/usePanelStream';
import { usePanelStore } from '@/components/panel/lib/panel-store';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';
import { ActionBoardOverlay } from './components/ActionBoardOverlay';
import { AgentNetworkCanvas } from './components/AgentNetworkCanvas';
import { AgentOsBottomDashboard } from './components/AgentOsBottomDashboard';
import { AgentOsHeader } from './components/AgentOsHeader';
import { AgentOsObservabilityOverlay } from './components/AgentOsObservabilityOverlay';
import { AgentOsOperatorWorkspace } from './components/AgentOsOperatorWorkspace';
import { AgentOsPolicyOverlay } from './components/AgentOsPolicyOverlay';
import { AgentsListPanel } from './components/AgentsListPanel';
import { LiveActivityPanel, type RecentLog } from './components/LiveActivityPanel';
import {
  agentOsChatKeys,
  getAgentOsLiveReadiness,
  listAgentApprovals,
  listAgentInstanceToolPolicies,
  listAgentAuthorizationEvents,
  listAgentCostEvents,
  listAgentRunEvents,
  listAgentRuns,
  upsertAgentInstanceToolPolicy,
} from './lib/agent-os-chat-api';
import {
  classifyAction,
  classifyAgentCategory,
  flattenNodes,
} from './lib/agent-os-helpers';
import { type OrgNode, useTeamStyle } from './lib/agent-os-types';

const EMPTY_LIVE_READINESS: AgentOsLiveReadinessResponse = {
  checks: [],
  allReady: false,
  runnableCapabilities: [],
  blockedCapabilities: [],
};

function buildOrgNodes(
  instances: AgentInstanceSummary[],
  runningInstanceIds: Set<string>,
  definitionsByType: Map<string, AgentDefinitionSummary>,
): OrgNode[] {
  const childrenByParent = new Map<string | null, AgentInstanceSummary[]>();
  for (const instance of instances) {
    const parentId = instance.reportsToId ?? null;
    const children = childrenByParent.get(parentId) ?? [];
    children.push(instance);
    childrenByParent.set(parentId, children);
  }

  const buildNode = (instance: AgentInstanceSummary): OrgNode => {
    const reports = (childrenByParent.get(instance.id) ?? []).map(buildNode);
    const definition = definitionsByType.get(instance.type);
    return {
      id: instance.id,
      name: instance.name,
      agentType: instance.type,
      runtimeKind: definition?.runtimeKind ?? 'agent',
      type:
        instance.role === 'ceo'
          ? 'manager'
          : reports.length > 0
            ? 'manager'
            : 'specialist',
      role: instance.role,
      title: instance.title ?? instance.role,
      status: runningInstanceIds.has(instance.id) ? 'running' : 'idle',
      lastHeartbeatAt:
        instance.lifecycleStatus === 'active' ? new Date().toISOString() : null,
      reports: reports.length > 0 ? reports : undefined,
    };
  };

  return (childrenByParent.get(null) ?? []).map(buildNode);
}

export default function AgentOsPage() {
  const queryClient = useQueryClient();
  const teamStyle = useTeamStyle();
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [showActionBoard, setShowActionBoard] = useState(false);
  const [showObservability, setShowObservability] = useState(false);
  const [showPolicyOverlay, setShowPolicyOverlay] = useState(false);
  const [policyAgentId, setPolicyAgentId] = useState<string | null>(null);
  const [operatorWorkspaceOpen, setOperatorWorkspaceOpen] = useState(false);
  const [agentsMinimized, setAgentsMinimized] = useState(false);
  const [activityMinimized, setActivityMinimized] = useState(false);

  const { data: instances = [] } = useQuery({
    queryKey: ['agent-os', 'instances'],
    queryFn: () =>
      apiClient.get<AgentInstanceSummary[]>('/api/agent-os/instances'),
    refetchInterval: 30_000,
  });
  const { data: definitions = [] } = useQuery({
    queryKey: ['agent-os', 'definitions'],
    queryFn: () =>
      apiClient.get<AgentDefinitionSummary[]>('/api/agent-os/definitions'),
    staleTime: 5 * 60_000,
  });
  const { data: runningRuns = { items: [] as AgentRunSummary[] } } = useQuery({
    queryKey: ['agent-os', 'runs', 'running'],
    queryFn: () =>
      apiClient.get<{ items: AgentRunSummary[] }>(
        '/api/agent-os/runs?status=running&limit=100',
      ),
    refetchInterval: 15_000,
  });
  const {
    data: costEventsData = { items: [], totalCostMicros: '0' },
    isFetching: costEventsFetching,
  } = useQuery({
    queryKey: agentOsChatKeys.costEvents,
    queryFn: () => listAgentCostEvents(50),
    enabled: showObservability,
    refetchInterval: showObservability ? 30_000 : false,
  });
  const {
    data: authorizationEventsData = { items: [] },
    isFetching: authorizationEventsFetching,
  } = useQuery({
    queryKey: agentOsChatKeys.authorizationEvents,
    queryFn: () => listAgentAuthorizationEvents(50),
    enabled: showObservability,
    refetchInterval: showObservability ? 30_000 : false,
  });
  const {
    data: approvalsData = { items: [] },
    isFetching: approvalsFetching,
  } = useQuery({
    queryKey: agentOsChatKeys.approvals,
    queryFn: () => listAgentApprovals(50),
    enabled: showObservability,
    refetchInterval: showObservability ? 30_000 : false,
  });
  const {
    data: recentRunsData = { items: [] as AgentRunSummary[] },
    isFetching: recentRunsFetching,
  } = useQuery({
    queryKey: agentOsChatKeys.runs,
    queryFn: () => listAgentRuns(20),
    enabled: showObservability,
    refetchInterval: showObservability ? 15_000 : false,
  });
  const latestAuditRunId = recentRunsData.items[0]?.id ?? null;
  const {
    data: runEventsData = { items: [] },
    isFetching: runEventsFetching,
  } = useQuery({
    queryKey: latestAuditRunId
      ? agentOsChatKeys.runEvents(latestAuditRunId)
      : agentOsChatKeys.runEvents('none'),
    queryFn: () => listAgentRunEvents(latestAuditRunId ?? ''),
    enabled: showObservability && Boolean(latestAuditRunId),
    refetchInterval: showObservability && latestAuditRunId ? 10_000 : false,
  });
  const {
    data: liveReadinessData = EMPTY_LIVE_READINESS,
    isFetching: liveReadinessFetching,
  } = useQuery({
    queryKey: agentOsChatKeys.liveReadiness,
    queryFn: getAgentOsLiveReadiness,
    enabled: showObservability,
    refetchInterval: showObservability ? 30_000 : false,
  });
  const effectivePolicyAgentId =
    policyAgentId ?? selectedAgent ?? instances[0]?.id ?? null;
  const {
    data: policyData = { items: [] },
    isFetching: policyFetching,
  } = useQuery({
    queryKey: effectivePolicyAgentId
      ? agentOsChatKeys.instanceToolPolicies(effectivePolicyAgentId)
      : agentOsChatKeys.instanceToolPolicies('none'),
    queryFn: () => listAgentInstanceToolPolicies(effectivePolicyAgentId ?? ''),
    enabled: showPolicyOverlay && Boolean(effectivePolicyAgentId),
  });
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
      const raw = await apiClient.post<unknown>(
        `/api/action-tasks/${id}/execute`,
        {},
      );
      return ActionTaskSchema.parse(raw);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.actionTasks.list() });
      toast.success('실행 완료');
    },
    onError: () => toast.error('실행 실패'),
  });
  const { mutate: savePolicy, variables: savingPolicy } = useMutation({
    mutationFn: async (input: {
      agentInstanceId: string;
      toolKey: string;
      effect: 'allow' | 'deny' | 'approval_required';
      approvalMode: 'none' | 'admin' | 'self';
      dryRunMode: 'optional' | 'required' | 'disabled';
      constraints: Record<string, unknown>;
    }) =>
      upsertAgentInstanceToolPolicy(input.agentInstanceId, input.toolKey, {
        effect: input.effect,
        approvalMode: input.approvalMode,
        dryRunMode: input.dryRunMode,
        constraints: input.constraints,
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: agentOsChatKeys.instanceToolPolicies(variables.agentInstanceId),
      });
      queryClient.invalidateQueries({
        queryKey: agentOsChatKeys.authorizationEvents,
      });
      toast.success('정책 저장 완료');
    },
    onError: () => toast.error('정책 저장 실패'),
  });

  const definitionsByType = useMemo(
    () => new Map(definitions.map((definition) => [definition.type, definition])),
    [definitions],
  );
  const orgNodes = useMemo(() => {
    const runningIds = new Set(
      runningRuns.items.map((run) => run.agentInstanceId),
    );
    return buildOrgNodes(instances, runningIds, definitionsByType);
  }, [definitionsByType, instances, runningRuns]);

  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['agent-os'] });
    queryClient.invalidateQueries({ queryKey: queryKeys.actionTasks.list() });
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
  }, [queryClient]);

  usePanelStream();
  const panelById = usePanelStore((state) => state.byId);
  const panelConnection = usePanelStore((state) => state.connectionStatus);

  const managerNode = useMemo(
    () =>
      orgNodes.find(
        (node) => node.agentType === 'manager' || node.runtimeKind === 'coordinator',
      ) ?? orgNodes[0],
    [orgNodes],
  );
  const ceo = useMemo(() => {
    if (!managerNode) return undefined;
    const existingReports = managerNode.reports ?? [];
    const existingReportIds = new Set(existingReports.map((node) => node.id));
    const rootPeers = orgNodes.filter(
      (node) => node.id !== managerNode.id && !existingReportIds.has(node.id),
    );
    return {
      ...managerNode,
      reports: [...existingReports, ...rootPeers],
    };
  }, [managerNode, orgNodes]);
  const teams = useMemo<OrgNode[]>(() => {
    const directReports = ceo?.reports ?? orgNodes;
    const explicitTeams = directReports.filter((node) => node.type === 'team');
    if (explicitTeams.length > 0) return explicitTeams;

    const grouped = new Map<string, OrgNode[]>();
    const groupedTools = new Map<string, OrgNode[]>();
    const generatedTeams: OrgNode[] = [];
    for (const unit of directReports) {
      if (unit.type === 'team' || unit.role === 'manager' || unit.type === 'manager') {
        continue;
      }
      const category = classifyAgentCategory(unit);
      const target = unit.runtimeKind === 'tool_wrapper' ? groupedTools : grouped;
      const group = target.get(category) ?? [];
      group.push({ ...unit, category });
      target.set(category, group);
    }

    for (const [category, style] of Object.entries(teamStyle)) {
      const reports = grouped.get(category) ?? [];
      const tools = groupedTools.get(category) ?? [];
      if (reports.length === 0 && tools.length === 0) continue;
      const status = [...reports, ...tools].some(
        (unit) => unit.status === 'running',
      )
        ? 'running'
        : 'idle';
      generatedTeams.push({
        id: `team-${category}`,
        name: style.label,
        type: 'team',
        role: 'team',
        title: style.label,
        status,
        category,
        reports: reports.length > 0 ? reports : undefined,
        tools: tools.length > 0 ? tools : undefined,
      });
    }
    for (const [category, reports] of grouped) {
      if (teamStyle[category]) continue;
      const tools = groupedTools.get(category) ?? [];
      const status = [...reports, ...tools].some(
        (unit) => unit.status === 'running',
      )
        ? 'running'
        : 'idle';
      generatedTeams.push({
        id: `team-${category}`,
        name: category,
        type: 'team',
        role: 'team',
        title: category,
        status,
        category,
        reports,
        tools: tools.length > 0 ? tools : undefined,
      });
    }
    return generatedTeams;
  }, [ceo, orgNodes, teamStyle]);

  const allAgents = useMemo(() => {
    const byId = new Map<string, OrgNode>();
    for (const agent of flattenNodes(orgNodes)) byId.set(agent.id, agent);
    for (const agent of teams.flatMap((team) => team.reports ?? [])) {
      byId.set(agent.id, agent);
    }
    for (const tool of teams.flatMap((team) => team.tools ?? [])) {
      byId.set(tool.id, tool);
    }
    return Array.from(byId.values());
  }, [orgNodes, teams]);
  const agents = useMemo(
    () => teams.flatMap((team) => team.reports ?? []),
    [teams],
  );
  const executionTools = useMemo(
    () => teams.flatMap((team) => team.tools ?? []),
    [teams],
  );
  const agentRoster = useMemo(
    () => (ceo && ceo.runtimeKind !== 'tool_wrapper' ? [ceo, ...agents] : agents),
    [agents, ceo],
  );

  const allTeamTasks = useMemo(() => {
    const out: Record<string, ActionTask[]> = {};
    for (const category of Object.keys(teamStyle)) out[category] = [];
    for (const task of actionTasks) {
      const category = classifyAction(task);
      (out[category] ?? out.analytics).push(task);
    }
    return out;
  }, [actionTasks, teamStyle]);

  const teamTaskCounts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [category, tasks] of Object.entries(allTeamTasks)) {
      out[category] = tasks.filter((task) => task.type === 'ai').length;
    }
    return out;
  }, [allTeamTasks]);

  const aiActions = useMemo(
    () => actionTasks.filter((task) => task.type === 'ai'),
    [actionTasks],
  );
  const runningCount = useMemo(
    () => agentRoster.filter((agent) => agent.status === 'running').length,
    [agentRoster],
  );
  const idleCount = useMemo(
    () =>
      agentRoster.filter(
        (agent) => agent.status !== 'running' && agent.lastHeartbeatAt,
      ).length,
    [agentRoster],
  );
  const offlineCount = useMemo(
    () => agentRoster.filter((agent) => !agent.lastHeartbeatAt).length,
    [agentRoster],
  );
  const urgentCount = useMemo(
    () => aiActions.filter((task) => task.priority === 'urgent').length,
    [aiActions],
  );

  const selectedData = selectedAgent
    ? allAgents.find((agent) => agent.id === selectedAgent)
    : null;

  const panelItems = useMemo(() => {
    return Object.values(panelById)
      .filter((item): item is PanelItem & { kind: 'run' } => item.kind === 'run')
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      )
      .slice(0, 15);
  }, [panelById]);

  const recentLogs = useMemo<RecentLog[]>(() => {
    const logs: RecentLog[] = [];
    for (const task of actionTasks) {
      for (const log of task.activityLog) {
        logs.push({
          taskId: task.id,
          taskLabel: task.label,
          role: task.role,
          action: log.action,
          timestamp: log.timestamp,
          detail: log.detail,
          success: log.success,
        });
      }
    }
    return logs
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 25);
  }, [actionTasks]);

  const select = (id: string) => setSelectedAgent((previous) => (previous === id ? null : id));
  const title = selectedData?.name ?? ceo?.name ?? 'Agent Network';
  const openPolicyOverlay = () => {
    setPolicyAgentId(selectedAgent ?? instances[0]?.id ?? null);
    setShowPolicyOverlay(true);
  };

  return (
    <div
      data-testid="agent-os-shell"
      className="fixed inset-0 flex flex-col overflow-hidden bg-[#0a0f1a] text-white max-md:overflow-y-auto"
    >
      <AgentOsHeader ceoName={ceo?.name ?? null} onRefresh={handleRefresh} />

      <div className="flex shrink-0 items-center justify-between px-5 pb-3 max-md:px-3">
        <div className="flex min-w-0 items-center gap-2">
          {selectedData ? (
            <button
              type="button"
              onClick={() => setSelectedAgent(null)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/[0.04]"
              aria-label="선택 해제"
            >
              <ChevronLeft size={17} />
            </button>
          ) : null}
          <span className="min-w-0 truncate text-[18px] font-bold max-md:text-[17px]">
            {title}
          </span>
          {runningCount > 0 ? (
            <span className="ml-2 flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              {runningCount} RUNNING
            </span>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setOperatorWorkspaceOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-300/30 bg-cyan-300/10 text-cyan-100 hover:border-cyan-200"
            aria-label="Operator 대화"
          >
            <MessageSquareText size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setShowActionBoard((value) => !value)}
            className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-[#111827] text-slate-400 hover:bg-white/[0.04]"
            aria-label="액션 보드"
          >
            <Layers size={15} />
            {urgentCount > 0 ? (
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-400" />
            ) : null}
          </button>
          <button
            type="button"
            onClick={openPolicyOverlay}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-[#111827] text-slate-400 hover:bg-white/[0.04]"
            aria-label="정책 설정"
          >
            <Settings2 size={15} />
          </button>
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-[#111827] text-slate-400 hover:bg-white/[0.04]"
            aria-label="패널 연결"
          >
            <Radio
              size={15}
              className={cn(panelConnection === 'connected' && 'text-emerald-400')}
            />
          </button>
          <button
            type="button"
            onClick={() => setShowObservability((value) => !value)}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-[#111827] text-slate-400 hover:bg-white/[0.04]"
            aria-label="운영 감사"
          >
            <ShieldCheck size={15} />
          </button>
        </div>
      </div>

      <div className="relative mx-5 min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/10 bg-[#0d1321] max-md:mx-3 max-md:h-[520px] max-md:min-h-[520px] max-md:flex-none">
        <AgentNetworkCanvas
          ceo={ceo}
          teams={teams}
          teamStyle={teamStyle}
          teamTaskCounts={teamTaskCounts}
          selectedAgent={selectedAgent}
          onSelect={select}
        />
        <AgentsListPanel
          agents={agentRoster}
          tools={executionTools}
          teams={teams}
          teamStyle={teamStyle}
          selectedAgent={selectedAgent}
          minimized={agentsMinimized}
          onToggleMinimize={() => setAgentsMinimized((value) => !value)}
          onSelect={select}
        />
        <LiveActivityPanel
          panelItems={panelItems}
          recentLogs={recentLogs}
          connectionStatus={panelConnection}
          minimized={activityMinimized}
          onToggleMinimize={() => setActivityMinimized((value) => !value)}
        />
      </div>

      <AgentOsBottomDashboard
        totalAgents={agentRoster.length}
        totalTools={executionTools.length}
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
      <AgentOsObservabilityOverlay
        open={showObservability}
        onClose={() => setShowObservability(false)}
        costEvents={costEventsData.items}
        totalCostMicros={costEventsData.totalCostMicros}
        authorizationEvents={authorizationEventsData.items}
        approvals={approvalsData.items}
        runs={recentRunsData.items}
        runEvents={runEventsData.items}
        liveReadiness={liveReadinessData}
        loading={
          costEventsFetching ||
          authorizationEventsFetching ||
          approvalsFetching ||
          recentRunsFetching ||
          runEventsFetching ||
          liveReadinessFetching
        }
      />
      <AgentOsPolicyOverlay
        open={showPolicyOverlay}
        onClose={() => setShowPolicyOverlay(false)}
        agents={instances}
        selectedAgentId={effectivePolicyAgentId}
        policies={policyData.items}
        loading={policyFetching}
        savingToolKey={savingPolicy?.toolKey ?? null}
        onSelectAgent={setPolicyAgentId}
        onSavePolicy={(toolKey, policy) => {
          if (!effectivePolicyAgentId) return;
          savePolicy({
            agentInstanceId: effectivePolicyAgentId,
            toolKey,
            ...policy,
          });
        }}
      />
      <AgentOsOperatorWorkspace
        open={operatorWorkspaceOpen}
        onClose={() => setOperatorWorkspaceOpen(false)}
      />
    </div>
  );
}
