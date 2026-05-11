import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  type CreateAuthorizationEventInput,
  type FindAuthorizationEventsQuery,
  type FindCostEventsQuery,
  type RecordCostEventInput,
} from '../../../application/port/out/agent-os-repository.port';
import { type AgentAuthorizationDecision } from '../../../domain/agent-os.types';
import { clampLimit } from './agent-os.repository.mapper';

export class AgentOsCostAuditRepository {
  constructor(private readonly prisma: PrismaService) {}

  async recordCostEvent(input: RecordCostEventInput) {
    await this.prisma.$transaction(async (tx) => {
      await tx.agentCostEvent.create({
        data: {
          organizationId: input.organizationId,
          agentInstanceId: input.agentInstanceId,
          requestId: input.requestId,
          runId: input.runId,
          provider: input.provider,
          model: input.model,
          inputTokens: input.inputTokens,
          outputTokens: input.outputTokens,
          cachedInputTokens: input.cachedInputTokens ?? 0,
          costMicros: input.costMicros,
          metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
        },
      });

      await tx.agentRuntimeState.update({
        where: { agentInstanceId: input.agentInstanceId },
        data: {
          totalCostMicros: { increment: input.costMicros },
          totalInputTokens: { increment: input.inputTokens },
          totalOutputTokens: { increment: input.outputTokens },
          lastHeartbeatAt: new Date(),
        },
      });
    });
  }

  async listCostEvents(input: FindCostEventsQuery) {
    const where: Prisma.AgentCostEventWhereInput = {
      organizationId: input.organizationId,
    };
    if (input.agentInstanceId) where.agentInstanceId = input.agentInstanceId;
    if (input.provider) where.provider = input.provider;
    if (input.model) where.model = input.model;
    if (input.fromOccurredAt || input.toOccurredAt) {
      where.occurredAt = {
        ...(input.fromOccurredAt ? { gte: input.fromOccurredAt } : {}),
        ...(input.toOccurredAt ? { lte: input.toOccurredAt } : {}),
      };
    }
    const limit = clampLimit(input.limit, 200);
    const cursor = input.cursor ? { id: input.cursor } : undefined;
    const rows = await this.prisma.agentCostEvent.findMany({
      where,
      take: limit,
      skip: cursor ? 1 : 0,
      cursor,
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
    });
    const totalCostMicros = rows.reduce((sum, row) => sum + row.costMicros, 0n);
    return {
      items: rows.map((row) => ({
        id: row.id,
        organizationId: row.organizationId,
        agentInstanceId: row.agentInstanceId,
        requestId: row.requestId,
        runId: row.runId,
        provider: row.provider,
        model: row.model,
        inputTokens: row.inputTokens,
        outputTokens: row.outputTokens,
        cachedInputTokens: row.cachedInputTokens,
        costMicros: row.costMicros,
        occurredAt: row.occurredAt,
      })),
      totalCostMicros,
    };
  }

  async createAuthorizationEvent(input: CreateAuthorizationEventInput) {
    let toolId: string | null = input.toolId ?? null;
    if (!toolId && input.toolKey) {
      const tool = await this.prisma.agentToolDefinition.findUnique({
        where: { key: input.toolKey },
      });
      toolId = tool?.id ?? null;
    }
    await this.prisma.agentAuthorizationEvent.create({
      data: {
        organizationId: input.organizationId,
        agentInstanceId: input.agentInstanceId,
        requestId: input.requestId ?? null,
        runId: input.runId ?? null,
        toolId,
        actorType: input.actorType ?? null,
        actorId: input.actorId ?? null,
        action: input.action,
        decision: input.decision,
        reasonCode: input.reasonCode ?? null,
        reason: input.reason ?? null,
        resourceType: input.resourceType ?? null,
        resourceId: input.resourceId ?? null,
        policySnapshot: (input.policySnapshot ?? {}) as Prisma.InputJsonValue,
        requestedByUserId: input.requestedByUserId ?? null,
        decidedByUserId: input.decidedByUserId ?? null,
      },
    });
  }

  async listAuthorizationEvents(input: FindAuthorizationEventsQuery) {
    const where: Prisma.AgentAuthorizationEventWhereInput = {
      organizationId: input.organizationId,
    };
    if (input.agentInstanceId) where.agentInstanceId = input.agentInstanceId;
    if (input.decision && input.decision.length > 0) {
      where.decision = { in: input.decision };
    }
    const limit = clampLimit(input.limit, 200);
    const cursor = input.cursor ? { id: input.cursor } : undefined;
    const rows = await this.prisma.agentAuthorizationEvent.findMany({
      where,
      take: limit,
      skip: cursor ? 1 : 0,
      cursor,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: { tool: { select: { key: true } } },
    });
    return rows.map((row) => ({
      id: row.id,
      organizationId: row.organizationId,
      agentInstanceId: row.agentInstanceId,
      requestId: row.requestId,
      runId: row.runId,
      toolKey: row.tool?.key ?? null,
      action: row.action,
      decision: row.decision as AgentAuthorizationDecision,
      reasonCode: row.reasonCode,
      reason: row.reason,
      resourceType: row.resourceType,
      resourceId: row.resourceId,
      createdAt: row.createdAt,
    }));
  }
}
