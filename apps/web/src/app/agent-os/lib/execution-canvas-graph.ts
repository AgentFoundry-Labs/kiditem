import type {
  AgentArtifactSummary,
  AgentRunGraph,
  AgentRunGraphNode,
  AgentToolInvocationSummary,
} from '@kiditem/shared/agent-os';

export type ExecutionCanvasStatus =
  | 'waiting'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'waiting_approval'
  | 'skipped';

export type ExecutionCanvasNodeKind =
  | 'agent'
  | 'tool'
  | 'artifact'
  | 'approval';

export interface ExecutionCanvasNode {
  id: string;
  sourceId: string;
  kind: ExecutionCanvasNodeKind;
  laneId: string;
  label: string;
  status: ExecutionCanvasStatus;
  startedAt: string | null;
  finishedAt: string | null;
  timestamp: string | null;
  href: string | null;
  metadata: Record<string, string>;
}

export interface ExecutionCanvasLane {
  id: string;
  label: string;
  nodes: ExecutionCanvasNode[];
  status: ExecutionCanvasStatus;
  timestamp: string | null;
}

export interface ExecutionCanvasEdge {
  id: string;
  from: string;
  to: string;
  crossLane: boolean;
}

export interface ExecutionCanvasGraph {
  lanes: ExecutionCanvasLane[];
  nodes: ExecutionCanvasNode[];
  edges: ExecutionCanvasEdge[];
  summary: {
    totalLanes: number;
    totalNodes: number;
    totalEdges: number;
    runningNodes: number;
    waitingApprovalNodes: number;
    approvalNodes: number;
    failedNodes: number;
    succeededNodes: number;
  };
}

type TimestampInput = string | null | undefined;

const EMPTY_GRAPH: ExecutionCanvasGraph = {
  lanes: [],
  nodes: [],
  edges: [],
  summary: {
    totalLanes: 0,
    totalNodes: 0,
    totalEdges: 0,
    runningNodes: 0,
    waitingApprovalNodes: 0,
    approvalNodes: 0,
    failedNodes: 0,
    succeededNodes: 0,
  },
};

export function toExecutionCanvasStatus(
  status: string | null | undefined,
): ExecutionCanvasStatus {
  switch (status) {
    case 'pending':
    case 'claimed':
    case 'requested':
      return 'waiting';
    case 'running':
      return 'running';
    case 'active':
    case 'approved':
    case 'succeeded':
      return 'succeeded';
    case 'failed':
    case 'rejected':
    case 'expired':
      return 'failed';
    case 'requires_approval':
    case 'waiting_approval':
      return 'waiting_approval';
    case 'cancelled':
    case 'coalesced':
    case 'deleted':
    case 'skipped':
    case 'superseded':
      return 'skipped';
    default:
      return 'waiting';
  }
}

export function projectAgentRunGraph(
  graph: AgentRunGraph | null | undefined,
): ExecutionCanvasGraph {
  if (!graph) {
    return EMPTY_GRAPH;
  }

  const taskById = new Map(
    graph.nodes
      .filter((node) => node.kind === 'agent_task')
      .map((node) => [node.id, node]),
  );
  const toolById = new Map(graph.toolInvocations.map((tool) => [tool.id, tool]));
  const laneByRequestId = new Map<string, string>();
  const sequenceByNodeId = new Map<string, number>();
  const nodes: ExecutionCanvasNode[] = [];

  for (const task of taskById.values()) {
    laneByRequestId.set(task.id, laneIdFromTask(task));
  }

  for (const task of taskById.values()) {
    addNode(nodes, sequenceByNodeId, taskToCanvasNode(task));
  }

  for (const tool of graph.toolInvocations) {
    addNode(
      nodes,
      sequenceByNodeId,
      toolToCanvasNode(tool, laneIdForTool(tool, taskById, laneByRequestId)),
    );

    if (tool.status === 'waiting_approval' && tool.approvalRequestId) {
      addNode(
        nodes,
        sequenceByNodeId,
        approvalToCanvasNode(
          tool,
          laneIdForTool(tool, taskById, laneByRequestId),
        ),
      );
    }
  }

  for (const artifact of graph.artifacts) {
    addNode(
      nodes,
      sequenceByNodeId,
      artifactToCanvasNode(
        artifact,
        laneIdForArtifact(artifact, taskById, toolById, laneByRequestId),
      ),
    );
  }

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const edges = buildEdges(graph, nodeById);
  const lanes = buildLanes(nodes, sequenceByNodeId);
  const sortedNodes = lanes.flatMap((lane) => lane.nodes);

  return {
    lanes,
    nodes: sortedNodes,
    edges,
    summary: {
      totalLanes: lanes.length,
      totalNodes: sortedNodes.length,
      totalEdges: edges.length,
      runningNodes: sortedNodes.filter((node) => node.status === 'running')
        .length,
      waitingApprovalNodes: sortedNodes.filter(
        (node) => node.status === 'waiting_approval',
      ).length,
      approvalNodes: sortedNodes.filter((node) => node.kind === 'approval')
        .length,
      failedNodes: sortedNodes.filter((node) => node.status === 'failed')
        .length,
      succeededNodes: sortedNodes.filter((node) => node.status === 'succeeded')
        .length,
    },
  };
}

