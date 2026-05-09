import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  type AgentOsRepositoryPort,
  type AppendRunEventInput,
  type CreateAgentInstanceInput,
  type CreateApprovalRequestInput,
  type CreateAuthorizationEventInput,
  type CreateRunRecordInput,
  type CreateRunRequestRecordInput,
  type FailClaimedRequestInput,
  type FinalizeRunInput,
  type FindAuthorizationEventsQuery,
  type FindCostEventsQuery,
  type FindRequestsQuery,
  type FindRunEventsQuery,
  type FindRunsQuery,
  type InstanceToolPolicyRecord,
  type MarkRequestStatusInput,
  type RecordCostEventInput,
  type ResolveApprovalRequestInput,
  type UpdateAgentInstanceInput,
  type UpsertInstanceToolPolicyInput,
} from '../../../application/port/out/agent-os-repository.port';
import {
  type AgentApprovalStatus,
  type AgentAuthorizationDecision,
  type AgentInstanceLifecycleStatus,
  type AgentInstanceRecord,
  type AgentRunEventRecord,
  type AgentRunRecord,
  type AgentRunRequestRecord,
  type AgentRunRequestStatus,
  type AgentRunStatus,
  type AgentTaskSessionRecord,
} from '../../../domain/agent-os.types';
import { AgentOsBoundaryError } from '../../../domain/agent-os.errors';

