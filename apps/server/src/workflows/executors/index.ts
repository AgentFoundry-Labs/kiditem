import { PrismaService } from '../../prisma/prisma.service';
import { WorkflowContext } from '../context';
import type { NodeDefinition } from './types';

export type NodeExecutorFn = (
  prisma: PrismaService,
  config: Record<string, any>,
  context: WorkflowContext,
) => Promise<Record<string, any>>;

const EXECUTOR_REGISTRY: Map<string, NodeExecutorFn> = new Map();
const DEFINITION_REGISTRY: Map<string, NodeDefinition> = new Map();

export function registerNode(
  nodeType: string,
  fn: NodeExecutorFn,
  definition?: NodeDefinition,
): void {
  EXECUTOR_REGISTRY.set(nodeType, fn);
  if (definition) {
    DEFINITION_REGISTRY.set(nodeType, definition);
  }
}

export function getExecutor(nodeType: string): NodeExecutorFn | undefined {
  return EXECUTOR_REGISTRY.get(nodeType);
}

export function getNodeDefinition(nodeType: string): NodeDefinition | undefined {
  return DEFINITION_REGISTRY.get(nodeType);
}

export function listNodeTypes(): string[] {
  return [...EXECUTOR_REGISTRY.keys()];
}

export function listNodeDefinitions(): NodeDefinition[] {
  return [...DEFINITION_REGISTRY.values()];
}

export async function recordActivity(
  prisma: PrismaService,
  event: {
    companyId: string;
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
