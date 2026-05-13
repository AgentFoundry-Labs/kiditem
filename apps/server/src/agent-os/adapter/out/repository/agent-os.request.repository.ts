import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  type CreateRunRequestRecordInput,
  type FailClaimedRequestInput,
  type FindRequestsQuery,
  type MarkRequestStatusInput,
} from '../../../application/port/out/agent-os-repository.port';
import { AgentOsBoundaryError } from '../../../domain/agent-os.errors';
import { type AgentRunRequestRecord } from '../../../domain/agent-os.types';
import {
  clampLimit,
  rawRowToRunRequestRecord,
  type RunRequestRow,
  toRunRequestRecord,
} from './agent-os.repository.mapper';

export class AgentOsRequestRepository {
  constructor(private readonly prisma: PrismaService) {}

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

    return this.attachRawRunRequestContext(rows[0]);
  }

  async claimRunRequestById(input: {
    workerId: string;
    now: Date;
    organizationId: string;
    requestId: string;
  }): Promise<AgentRunRequestRecord | null> {
    const rows = await this.prisma.$queryRaw<RunRequestRow[]>`
      WITH target_request AS (
        SELECT "id"
        FROM "agent_run_requests"
        WHERE "id" = ${input.requestId}::uuid
          AND "organization_id" = ${input.organizationId}::uuid
          AND "status" = 'pending'
          AND "scheduled_for" <= ${input.now}
          AND "attempts" < "max_attempts"
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
      FROM target_request
      WHERE req."id" = target_request."id"
      RETURNING req.*
    `;

    if (rows.length === 0) return null;
    return this.attachRawRunRequestContext(rows[0]);
  }

  private async attachRawRunRequestContext(
    row: RunRequestRow,
  ): Promise<AgentRunRequestRecord> {
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
    // failed -> pending requeue: prior claim/finish stamps must be cleared so the
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

  private async attachRunRequestContext(
    row: Prisma.AgentRunRequestGetPayload<{}>,
  ): Promise<AgentRunRequestRecord> {
    const [session, instance, latestRun] = await Promise.all([
      this.prisma.agentTaskSession.findFirst({
        where: { id: row.taskSessionId, organizationId: row.organizationId },
        select: { taskKey: true, adapterType: true },
      }),
      this.prisma.agentInstance.findFirst({
        where: { id: row.agentInstanceId, organizationId: row.organizationId },
        select: { type: true, adapterType: true },
      }),
      // Latest run under this request: web consumers poll the request and pivot
      // to the run once it exists.
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