interface RunRequestRow {
  id: string;
  organization_id: string;
  agent_instance_id: string;
  task_session_id: string;
  source: string;
  trigger_detail: string | null;
  reason: string | null;
  idempotency_key: string | null;
  priority: number;
  source_workflow_run_id: string | null;
  source_workflow_node_id: string | null;
  source_resource_type: string | null;
  source_resource_id: string | null;
  requested_by_user_id: string | null;
  requested_by_actor_type: string | null;
  requested_by_actor_id: string | null;
  payload: Prisma.JsonValue;
  status: string;
  scheduled_for: Date;
  claimed_at: Date | null;
  claimed_by: string | null;
  attempts: number;
  max_attempts: number;
  finished_at: Date | null;
  coalesced_into_request_id: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class AgentOsRepositoryAdapter implements AgentOsRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  // ---- Instances ---------------------------------------------------------
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
  ): Promise<AgentInstanceRecord> {
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

  // ---- Tool policy --------------------------------------------------------
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

  // ---- Sessions -----------------------------------------------------------
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

  // ---- Requests -----------------------------------------------------------
  async createRunRequest(input: CreateRunRequestRecordInput) {
    const session = await this.prisma.agentTaskSession.findFirst({
      where: { id: input.taskSessionId, organizationId: input.organizationId },
      select: { taskKey: true, adapterType: true },
    });
    const instance = await this.prisma.agentInstance.findFirst({
      where: { id: input.agentInstanceId, organizationId: input.organizationId },
      select: { type: true, adapterType: true },
    });
    if (!session || !instance) {
      throw new AgentOsBoundaryError(
        'agent_run_request_context_missing',
        'Cannot create AgentRunRequest without matching task session and instance.',
      );
    }
    const row = await this.prisma.agentRunRequest.create({
      data: {
        organizationId: input.organizationId,
        agentInstanceId: input.agentInstanceId,
        taskSessionId: input.taskSessionId,
        source: input.source,
        triggerDetail: input.triggerDetail ?? null,
        reason: input.reason ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
        priority: input.priority ?? 0,
        sourceWorkflowRunId: input.sourceWorkflowRunId ?? null,
        sourceWorkflowNodeId: input.sourceWorkflowNodeId ?? null,
        sourceResourceType: input.sourceResourceType ?? null,
        sourceResourceId: input.sourceResourceId ?? null,
        requestedByUserId: input.requestedByUserId ?? null,
        requestedByActorType: input.requestedByActorType ?? null,
        requestedByActorId: input.requestedByActorId ?? null,
        payload: input.payload as Prisma.InputJsonValue,
        scheduledFor: input.scheduledFor,
        maxAttempts: input.maxAttempts ?? 3,
      },
    });
    return toRunRequestRecord(row, {
      adapterType: session.adapterType,
      taskKey: session.taskKey,
      agentType: instance.type,
    });
  }

  async findRunRequestByIdempotency(input: {
    organizationId: string;
    agentInstanceId: string;
    idempotencyKey: string;
  }) {
    const row = await this.prisma.agentRunRequest.findFirst({
      where: {
        organizationId: input.organizationId,
        agentInstanceId: input.agentInstanceId,
        idempotencyKey: input.idempotencyKey,
      },
    });
    if (!row) return null;
    return this.attachRunRequestContext(row);
  }

  async findRunRequestById(input: { organizationId: string; requestId: string }) {
    const row = await this.prisma.agentRunRequest.findFirst({
      where: { id: input.requestId, organizationId: input.organizationId },
    });
    if (!row) return null;
    return this.attachRunRequestContext(row);
  }

  async listRunRequests(input: FindRequestsQuery): Promise<AgentRunRequestRecord[]> {
    const where: Prisma.AgentRunRequestWhereInput = {
      organizationId: input.organizationId,
    };
    if (input.agentInstanceId) where.agentInstanceId = input.agentInstanceId;
    if (input.status && input.status.length > 0) where.status = { in: input.status };
    if (input.source) where.source = input.source;
    if (input.sourceWorkflowRunId) where.sourceWorkflowRunId = input.sourceWorkflowRunId;
    if (input.sourceResourceType) where.sourceResourceType = input.sourceResourceType;
    if (input.sourceResourceId) where.sourceResourceId = input.sourceResourceId;

    const limit = clampLimit(input.limit, 100);
    const cursor = input.cursor ? { id: input.cursor } : undefined;

    const rows = await this.prisma.agentRunRequest.findMany({
      where,
      take: limit,
      skip: cursor ? 1 : 0,
      cursor,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    return Promise.all(rows.map((row) => this.attachRunRequestContext(row)));
  }

  async claimNextRunRequest(input: {
    workerId: string;
    now: Date;
    organizationId?: string | null;
  }): Promise<AgentRunRequestRecord | null> {
    const orgPredicate = input.organizationId
      ? Prisma.sql`AND "organization_id" = ${input.organizationId}::uuid`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<RunRequestRow[]>`
      WITH next_request AS (
        SELECT "id"
        FROM "agent_run_requests"
        WHERE "status" = 'pending'
          AND "scheduled_for" <= ${input.now}
          AND "attempts" < "max_attempts"
          ${orgPredicate}
        ORDER BY "priority" DESC, "scheduled_for" ASC, "created_at" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE "agent_run_requests" req
      SET
        "status" = 'claimed',
        "claimed_at" = ${input.now},
        "claimed_by" = ${input.workerId},
        "attempts" = req."attempts" + 1,
        "updated_at" = ${input.now}
      FROM next_request
      WHERE req."id" = next_request."id"
      RETURNING req.*
    `;

    if (rows.length === 0) return null;

    const row = rows[0];
    const session = await this.prisma.agentTaskSession.findFirst({
      where: {
        id: row.task_session_id,
        organizationId: row.organization_id,
      },
      select: { taskKey: true, adapterType: true },
    });
    const instance = await this.prisma.agentInstance.findFirst({
      where: {
        id: row.agent_instance_id,
        organizationId: row.organization_id,
      },
      select: { type: true, adapterType: true },
    });

    return rawRowToRunRequestRecord(row, {
      adapterType: session?.adapterType ?? instance?.adapterType ?? 'claude_local',
      taskKey: session?.taskKey ?? 'default',
      agentType: instance?.type ?? 'unknown',
    });
  }

  async failClaimedRequest(input: FailClaimedRequestInput) {
    await this.prisma.agentRunRequest.updateMany({
      where: {
        id: input.requestId,
        organizationId: input.organizationId,
      },
      data: {
        status: 'failed',
        finishedAt: new Date(),
        lastErrorCode: input.errorCode,
        lastErrorMessage: input.errorMessage,
      },
    });
  }

  async markRequestStatus(input: MarkRequestStatusInput) {
    const isTerminal =
      input.status === 'failed' ||
      input.status === 'succeeded' ||
      input.status === 'cancelled' ||
      input.status === 'skipped';
    // failed → pending requeue: prior claim/finish stamps must be cleared so the
    // FOR UPDATE SKIP LOCKED scan treats this row like a fresh pending request
    // again. Without this, a retryable failure leaves stale claimedAt/claimedBy/
    // finishedAt and looks finished to readers.
    const isRequeue = input.status === 'pending';

    const updated = await this.prisma.agentRunRequest.updateMany({
      where: {
        id: input.requestId,
        organizationId: input.organizationId,
      },
      data: {
        status: input.status,
        coalescedIntoRequestId: input.coalescedIntoRequestId ?? undefined,
        lastErrorCode: input.errorCode ?? undefined,
        lastErrorMessage: input.errorMessage ?? undefined,
        finishedAt: isTerminal ? new Date() : isRequeue ? null : undefined,
        claimedAt: isRequeue ? null : undefined,
        claimedBy: isRequeue ? null : undefined,
      },
    });
    if (updated.count === 0) {
      throw new AgentOsBoundaryError(
        'agent_run_request_not_found',
        `AgentRunRequest ${input.requestId} not found in organization ${input.organizationId}.`,
      );
    }
    const reloaded = await this.prisma.agentRunRequest.findFirstOrThrow({
      where: {
        id: input.requestId,
        organizationId: input.organizationId,
      },
    });
    return this.attachRunRequestContext(reloaded);
  }

  // ---- Runs + events ------------------------------------------------------
  async createRunForRequest(input: CreateRunRecordInput) {
    const session = await this.prisma.agentTaskSession.findFirst({
      where: { id: input.taskSessionId, organizationId: input.organizationId },
      select: { taskKey: true, adapterType: true },
    });

    const row = await this.prisma.agentRun.create({
      data: {
        organizationId: input.organizationId,
        agentInstanceId: input.agentInstanceId,
        requestId: input.requestId,
        taskSessionId: input.taskSessionId,
        attempt: input.attempt,
        invocationSource: input.invocationSource,
        adapterType: input.adapterType,
        model: input.model,
        taskKey: input.taskKey ?? session?.taskKey ?? null,
        input: input.input as Prisma.InputJsonValue,
      },
    });
    return toRunRecord(row);
  }

  async findRunById(input: { organizationId: string; runId: string }) {
    const row = await this.prisma.agentRun.findFirst({
      where: { id: input.runId, organizationId: input.organizationId },
    });
    return row ? toRunRecord(row) : null;
  }

  async findRunByRequestId(input: {
    organizationId: string;
    requestId: string;
    status?: AgentRunStatus[] | null;
  }) {
    const where: Prisma.AgentRunWhereInput = {
      organizationId: input.organizationId,
      requestId: input.requestId,
    };
    if (input.status && input.status.length > 0) {
      where.status = { in: input.status };
    }
    const row = await this.prisma.agentRun.findFirst({
      where,
      // Latest attempt wins — retries share `requestId` and we want the
      // most recent terminal one.
      orderBy: { startedAt: 'desc' },
    });
    return row ? toRunRecord(row) : null;
  }

  async listRuns(input: FindRunsQuery) {
    const where: Prisma.AgentRunWhereInput = {
      organizationId: input.organizationId,
    };
    if (input.agentInstanceId) where.agentInstanceId = input.agentInstanceId;
    if (input.status && input.status.length > 0) where.status = { in: input.status };
    const limit = clampLimit(input.limit, 100);
    const cursor = input.cursor ? { id: input.cursor } : undefined;
    const rows = await this.prisma.agentRun.findMany({
      where,
      take: limit,
      skip: cursor ? 1 : 0,
      cursor,
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map(toRunRecord);
  }

  async appendRunEvent(input: AppendRunEventInput): Promise<AgentRunEventRecord> {
    return this.prisma.$transaction(async (tx) => {
      const run = await tx.agentRun.findFirst({
        where: { id: input.runId, organizationId: input.organizationId },
        select: { id: true, agentInstanceId: true },
      });
      if (!run) {
        throw new AgentOsBoundaryError(
          'run_organization_mismatch',
          `AgentRun ${input.runId} does not belong to organization ${input.organizationId}.`,
        );
      }
      if (run.agentInstanceId !== input.agentInstanceId) {
        throw new AgentOsBoundaryError(
          'agent_instance_mismatch',
          `AgentRun ${input.runId} does not belong to agent instance ${input.agentInstanceId}.`,
        );
      }

      const updated = await tx.agentRun.update({
        where: { id: input.runId },
        data: { lastEventSeq: { increment: 1 } },
        select: {
          id: true,
          organizationId: true,
          agentInstanceId: true,
          lastEventSeq: true,
        },
      });

      const event = await tx.agentRunEvent.create({
        data: {
          organizationId: input.organizationId,
          runId: input.runId,
          agentInstanceId: run.agentInstanceId,
          seq: updated.lastEventSeq,
          type: input.type,
          level: input.level ?? 'info',
          stream: input.stream ?? null,
          message: input.message ?? null,
          data: (input.data ?? {}) as Prisma.InputJsonValue,
          logRef: input.logRef ?? null,
        },
      });

      return toRunEventRecord(event);
    });
  }

  async listRunEvents(input: FindRunEventsQuery) {
    const limit = clampLimit(input.limit, 200);
    const rows = await this.prisma.agentRunEvent.findMany({
      where: {
        organizationId: input.organizationId,
        runId: input.runId,
        ...(input.cursorSeq != null ? { seq: { gt: input.cursorSeq } } : {}),
      },
      take: limit,
      orderBy: { seq: 'asc' },
    });
    return rows.map(toRunEventRecord);
  }

  async finalizeRun(input: FinalizeRunInput) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.agentRun.findFirst({
        where: {
          id: input.runId,
          organizationId: input.organizationId,
          requestId: input.requestId,
        },
        select: { id: true },
      });
      if (!existing) {
        throw new AgentOsBoundaryError(
          'run_organization_mismatch',
          `AgentRun ${input.runId} does not belong to organization ${input.organizationId}.`,
        );
      }

      const run = await tx.agentRun.update({
        where: { id: input.runId },
        data: {
          status: input.status,
          output: input.output === undefined ? undefined : (input.output as Prisma.InputJsonValue),
          provider: input.provider ?? undefined,
          errorCode: input.errorCode ?? undefined,
          errorMessage: input.errorMessage ?? undefined,
          finishedAt: new Date(),
        },
      });

      const requestUpdate = await tx.agentRunRequest.updateMany({
        where: { id: input.requestId, organizationId: input.organizationId },
        data: {
          status: input.status === 'succeeded' ? 'succeeded' : input.status === 'failed' ? 'failed' : input.status === 'cancelled' ? 'cancelled' : 'skipped',
          finishedAt: new Date(),
          lastErrorCode: input.errorCode ?? null,
          lastErrorMessage: input.errorMessage ?? null,
        },
      });
      if (requestUpdate.count !== 1) {
        throw new AgentOsBoundaryError(
          'request_organization_mismatch',
          `AgentRunRequest ${input.requestId} does not belong to organization ${input.organizationId}.`,
        );
      }

      if (input.cost) {
        await tx.agentCostEvent.create({
          data: {
            organizationId: input.organizationId,
            agentInstanceId: run.agentInstanceId,
            requestId: input.requestId,
            runId: input.runId,
            provider: input.cost.provider,
            model: input.cost.model,
            inputTokens: input.cost.inputTokens,
            outputTokens: input.cost.outputTokens,
            cachedInputTokens: input.cost.cachedInputTokens ?? 0,
            costMicros: input.cost.costMicros,
          },
        });

        await tx.agentRuntimeState.update({
          where: { agentInstanceId: run.agentInstanceId },
          data: {
            totalRuns: { increment: 1 },
            totalInputTokens: { increment: input.cost.inputTokens },
            totalOutputTokens: { increment: input.cost.outputTokens },
            totalCostMicros: { increment: input.cost.costMicros },
            lastRunId: input.runId,
            lastRunStatus: input.status,
            lastError: input.errorMessage ?? null,
            lastHeartbeatAt: new Date(),
            consecutiveFailureCount:
              input.status === 'succeeded' ? 0 : { increment: 1 } as unknown as number,
          },
        });
      } else {
        await tx.agentRuntimeState.update({
          where: { agentInstanceId: run.agentInstanceId },
          data: {
            totalRuns: { increment: 1 },
            lastRunId: input.runId,
            lastRunStatus: input.status,
            lastError: input.errorMessage ?? null,
            lastHeartbeatAt: new Date(),
            consecutiveFailureCount:
              input.status === 'succeeded' ? 0 : { increment: 1 } as unknown as number,
          },
        });
      }

      return toRunRecord(run);
    });
  }

  // ---- Cost / audit -------------------------------------------------------
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

  // ---- Approvals ----------------------------------------------------------
  async createApprovalRequest(input: CreateApprovalRequestInput) {
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.agentRunRequest.findFirst({
        where: { id: input.requestId, organizationId: input.organizationId },
        select: { id: true, agentInstanceId: true },
      });
      if (!request) {
        throw new AgentOsBoundaryError(
          'request_organization_mismatch',
          `AgentRunRequest ${input.requestId} does not belong to organization ${input.organizationId}.`,
        );
      }
      if (request.agentInstanceId !== input.agentInstanceId) {
        throw new AgentOsBoundaryError(
          'agent_instance_mismatch',
          `AgentRunRequest ${input.requestId} does not belong to agent instance ${input.agentInstanceId}.`,
        );
      }
      if (input.runId) {
        const run = await tx.agentRun.findFirst({
          where: {
            id: input.runId,
            organizationId: input.organizationId,
            requestId: input.requestId,
            agentInstanceId: request.agentInstanceId,
          },
          select: { id: true },
        });
        if (!run) {
          throw new AgentOsBoundaryError(
            'run_organization_mismatch',
            `AgentRun ${input.runId} does not belong to request ${input.requestId}.`,
          );
        }
      }

      const row = await tx.agentApprovalRequest.create({
        data: {
          organizationId: input.organizationId,
          agentInstanceId: request.agentInstanceId,
          requestId: input.requestId,
          runId: input.runId ?? null,
          prompt: input.prompt ?? null,
          reasonCode: input.reasonCode ?? null,
          reason: input.reason ?? null,
          payload: (input.payload ?? {}) as Prisma.InputJsonValue,
          actionSnapshot:
            input.actionSnapshot === null || input.actionSnapshot === undefined
              ? Prisma.JsonNull
              : (input.actionSnapshot as Prisma.InputJsonValue),
          requestedByActorType: input.requestedByActorType ?? null,
          requestedByActorId: input.requestedByActorId ?? null,
          requestedByUserId: input.requestedByUserId ?? null,
          approverUserId: input.approverUserId ?? null,
          expiresAt: input.expiresAt ?? null,
        },
      });
      await tx.agentRunRequest.update({
        where: { id: input.requestId },
        data: { status: 'requires_approval' },
      });
      return { id: row.id, status: row.status as AgentApprovalStatus };
    });
  }

  async resolveApprovalRequest(input: ResolveApprovalRequestInput) {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.agentApprovalRequest.findFirst({
        where: { id: input.approvalRequestId, organizationId: input.organizationId },
        select: { id: true },
      });
      if (!existing) {
        throw new AgentOsBoundaryError(
          'approval_organization_mismatch',
          `AgentApprovalRequest ${input.approvalRequestId} does not belong to organization ${input.organizationId}.`,
        );
      }

      const approval = await tx.agentApprovalRequest.update({
        where: { id: input.approvalRequestId },
        data: {
          status: input.status,
          decidedByUserId: input.decidedByUserId ?? null,
          decisionReason: input.decisionReason ?? null,
          decidedAt: new Date(),
        },
      });
      const nextRequestStatus =
        input.status === 'approved'
          ? 'pending'
          : input.status === 'rejected'
            ? 'failed'
            : 'cancelled';
      const requestUpdate = await tx.agentRunRequest.updateMany({
        where: { id: approval.requestId, organizationId: input.organizationId },
        data: {
          status: nextRequestStatus,
          lastErrorCode: input.status === 'rejected' ? 'approval_rejected' : null,
          lastErrorMessage: input.decisionReason ?? null,
        },
      });
      if (requestUpdate.count !== 1) {
        throw new AgentOsBoundaryError(
          'request_organization_mismatch',
          `AgentRunRequest ${approval.requestId} does not belong to organization ${input.organizationId}.`,
        );
      }
    });
  }

  // ---- helpers ------------------------------------------------------------
  private async attachRunRequestContext(row: Prisma.AgentRunRequestGetPayload<{}>): Promise<AgentRunRequestRecord> {
    const [session, instance, latestRun] = await Promise.all([
      this.prisma.agentTaskSession.findFirst({
        where: { id: row.taskSessionId, organizationId: row.organizationId },
        select: { taskKey: true, adapterType: true },
      }),
      this.prisma.agentInstance.findFirst({
        where: { id: row.agentInstanceId, organizationId: row.organizationId },
        select: { type: true, adapterType: true },
      }),
      // Latest run under this request — web consumers (sourcing color-guide,
      // AIImageEditPanel, detail-page generator) poll the request and pivot to
      // the run once it exists. Without latestRunId they would 404 on
      // /agent-os/runs/:requestId.
      this.prisma.agentRun.findFirst({
        where: { requestId: row.id, organizationId: row.organizationId },
        orderBy: { startedAt: 'desc' },
        select: { id: true },
      }),
    ]);
    return toRunRequestRecord(row, {
      taskKey: session?.taskKey ?? 'default',
      adapterType: session?.adapterType ?? instance?.adapterType ?? 'claude_local',
      agentType: instance?.type ?? 'unknown',
      latestRunId: latestRun?.id ?? null,
    });
  }
}

