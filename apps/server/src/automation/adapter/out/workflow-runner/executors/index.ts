import { PrismaService } from '../../../../../prisma/prisma.service';
import type { AgentRunnerPort } from '../../../../../agent-os/application/port/in/agent-runner.port';
import { WorkflowContext } from '../../../../domain/service/workflow-context';

/**
 * Executor-visible service handles. The slim-core surface only exposes
 * Agent OS delegation; new executors that need other infrastructure
 * (channels, finance, etc.) must be added explicitly here so the
 * dependency surface stays auditable.
 */
export interface ExecutorServices {
  agentRunner?: AgentRunnerPort;
}

type NodeExecutorFn = (
  prisma: PrismaService,
  config: Record<string, any>,
  context: WorkflowContext,
  services?: ExecutorServices,
) => Promise<Record<string, any>>;

const EXECUTOR_REGISTRY: Map<string, NodeExecutorFn> = new Map();
const CONCURRENCY_SAFE_REGISTRY: Map<string, boolean> = new Map();

export function registerNode(
  nodeType: string,
  fn: NodeExecutorFn,
  isConcurrencySafe?: boolean,
): void {
  EXECUTOR_REGISTRY.set(nodeType, fn);
  CONCURRENCY_SAFE_REGISTRY.set(nodeType, isConcurrencySafe ?? false);
}

export function getExecutor(nodeType: string): NodeExecutorFn | undefined {
  return EXECUTOR_REGISTRY.get(nodeType);
}

export function isConcurrencySafe(nodeType: string): boolean {
  return CONCURRENCY_SAFE_REGISTRY.get(nodeType) ?? false;
}

export async function recordActivity(
  prisma: PrismaService,
  event: {
    organizationId: string;
    objectType: string;
    objectId: string;
    eventType: string;
    source: string;
    title: string;
    data?: Record<string, any>;
  },
): Promise<void> {
  await prisma.activityEvent.create({ data: event as any });
}
