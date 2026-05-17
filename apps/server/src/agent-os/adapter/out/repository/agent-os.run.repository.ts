import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  type AppendRunEventInput,
  type CreateRunRecordInput,
  type FinalizeRunInput,
  type FindRunEventsQuery,
  type FindRunsQuery,
} from '../../../application/port/out/agent-os-repository.port';
import { AgentOsBoundaryError } from '../../../domain/agent-os.errors';
import {
  type AgentRunEventRecord,
  type AgentRunRequestStatus,
  type AgentRunStatus,
} from '../../../domain/agent-os.types';
import {
  clampLimit,
  toRunEventRecord,
  toRunRecord,
} from './agent-os.repository.mapper';

export class AgentOsRunRepository {
  constructor(private readonly prisma: PrismaService) {}

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
      // Latest attempt wins. Retries share requestId, so consumers need the
      // most recent terminal attempt for the specific request.
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
      });
      if (!existing) {
        throw new AgentOsBoundaryError(
          'run_organization_mismatch',
          `AgentRun ${input.runId} does not belong to organization ${input.organizationId}.`,
        );
      }

      const request = await tx.agentRunRequest.findFirst({
        where: { id: input.requestId, organizationId: input.organizationId },
        select: { id: true, status: true },
      });
      if (!request) {
        throw new AgentOsBoundaryError(
          'request_organization_mismatch',
          `AgentRunRequest ${input.requestId} does not belong to organization ${input.organizationId}.`,
        );
      }

      if (existing.status !== 'running') {
        return {
          run: toRunRecord(existing),
          requestStatus: request.status as AgentRunRequestStatus,
        };
      }

      const requestWasCancelled = request.status === 'cancelled';
      const runStatus = requestWasCancelled ? 'cancelled' : input.status;
      const run = await tx.agentRun.update({
        where: { id: input.runId },
        data: {
          status: runStatus,
          output:
            requestWasCancelled || input.output === undefined
              ? undefined
              : (input.output as Prisma.InputJsonValue),
          provider: requestWasCancelled ? undefined : input.provider ?? undefined,
          errorCode:
            input.errorCode ?? (requestWasCancelled ? 'user_cancelled' : undefined),
          errorMessage:
            input.errorMessage ??
            (requestWasCancelled ? 'User cancelled the request.' : undefined),
          finishedAt: new Date(),
        },
      });

      let requestStatus = request.status as AgentRunRequestStatus;
      if (request.status !== 'cancelled') {
        requestStatus =
          runStatus === 'succeeded'
            ? 'succeeded'
            : runStatus === 'failed'
              ? 'failed'
              : runStatus === 'cancelled'
                ? 'cancelled'
                : 'skipped';
        const requestUpdate = await tx.agentRunRequest.updateMany({
          where: { id: input.requestId, organizationId: input.organizationId },
          data: {
            status: requestStatus,
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
            lastRunStatus: runStatus,
            lastError: input.errorMessage ?? null,
            lastHeartbeatAt: new Date(),
            consecutiveFailureCount:
              runStatus === 'succeeded' ? 0 : { increment: 1 } as unknown as number,
          },
        });
      } else {
        await tx.agentRuntimeState.update({
          where: { agentInstanceId: run.agentInstanceId },
          data: {
            totalRuns: { increment: 1 },
            lastRunId: input.runId,
            lastRunStatus: runStatus,
            lastError: input.errorMessage ?? null,
            lastHeartbeatAt: new Date(),
            consecutiveFailureCount:
              runStatus === 'succeeded' ? 0 : { increment: 1 } as unknown as number,
          },
        });
      }

      return {
        run: toRunRecord(run),
        requestStatus,
      };
    });
  }
}
