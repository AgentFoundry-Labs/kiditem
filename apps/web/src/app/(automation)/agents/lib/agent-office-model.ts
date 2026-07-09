import type {
  AgentApprovalRequestSummary,
  AgentAuthorizationEventSummary,
  AgentConversationSummary,
  AgentCostEventSummary,
  AgentInstanceSummary,
  AgentRunRequestSummary,
  AgentRunSummary,
} from '@kiditem/shared/agent-os';

export type AgentOfficeNodeStatus =
  | 'working'
  | 'waiting'
  | 'blocked'
  | 'idle'
  | 'offline';

export interface AgentOfficeNode {
  id: string;
  name: string;
  agentType: string;
  title: string | null;
  status: AgentOfficeNodeStatus;
  x: number;
  y: number;
  activeRunCount: number;
  pendingApprovalCount: number;
  lastActivityAt: string | null;
}

export interface AgentOfficeActivity {
  id: string;
  kind:
    | 'run'
    | 'request'
    | 'approval'
    | 'cost'
    | 'authorization'
    | 'conversation';
  label: string;
  status: string;
  occurredAt: string;
  agentInstanceId: string | null;
}

export interface AgentOfficeViewModel {
  nodes: AgentOfficeNode[];
  activities: AgentOfficeActivity[];
  totals: {
    agents: number;
    working: number;
    waiting: number;
    blocked: number;
    pendingApprovals: number;
    runningRuns: number;
    totalCostMicros: string;
  };
}

export interface BuildAgentOfficeModelInput {
  instances: AgentInstanceSummary[];
  runs: AgentRunSummary[];
  requests: AgentRunRequestSummary[];
  approvals: AgentApprovalRequestSummary[];
  conversations: AgentConversationSummary[];
  costEvents: AgentCostEventSummary[];
  authorizationEvents: AgentAuthorizationEventSummary[];
  totalCostMicros: string;
}

const OFFICE_POSITIONS = [
  { x: 18, y: 24 },
  { x: 42, y: 18 },
  { x: 66, y: 28 },
  { x: 30, y: 55 },
  { x: 56, y: 58 },
  { x: 78, y: 52 },
] as const;

function latestDate(values: Array<string | null | undefined>): string | null {
  const sorted = values
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .sort((a, b) => Date.parse(b) - Date.parse(a));

  return sorted[0] ?? null;
}

function statusFor(input: {
  instance: AgentInstanceSummary;
  activeRunCount: number;
  waitingRequestCount: number;
  pendingApprovalCount: number;
}): AgentOfficeNodeStatus {
  if (input.instance.lifecycleStatus !== 'active') return 'offline';
  if (input.pendingApprovalCount > 0) return 'blocked';
  if (input.activeRunCount > 0) return 'working';
  if (input.waitingRequestCount > 0) return 'waiting';
  return 'idle';
}

function activityTime(activity: AgentOfficeActivity): number {
  const parsed = Date.parse(activity.occurredAt);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function buildAgentOfficeModel(
  input: BuildAgentOfficeModelInput,
): AgentOfficeViewModel {
  const runsByAgent = new Map<string, AgentRunSummary[]>();
  const requestsByAgent = new Map<string, AgentRunRequestSummary[]>();
  const approvalsByAgent = new Map<string, AgentApprovalRequestSummary[]>();

  for (const run of input.runs) {
    runsByAgent.set(run.agentInstanceId, [
      ...(runsByAgent.get(run.agentInstanceId) ?? []),
      run,
    ]);
  }

  for (const request of input.requests) {
    requestsByAgent.set(request.agentInstanceId, [
      ...(requestsByAgent.get(request.agentInstanceId) ?? []),
      request,
    ]);
  }

  for (const approval of input.approvals) {
    approvalsByAgent.set(approval.agentInstanceId, [
      ...(approvalsByAgent.get(approval.agentInstanceId) ?? []),
      approval,
    ]);
  }

  const nodes = input.instances.map((instance, index) => {
    const runs = runsByAgent.get(instance.id) ?? [];
    const requests = requestsByAgent.get(instance.id) ?? [];
    const approvals = approvalsByAgent.get(instance.id) ?? [];
    const activeRunCount = runs.filter((run) => run.status === 'running').length;
    const waitingRequestCount = requests.filter((request) =>
      ['pending', 'claimed'].includes(request.status),
    ).length;
    const pendingApprovalCount = approvals.filter(
      (approval) => approval.status === 'pending',
    ).length;
    const position = OFFICE_POSITIONS[index % OFFICE_POSITIONS.length];

    return {
      id: instance.id,
      name: instance.name,
      agentType: instance.type,
      title: instance.title,
      status: statusFor({
        instance,
        activeRunCount,
        waitingRequestCount,
        pendingApprovalCount,
      }),
      x: position.x,
      y: position.y,
      activeRunCount,
      pendingApprovalCount,
      lastActivityAt: latestDate([
        ...runs.map((run) => run.finishedAt ?? run.startedAt),
        ...requests.map(
          (request) =>
            request.finishedAt ??
            request.claimedAt ??
            request.scheduledFor ??
            request.createdAt,
        ),
        ...approvals.map((approval) => approval.updatedAt),
      ]),
    };
  });

  const activities: AgentOfficeActivity[] = [
    ...input.runs.map((run) => ({
      id: run.id,
      kind: 'run' as const,
      label: `실행 ${run.status}`,
      status: run.status,
      occurredAt: run.finishedAt ?? run.startedAt,
      agentInstanceId: run.agentInstanceId,
    })),
    ...input.requests.map((request) => ({
      id: request.id,
      kind: 'request' as const,
      label: `요청 ${request.status}`,
      status: request.status,
      occurredAt:
        request.finishedAt ??
        request.claimedAt ??
        request.scheduledFor ??
        request.createdAt,
      agentInstanceId: request.agentInstanceId,
    })),
    ...input.approvals.map((approval) => ({
      id: approval.id,
      kind: 'approval' as const,
      label: approval.reason ?? approval.reasonCode ?? '승인 요청',
      status: approval.status,
      occurredAt: approval.updatedAt,
      agentInstanceId: approval.agentInstanceId,
    })),
    ...input.costEvents.map((event) => ({
      id: event.id,
      kind: 'cost' as const,
      label: `${event.provider} ${event.costMicros}µ`,
      status: event.model,
      occurredAt: event.occurredAt,
      agentInstanceId: event.agentInstanceId,
    })),
    ...input.authorizationEvents.map((event) => ({
      id: event.id,
      kind: 'authorization' as const,
      label: event.reason ?? event.action,
      status: event.decision,
      occurredAt: event.createdAt,
      agentInstanceId: event.agentInstanceId,
    })),
    ...input.conversations.map((conversation) => ({
      id: conversation.id,
      kind: 'conversation' as const,
      label: conversation.title,
      status: conversation.status,
      occurredAt: conversation.lastMessageAt ?? conversation.updatedAt,
      agentInstanceId: null,
    })),
  ].sort((a, b) => activityTime(b) - activityTime(a));

  return {
    nodes,
    activities: activities.slice(0, 80),
    totals: {
      agents: nodes.length,
      working: nodes.filter((node) => node.status === 'working').length,
      waiting: nodes.filter((node) => node.status === 'waiting').length,
      blocked: nodes.filter((node) => node.status === 'blocked').length,
      pendingApprovals: input.approvals.filter(
        (approval) => approval.status === 'pending',
      ).length,
      runningRuns: input.runs.filter((run) => run.status === 'running').length,
      totalCostMicros: input.totalCostMicros,
    },
  };
}