function clampLimit(limit: number | undefined, defaultLimit: number): number {
  if (!limit || limit <= 0) return defaultLimit;
  return Math.min(limit, defaultLimit);
}

function toInstanceRecord(row: Prisma.AgentInstanceGetPayload<{}>): AgentInstanceRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    type: row.type,
    name: row.name,
    role: row.role,
    title: row.title,
    icon: row.icon,
    reportsToId: row.reportsToId,
    lifecycleStatus: row.lifecycleStatus as AgentInstanceLifecycleStatus,
    pauseReason: row.pauseReason,
    trustLevel: row.trustLevel,
    adapterType: row.adapterType,
    modelOverride: row.modelOverride,
    adapterConfig: (row.adapterConfig ?? {}) as Record<string, unknown>,
    runtimeConfig: (row.runtimeConfig ?? {}) as Record<string, unknown>,
    promptPathOverride: row.promptPathOverride,
  };
}

function toTaskSessionRecord(
  row: Prisma.AgentTaskSessionGetPayload<{}>,
): AgentTaskSessionRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    agentInstanceId: row.agentInstanceId,
    adapterType: row.adapterType,
    taskKey: row.taskKey,
    title: row.title,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    sessionDisplay: row.sessionDisplay,
    lastRunId: row.lastRunId,
    lastError: row.lastError,
  };
}