export function getExecutionCanvasNode(
  graph: ExecutionCanvasGraph,
  nodeId: string,
): ExecutionCanvasNode | null {
  return graph.nodes.find((node) => node.id === nodeId) ?? null;
}

function addNode(
  nodes: ExecutionCanvasNode[],
  sequenceByNodeId: Map<string, number>,
  node: ExecutionCanvasNode,
) {
  sequenceByNodeId.set(node.id, nodes.length);
  nodes.push(node);
}

function taskToCanvasNode(task: AgentRunGraphNode): ExecutionCanvasNode {
  const timestamp = earliestTimestamp(task.startedAt, task.finishedAt);

  return {
    id: taskNodeId(task.id),
    sourceId: task.id,
    kind: 'agent',
    laneId: laneIdFromTask(task),
    label: task.label,
    status: toExecutionCanvasStatus(task.status),
    startedAt: task.startedAt,
    finishedAt: task.finishedAt,
    timestamp,
    href: null,
    metadata: compactMetadata({
      agentType: task.agentType,
      capabilityKey: task.capabilityKey,
      duration: durationLabel(task.startedAt, task.finishedAt),
    }),
  };
}

function toolToCanvasNode(
  tool: AgentToolInvocationSummary,
  laneId: string,
): ExecutionCanvasNode {
  const timestamp = earliestTimestamp(
    tool.createdAt,
    tool.startedAt,
    tool.completedAt,
  );

  return {
    id: toolNodeId(tool.id),
    sourceId: tool.id,
    kind: 'tool',
    laneId,
    label: formatCapabilityLabel(tool.capabilityKey),
    status: toExecutionCanvasStatus(tool.status),
    startedAt: tool.startedAt,
    finishedAt: tool.completedAt,
    timestamp,
    href: null,
    metadata: compactMetadata({
      capabilityKey: tool.capabilityKey,
      resourceType: tool.resourceType,
      resourceId: tool.resourceId,
      policyDecision: tool.policyDecision,
      reasonCode: tool.reasonCode,
      requestId: tool.requestId,
      runId: tool.runId,
      approvalRequestId: tool.approvalRequestId,
      duration: durationLabel(tool.startedAt, tool.completedAt),
    }),
  };
}

function artifactToCanvasNode(
  artifact: AgentArtifactSummary,
  laneId: string,
): ExecutionCanvasNode {
  return {
    id: artifactNodeId(artifact.id),
    sourceId: artifact.id,
    kind: 'artifact',
    laneId,
    label: artifact.title,
    status: toExecutionCanvasStatus(artifact.status),
    startedAt: artifact.createdAt,
    finishedAt: null,
    timestamp: artifact.createdAt,
    href: artifact.href,
    metadata: compactMetadata({
      artifactType: artifact.artifactType,
      targetDomain: artifact.targetDomain,
      targetModel: artifact.targetModel,
      targetId: artifact.targetId,
      requestId: artifact.requestId,
      runId: artifact.runId,
    }),
  };
}

