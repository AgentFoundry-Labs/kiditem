import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  type CreateAgentInstanceInput,
  type InstanceToolPolicyRecord,
  type UpdateAgentInstanceInput,
  type UpsertInstanceToolPolicyInput,
} from '../../../application/port/out/repository/agent-os-repository.port';
import { AgentOsBoundaryError } from '../../../domain/agent-os.errors';
import { type AgentTaskSessionRecord } from '../../../domain/agent-os.types';
import { toInstanceRecord, toTaskSessionRecord } from './agent-os.repository.mapper';

function metadataRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function mergeTaskSessionMetadata(
  current: unknown,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const next = metadataRecord(current);
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'runtimeThreadId') {
      if (value === null) {
        next[key] = null;
        continue;
      }
      if (typeof value === 'string' && value.trim().length > 0) {
        next[key] = value.trim();
        continue;
      }
      throw new AgentOsBoundaryError(
        'task_session_metadata_invalid',
        'runtimeThreadId must be a string or null.',
      );
    }
    next[key] = value;
  }
  return next;
}

export class AgentOsInstanceSessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findActiveInstanceByType(input: { organizationId: string; type: string }) {
    const row = await this.prisma.agentInstance.findFirst({
      where: { organizationId: input.organizationId, type: input.type },
    });
    return row ? toInstanceRecord(row) : null;
  }

  async findInstanceById(input: { organizationId: string; id: string }) {
    const row = await this.prisma.agentInstance.findFirst({
      where: { id: input.id, organizationId: input.organizationId },
    });
    return row ? toInstanceRecord(row) : null;
  }

  async listInstances(input: { organizationId: string }) {
    const rows = await this.prisma.agentInstance.findMany({
      where: { organizationId: input.organizationId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toInstanceRecord);
  }

  async createInstanceWithRuntimeState(
    input: CreateAgentInstanceInput,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const instance = await tx.agentInstance.create({
        data: {
          organizationId: input.organizationId,
          type: input.type,
          name: input.name,
          role: input.role ?? 'specialist',
          title: input.title ?? null,
          icon: input.icon ?? null,
          reportsToId: input.reportsToId ?? null,
          lifecycleStatus: input.lifecycleStatus ?? 'active',
          trustLevel: input.trustLevel ?? 0,
          adapterType: input.adapterType,
          modelOverride: input.modelOverride ?? null,
          adapterConfig: (input.adapterConfig ?? {}) as Prisma.InputJsonValue,
          runtimeConfig: (input.runtimeConfig ?? {}) as Prisma.InputJsonValue,
          promptPathOverride: input.promptPathOverride ?? null,
        },
      });

      await tx.agentRuntimeState.create({
        data: {
          organizationId: input.organizationId,
          agentInstanceId: instance.id,
        },
      });

      return toInstanceRecord(instance);
    });
  }

  async updateInstance(input: UpdateAgentInstanceInput) {
    const existing = await this.prisma.agentInstance.findFirst({
      where: { id: input.id, organizationId: input.organizationId },
    });
    if (!existing) {
      throw new AgentOsBoundaryError(
        'agent_instance_not_found',
        `AgentInstance ${input.id} not found in organization ${input.organizationId}.`,
      );
    }
    const updated = await this.prisma.agentInstance.update({
      where: { id: existing.id },
      data: {
        name: input.name ?? undefined,
        role: input.role ?? undefined,
        title: input.title ?? undefined,
        icon: input.icon ?? undefined,
        reportsToId: input.reportsToId ?? undefined,
        lifecycleStatus: input.lifecycleStatus ?? undefined,
        pauseReason: input.pauseReason ?? undefined,
        trustLevel: input.trustLevel ?? undefined,
        modelOverride: input.modelOverride ?? undefined,
        adapterConfig: (input.adapterConfig as Prisma.InputJsonValue | undefined) ?? undefined,
        runtimeConfig: (input.runtimeConfig as Prisma.InputJsonValue | undefined) ?? undefined,
        promptPathOverride: input.promptPathOverride ?? undefined,
      },
    });
    return toInstanceRecord(updated);
  }

  async resolveInstanceToolPolicy(input: {
    organizationId: string;
    agentInstanceId: string;
    toolKey: string;
  }) {
    const tool = await this.prisma.agentToolDefinition.findUnique({
      where: { key: input.toolKey },
    });
    if (!tool) return null;
    const row = await this.prisma.agentInstanceToolPolicy.findFirst({
      where: {
        organizationId: input.organizationId,
        agentInstanceId: input.agentInstanceId,
        toolId: tool.id,
      },
    });
    if (!row) return null;
    return {
      organizationId: row.organizationId,
      agentInstanceId: row.agentInstanceId,
      toolId: tool.id,
      toolKey: tool.key,
      effect: row.effect as InstanceToolPolicyRecord['effect'],
      approvalMode: (row.approvalMode ?? 'none') as InstanceToolPolicyRecord['approvalMode'],
      dryRunMode: (row.dryRunMode ?? 'optional') as InstanceToolPolicyRecord['dryRunMode'],
      constraints: (row.constraints ?? {}) as Record<string, unknown>,
    } satisfies InstanceToolPolicyRecord;
  }

  async listInstanceToolPolicies(input: {
    organizationId: string;
    agentInstanceId: string;
  }) {
    const rows = await this.prisma.agentInstanceToolPolicy.findMany({
      where: {
        organizationId: input.organizationId,
        agentInstanceId: input.agentInstanceId,
      },
      include: { tool: true },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map((row) => ({
      organizationId: row.organizationId,
      agentInstanceId: row.agentInstanceId,
      toolId: row.toolId,
      toolKey: row.tool.key,
      effect: row.effect as InstanceToolPolicyRecord['effect'],
      approvalMode: (row.approvalMode ?? 'none') as InstanceToolPolicyRecord['approvalMode'],
      dryRunMode: (row.dryRunMode ?? 'optional') as InstanceToolPolicyRecord['dryRunMode'],
      constraints: (row.constraints ?? {}) as Record<string, unknown>,
    } satisfies InstanceToolPolicyRecord));
  }

  async upsertInstanceToolPolicy(input: UpsertInstanceToolPolicyInput) {
    const tool = await this.prisma.agentToolDefinition.findUnique({
      where: { key: input.toolKey },
    });
    if (!tool) {
      throw new AgentOsBoundaryError(
        'agent_tool_not_found',
        `Tool "${input.toolKey}" is not registered.`,
      );
    }
    const row = await this.prisma.agentInstanceToolPolicy.upsert({
      where: {
        organizationId_agentInstanceId_toolId: {
          organizationId: input.organizationId,
          agentInstanceId: input.agentInstanceId,
          toolId: tool.id,
        },
      },
      create: {
        organizationId: input.organizationId,
        agentInstanceId: input.agentInstanceId,
        toolId: tool.id,
        effect: input.effect,
        approvalMode: input.approvalMode ?? 'none',
        dryRunMode: input.dryRunMode ?? 'optional',
        constraints: (input.constraints ?? {}) as Prisma.InputJsonValue,
      },
      update: {
        effect: input.effect,
        approvalMode: input.approvalMode ?? 'none',
        dryRunMode: input.dryRunMode ?? 'optional',
        constraints: (input.constraints ?? {}) as Prisma.InputJsonValue,
      },
    });
    return {
      organizationId: row.organizationId,
      agentInstanceId: row.agentInstanceId,
      toolId: tool.id,
      toolKey: tool.key,
      effect: row.effect as InstanceToolPolicyRecord['effect'],
      approvalMode: (row.approvalMode ?? 'none') as InstanceToolPolicyRecord['approvalMode'],
      dryRunMode: (row.dryRunMode ?? 'optional') as InstanceToolPolicyRecord['dryRunMode'],
      constraints: (row.constraints ?? {}) as Record<string, unknown>,
    } satisfies InstanceToolPolicyRecord;
  }

  async ensureTaskSession(input: {
    organizationId: string;
    agentInstanceId: string;
    adapterType: string;
    taskKey: string;
    title?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<AgentTaskSessionRecord> {
    if (!input.taskKey || input.taskKey.length === 0) {
      throw new AgentOsBoundaryError(
        'task_key_required',
        'AgentTaskSession.taskKey must be a non-empty string.',
      );
    }
    const row = await this.prisma.agentTaskSession.upsert({
      where: {
        organizationId_agentInstanceId_adapterType_taskKey: {
          organizationId: input.organizationId,
          agentInstanceId: input.agentInstanceId,
          adapterType: input.adapterType,
          taskKey: input.taskKey,
        },
      },
      create: {
        organizationId: input.organizationId,
        agentInstanceId: input.agentInstanceId,
        adapterType: input.adapterType,
        taskKey: input.taskKey,
        title: input.title ?? null,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      },
      update: {},
    });
    return toTaskSessionRecord(row);
  }

  async getTaskSession(input: {
    organizationId: string;
    taskSessionId: string;
  }): Promise<AgentTaskSessionRecord | null> {
    const row = await this.prisma.agentTaskSession.findFirst({
      where: { id: input.taskSessionId, organizationId: input.organizationId },
    });
    return row ? toTaskSessionRecord(row) : null;
  }

  async updateTaskSessionMetadata(input: {
    organizationId: string;
    taskSessionId: string;
    metadata: Record<string, unknown>;
  }): Promise<AgentTaskSessionRecord> {
    const existing = await this.prisma.agentTaskSession.findFirst({
      where: { id: input.taskSessionId, organizationId: input.organizationId },
    });
    if (!existing) {
      throw new AgentOsBoundaryError(
        'task_session_not_found',
        `AgentTaskSession ${input.taskSessionId} not found in organization ${input.organizationId}.`,
      );
    }

    const metadata = mergeTaskSessionMetadata(existing.metadata, input.metadata);
    const updated = await this.prisma.agentTaskSession.update({
      where: { id: existing.id },
      data: {
        metadata: metadata as Prisma.InputJsonValue,
      },
    });
    return toTaskSessionRecord(updated);
  }
}