type RunRequestContext = {
  taskKey: string;
  adapterType: string;
  agentType: string;
  // Optional — newly-created requests have no run yet, fresh-claim raw SQL
  // path also predates the run insert. Set to null in those cases.
  latestRunId?: string | null;
};

function toRunRequestRecord(
  row: Prisma.AgentRunRequestGetPayload<{}>,
  context: RunRequestContext,
): AgentRunRequestRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    agentInstanceId: row.agentInstanceId,
    taskSessionId: row.taskSessionId,
    source: row.source,
    triggerDetail: row.triggerDetail,
    reason: row.reason,
    idempotencyKey: row.idempotencyKey,
    priority: row.priority,
    sourceWorkflowRunId: row.sourceWorkflowRunId,
    sourceWorkflowNodeId: row.sourceWorkflowNodeId,
    sourceResourceType: row.sourceResourceType,
    sourceResourceId: row.sourceResourceId,
    requestedByUserId: row.requestedByUserId,
    requestedByActorType: row.requestedByActorType,
    requestedByActorId: row.requestedByActorId,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    status: row.status as AgentRunRequestStatus,
    scheduledFor: row.scheduledFor,
    claimedAt: row.claimedAt,
    claimedBy: row.claimedBy,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    finishedAt: row.finishedAt,
    coalescedIntoRequestId: row.coalescedIntoRequestId,
    lastErrorCode: row.lastErrorCode,
    lastErrorMessage: row.lastErrorMessage,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    taskKey: context.taskKey,
    agentType: context.agentType,
    adapterType: context.adapterType,
    latestRunId: context.latestRunId ?? null,
  };
}