function approvalToCanvasNode(
  tool: AgentToolInvocationSummary,
  laneId: string,
): ExecutionCanvasNode {
  const timestamp = earliestTimestamp(
    tool.createdAt,
    tool.startedAt,
    tool.completedAt,
  );

  return {
    id: approvalNodeId(tool.approvalRequestId ?? tool.id),
    sourceId: tool.approvalRequestId ?? tool.id,
    kind: 'approval',
    laneId,
    label: `Approval: ${formatCapabilityLabel(tool.capabilityKey)}`,
    status: 'waiting_approval',
    startedAt: tool.startedAt,
    finishedAt: tool.completedAt,
    timestamp,
    href: null,
    metadata: compactMetadata({
      approvalRequestId: tool.approvalRequestId,
      capabilityKey: tool.capabilityKey,
      policyDecision: tool.policyDecision,
      reasonCode: tool.reasonCode,
      requestId: tool.requestId,
      runId: tool.runId,
    }),
  };
}

function buildLanes(
  nodes: ExecutionCanvasNode[],
  sequenceByNodeId: Map<string, number>,
): ExecutionCanvasLane[] {
  const laneNodes = new Map<string, ExecutionCanvasNode[]>();

  for (const node of nodes) {
    const lane = laneNodes.get(node.laneId) ?? [];
    lane.push(node);
    laneNodes.set(node.laneId, lane);
  }

  const lanes = [...laneNodes.entries()].map(([id, laneNodeList]) => {
    const sortedNodes = [...laneNodeList].sort((left, right) => {
      const timestampDelta =
        timestampSortValue(left.timestamp) - timestampSortValue(right.timestamp);

      if (timestampDelta !== 0) {
        return timestampDelta;
      }

      return (
        (sequenceByNodeId.get(left.id) ?? 0) -
        (sequenceByNodeId.get(right.id) ?? 0)
      );
    });

    return {
      id,
      label: formatLaneLabel(id),
      nodes: sortedNodes,
      status: laneStatus(sortedNodes),
      timestamp: earliestTimestamp(...sortedNodes.map((node) => node.timestamp)),
    };
  });

  return lanes.sort((left, right) => {
    if (left.id === 'operator') {
      return -1;
    }

    if (right.id === 'operator') {
      return 1;
    }

    const timestampDelta =
      timestampSortValue(left.timestamp) - timestampSortValue(right.timestamp);

    if (timestampDelta !== 0) {
      return timestampDelta;
    }

    return left.id.localeCompare(right.id);
  });
}

function buildEdges(
  graph: AgentRunGraph,
  nodeById: Map<string, ExecutionCanvasNode>,
): ExecutionCanvasEdge[] {
  const edges: ExecutionCanvasEdge[] = [];
  const edgeIds = new Set<string>();

  const addEdge = (from: string, to: string) => {
    const sourceNode = nodeById.get(from);
    const targetNode = nodeById.get(to);

    if (!sourceNode || !targetNode) {
      return;
    }

    const id = `${from}->${to}`;
    if (edgeIds.has(id)) {
      return;
    }

    edgeIds.add(id);
    edges.push({
      id,
      from,
      to,
      crossLane: sourceNode.laneId !== targetNode.laneId,
    });
  };

  for (const task of graph.nodes) {
    if (task.kind !== 'agent_task' || !task.parentId) {
      continue;
    }

    addEdge(taskNodeId(task.parentId), taskNodeId(task.id));
  }

  for (const tool of graph.toolInvocations) {
    if (tool.requestId) {
      addEdge(taskNodeId(tool.requestId), toolNodeId(tool.id));
    }

    if (tool.status === 'waiting_approval' && tool.approvalRequestId) {
      addEdge(toolNodeId(tool.id), approvalNodeId(tool.approvalRequestId));
    }
  }

  for (const artifact of graph.artifacts) {
    if (artifact.toolInvocationId) {
      addEdge(toolNodeId(artifact.toolInvocationId), artifactNodeId(artifact.id));
      continue;
    }

    if (artifact.requestId) {
      addEdge(taskNodeId(artifact.requestId), artifactNodeId(artifact.id));
    }
  }

  return edges;
}

