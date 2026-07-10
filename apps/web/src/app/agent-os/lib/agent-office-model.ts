import type {
  AgentApprovalRequestSummary,
  AgentAuthorizationEventSummary,
  AgentConversationSummary,
  AgentCostEventSummary,
  AgentInstanceSummary,
  AgentRunRequestSummary,
  AgentRunSummary,
} from '@kiditem/shared/agent-os';
import {
  resolveAgentUnitTaxonomy,
  type AgentUnitOperationalRole,
} from './agent-unit-taxonomy';

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
  displayName: string;
  responsibility: string;
  status: AgentOfficeNodeStatus;
  activeRunCount: number;
  pendingApprovalCount: number;
  lastActivityAt: string | null;
  trustLevel: number;
  adapterType: string;
  effectiveModel: string;
  capabilities: AgentOfficeCapability[];
}

export interface AgentOfficeCapability {
  id: string;
  name: string;
  agentType: string;
  title: string | null;
  displayName: string;
  responsibility: string;
  ownerAgentType: string | null;
  ownerNodeId: string | null;
  status: AgentOfficeNodeStatus;
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
  capabilities: AgentOfficeCapability[];
  activities: AgentOfficeActivity[];
  totals: {
    agents: number;
    employees: number;
    capabilities: number;
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

interface AgentOfficeUnit {
  id: string;
  name: string;
  agentType: string;
  title: string | null;
  displayName: string;
  responsibility: string;
  role: AgentUnitOperationalRole;
  ownerAgentType: string | null;
  instance: AgentInstanceSummary;
  activeRunCount: number;
  waitingRequestCount: number;
  pendingApprovalCount: number;
  lastActivityAt: string | null;
  status: AgentOfficeNodeStatus;
}

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

  const units: AgentOfficeUnit[] = input.instances.map((instance) => {
    const runs = runsByAgent.get(instance.id) ?? [];
    const requests = requestsByAgent.get(instance.id) ?? [];
    const approvals = approvalsByAgent.get(instance.id) ?? [];
    const taxonomy = resolveAgentUnitTaxonomy({
      type: instance.type,
      name: instance.name,
      role: instance.role,
      title: instance.title,
    });
    const runningRunCount = runs.filter((run) => run.status === 'running').length;
    const claimedRequestCount = requests.filter(
      (request) => request.status === 'claimed',
    ).length;
    const activeRunCount =
      runningRunCount > 0 ? runningRunCount : claimedRequestCount;
    const waitingRequestCount = requests.filter(
      (request) => request.status === 'pending',
    ).length;
    const pendingApprovalCount = approvals.filter(
      (approval) => approval.status === 'pending',
    ).length;

    return {
      id: instance.id,
      name: instance.name,
      agentType: instance.type,
      title: instance.title,
      displayName: taxonomy.displayName,
      responsibility: taxonomy.responsibility,
      role: taxonomy.role,
      ownerAgentType: taxonomy.ownerAgentType,
      instance,
      status: statusFor({
        instance,
        activeRunCount,
        waitingRequestCount,
        pendingApprovalCount,
      }),
      activeRunCount,
      waitingRequestCount,
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

  const employeeUnits = units.filter((unit) => unit.role === 'employee');
  const capabilityUnits = units.filter((unit) => unit.role === 'capability');
  const nodeIdByAgentType = new Map(
    employeeUnits.map((unit) => [unit.agentType, unit.id]),
  );

  const capabilities: AgentOfficeCapability[] = capabilityUnits.map((unit) => ({
    id: unit.id,
    name: unit.name,
    agentType: unit.agentType,
    title: unit.title,
    displayName: unit.displayName,
    responsibility: unit.responsibility,
    ownerAgentType: unit.ownerAgentType,
    ownerNodeId: unit.ownerAgentType
      ? nodeIdByAgentType.get(unit.ownerAgentType) ?? null
      : null,
    status: unit.status,
    activeRunCount: unit.activeRunCount,
    pendingApprovalCount: unit.pendingApprovalCount,
    lastActivityAt: unit.lastActivityAt,
  }));

  const capabilitiesByOwnerNodeId = new Map<string, AgentOfficeCapability[]>();
  for (const capability of capabilities) {
    if (!capability.ownerNodeId) continue;
    capabilitiesByOwnerNodeId.set(capability.ownerNodeId, [
      ...(capabilitiesByOwnerNodeId.get(capability.ownerNodeId) ?? []),
      capability,
    ]);
  }

  const nodes = employeeUnits.map((unit) => {
    const ownedCapabilities = capabilitiesByOwnerNodeId.get(unit.id) ?? [];
    const activeRunCount =
      unit.activeRunCount +
      ownedCapabilities.reduce(
        (sum, capability) => sum + capability.activeRunCount,
        0,
      );
    const pendingApprovalCount =
      unit.pendingApprovalCount +
      ownedCapabilities.reduce(
        (sum, capability) => sum + capability.pendingApprovalCount,
        0,
      );
    const capabilityWaitingCount = capabilityUnits
      .filter(
        (capability) =>
          capability.ownerAgentType === unit.agentType &&
          nodeIdByAgentType.get(capability.ownerAgentType) === unit.id,
      )
      .reduce((sum, capability) => sum + capability.waitingRequestCount, 0);

    return {
      id: unit.id,
      name: unit.name,
      agentType: unit.agentType,
      title: unit.title,
      displayName: unit.displayName,
      responsibility: unit.responsibility,
      status: statusFor({
        instance: unit.instance,
        activeRunCount,
        waitingRequestCount: unit.waitingRequestCount + capabilityWaitingCount,
        pendingApprovalCount,
      }),
      activeRunCount,
      pendingApprovalCount,
      lastActivityAt: latestDate([
        unit.lastActivityAt,
        ...ownedCapabilities.map((capability) => capability.lastActivityAt),
      ]),
      trustLevel: unit.instance.trustLevel,
      adapterType: unit.instance.adapterType,
      effectiveModel: unit.instance.effectiveModel,
      capabilities: ownedCapabilities,
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
    capabilities,
    activities: activities.slice(0, 80),
    totals: {
      agents: nodes.length,
      employees: nodes.length,
      capabilities: capabilities.length,
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