function rawRowToRunRequestRecord(
  row: RunRequestRow,
  context: RunRequestContext,
): AgentRunRequestRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    agentInstanceId: row.agent_instance_id,
    taskSessionId: row.task_session_id,
    source: row.source,
    triggerDetail: row.trigger_detail,
    reason: row.reason,
    idempotencyKey: row.idempotency_key,
    priority: row.priority,
    sourceWorkflowRunId: row.source_workflow_run_id,
    sourceWorkflowNodeId: row.source_workflow_node_id,
    sourceResourceType: row.source_resource_type,
    sourceResourceId: row.source_resource_id,
    requestedByUserId: row.requested_by_user_id,
    requestedByActorType: row.requested_by_actor_type,
    requestedByActorId: row.requested_by_actor_id,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    status: row.status as AgentRunRequestStatus,
    scheduledFor: row.scheduled_for,
    claimedAt: row.claimed_at,
    claimedBy: row.claimed_by,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    finishedAt: row.finished_at,
    coalescedIntoRequestId: row.coalesced_into_request_id,
    lastErrorCode: row.last_error_code,
    lastErrorMessage: row.last_error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    taskKey: context.taskKey,
    agentType: context.agentType,
    adapterType: context.adapterType,
    latestRunId: context.latestRunId ?? null,
  };
}

function toRunRecord(row: Prisma.AgentRunGetPayload<{}>): AgentRunRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    agentInstanceId: row.agentInstanceId,
    requestId: row.requestId,
    taskSessionId: row.taskSessionId,
    retryOfRunId: row.retryOfRunId,
    status: row.status as AgentRunStatus,
    attempt: row.attempt,
    invocationSource: row.invocationSource,
    adapterType: row.adapterType,
    model: row.model,
    provider: row.provider,
    taskKey: row.taskKey,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    output: (row.output as Record<string, unknown> | null) ?? null,
    lastEventSeq: row.lastEventSeq,
  };
}

function toRunEventRecord(row: Prisma.AgentRunEventGetPayload<{}>): AgentRunEventRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    runId: row.runId,
    agentInstanceId: row.agentInstanceId,
    seq: row.seq,
    type: row.type,
    level: row.level,
    stream: row.stream,
    message: row.message,
    data: (row.data ?? {}) as Record<string, unknown>,
    logRef: row.logRef,
    createdAt: row.createdAt,
  };
}