function laneStatus(nodes: ExecutionCanvasNode[]): ExecutionCanvasStatus {
  if (nodes.some((node) => node.status === 'failed')) {
    return 'failed';
  }

  if (nodes.some((node) => node.status === 'waiting_approval')) {
    return 'waiting_approval';
  }

  if (nodes.some((node) => node.status === 'running')) {
    return 'running';
  }

  if (nodes.some((node) => node.status === 'waiting')) {
    return 'waiting';
  }

  if (nodes.some((node) => node.status === 'succeeded')) {
    return 'succeeded';
  }

  return 'skipped';
}

function laneIdFromTask(task: AgentRunGraphNode): string {
  return normalizeLaneId(
    task.agentType ?? agentTypeFromCapability(task.capabilityKey) ?? task.label,
  );
}

function laneIdForTool(
  tool: AgentToolInvocationSummary,
  taskById: Map<string, AgentRunGraphNode>,
  laneByRequestId: Map<string, string>,
): string {
  if (tool.requestId) {
    const requestLaneId = laneByRequestId.get(tool.requestId);
    if (requestLaneId) {
      return requestLaneId;
    }

    const task = taskById.get(tool.requestId);
    if (task) {
      return laneIdFromTask(task);
    }
  }

  return normalizeLaneId(
    agentTypeFromCapability(tool.capabilityKey) ?? tool.resourceType ?? 'tools',
  );
}

function laneIdForArtifact(
  artifact: AgentArtifactSummary,
  taskById: Map<string, AgentRunGraphNode>,
  toolById: Map<string, AgentToolInvocationSummary>,
  laneByRequestId: Map<string, string>,
): string {
  if (artifact.requestId) {
    const requestLaneId = laneByRequestId.get(artifact.requestId);
    if (requestLaneId) {
      return requestLaneId;
    }

    const task = taskById.get(artifact.requestId);
    if (task) {
      return laneIdFromTask(task);
    }
  }

  if (artifact.toolInvocationId) {
    const tool = toolById.get(artifact.toolInvocationId);
    if (tool) {
      return laneIdForTool(tool, taskById, laneByRequestId);
    }
  }

  return normalizeLaneId(artifact.targetDomain || artifact.artifactType);
}

function normalizeLaneId(value: string | null | undefined): string {
  const normalized = value
    ?.trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return normalized || 'agent';
}

function agentTypeFromCapability(
  capabilityKey: string | null | undefined,
): string | null {
  const [firstSegment] = capabilityKey?.split('_') ?? [];
  return firstSegment?.trim() || null;
}

function formatLaneLabel(laneId: string): string {
  return laneId
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function formatCapabilityLabel(capabilityKey: string): string {
  return capabilityKey
    .split('_')
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function compactMetadata(
  entries: Record<string, string | number | null | undefined>,
): Record<string, string> {
  const metadata: Record<string, string> = {};

  for (const [key, value] of Object.entries(entries)) {
    if (value === null || value === undefined || value === '') {
      continue;
    }

    metadata[key] = String(value).slice(0, 160);
  }

  return metadata;
}

function durationLabel(
  startedAt: TimestampInput,
  finishedAt: TimestampInput,
): string | null {
  const started = timestampSortValue(startedAt);
  const finished = timestampSortValue(finishedAt);

  if (!Number.isFinite(started) || !Number.isFinite(finished)) {
    return null;
  }

  const seconds = Math.max(0, Math.round((finished - started) / 1000));
  return `${seconds}s`;
}

function earliestTimestamp(...timestamps: TimestampInput[]): string | null {
  let earliest: { value: string; time: number } | null = null;

  for (const value of timestamps) {
    const time = timestampSortValue(value);
    if (!Number.isFinite(time)) {
      continue;
    }

    if (!earliest || time < earliest.time) {
      earliest = { value: value as string, time };
    }
  }

  return earliest?.value ?? null;
}

function timestampSortValue(timestamp: TimestampInput): number {
  if (!timestamp) {
    return Number.POSITIVE_INFINITY;
  }

  const value = Date.parse(timestamp);
  return Number.isNaN(value) ? Number.POSITIVE_INFINITY : value;
}

function taskNodeId(id: string): string {
  return `task:${id}`;
}

function toolNodeId(id: string): string {
  return `tool:${id}`;
}

function artifactNodeId(id: string): string {
  return `artifact:${id}`;
}

function approvalNodeId(id: string): string {
  return `approval:${id}`;
}
