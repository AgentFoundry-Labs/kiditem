import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  type AppendRunEventInput,
  type FindRunEventsQuery,
  type FindRunsQuery,
} from '../../../application/port/out/repository/agent-os-repository.port';
import { AgentOsBoundaryError } from '../../../domain/agent-os.errors';
import {
  type AgentRunEventRecord,
  type AgentRunStatus,
} from '../../../domain/agent-os.types';
import {
  clampLimit,
  toRunEventRecord,
  toRunRecord,
} from './agent-os.repository.mapper';

export class AgentOsRunRepository {
  constructor(private readonly prisma: PrismaService) {}

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

}
