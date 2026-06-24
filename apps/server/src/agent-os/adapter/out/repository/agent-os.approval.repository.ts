import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  type AgentApprovalRequestRecord,
  type CreateApprovalRequestInput,
  type FindApprovalRequestsQuery,
  type ResolveApprovalRequestInput,
} from '../../../application/port/out/repository/agent-os-repository.port';
import { AgentOsBoundaryError } from '../../../domain/agent-os.errors';
import { type AgentApprovalStatus } from '../../../domain/agent-os.types';
import { clampLimit } from './agent-os.repository.mapper';

function toApprovalRequestRecord(
  row: Prisma.AgentApprovalRequestGetPayload<{}>,
): AgentApprovalRequestRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    agentInstanceId: row.agentInstanceId,
    requestId: row.requestId,
    runId: row.runId,
    status: row.status as AgentApprovalStatus,
    reasonCode: row.reasonCode,
    reason: row.reason,
    prompt: row.prompt,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    actionSnapshot:
      row.actionSnapshot && typeof row.actionSnapshot === 'object'
        ? (row.actionSnapshot as Record<string, unknown>)
        : null,
    requestedByActorType: row.requestedByActorType,
    requestedByActorId: row.requestedByActorId,
    requestedByUserId: row.requestedByUserId,
    approverUserId: row.approverUserId,
    decidedByUserId: row.decidedByUserId,
    decidedAt: row.decidedAt,
    decisionReason: row.decisionReason,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class AgentOsApprovalRepository {
  constructor(private readonly prisma: PrismaService) {}

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

  async findApprovalRequestById(input: {
    organizationId: string;
    approvalRequestId: string;
  }): Promise<AgentApprovalRequestRecord | null> {
    const row = await this.prisma.agentApprovalRequest.findFirst({
      where: {
        id: input.approvalRequestId,
        organizationId: input.organizationId,
      },
    });

    return row ? toApprovalRequestRecord(row) : null;
  }

  async listApprovalRequests(input: FindApprovalRequestsQuery) {
    const where: Prisma.AgentApprovalRequestWhereInput = {
      organizationId: input.organizationId,
    };
    if (input.agentInstanceId) where.agentInstanceId = input.agentInstanceId;
    if (input.status && input.status.length > 0) where.status = { in: input.status };

    const limit = clampLimit(input.limit, 100);
    const cursor = input.cursor ? { id: input.cursor } : undefined;
    const rows = await this.prisma.agentApprovalRequest.findMany({
      where,
      take: limit,
      skip: cursor ? 1 : 0,
      cursor,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map(toApprovalRequestRecord);
  }

  async resolveApprovalRequest(input: ResolveApprovalRequestInput) {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.agentApprovalRequest.findFirst({
        where: { id: input.approvalRequestId, organizationId: input.organizationId },
        select: { id: true, requestId: true, status: true },
      });
      if (!existing) {
        throw new AgentOsBoundaryError(
          'approval_organization_mismatch',
          `AgentApprovalRequest ${input.approvalRequestId} does not belong to organization ${input.organizationId}.`,
        );
      }
      if (existing.status !== 'pending') {
        throw new AgentOsBoundaryError(
          'approval_request_not_pending',
          `AgentApprovalRequest ${input.approvalRequestId} is not pending.`,
        );
      }

      const approvalUpdate = await tx.agentApprovalRequest.updateMany({
        where: {
          id: input.approvalRequestId,
          organizationId: input.organizationId,
          status: 'pending',
        },
        data: {
          status: input.status,
          decidedByUserId: input.decidedByUserId ?? null,
          decisionReason: input.decisionReason ?? null,
          decidedAt: new Date(),
        },
      });
      if (approvalUpdate.count !== 1) {
        throw new AgentOsBoundaryError(
          'approval_request_not_pending',
          `AgentApprovalRequest ${input.approvalRequestId} is not pending.`,
        );
      }
      const approval = await tx.agentApprovalRequest.findFirstOrThrow({
        where: {
          id: input.approvalRequestId,
          organizationId: input.organizationId,
        },
      });
      const nextRequestStatus =
        input.status === 'approved'
          ? 'pending'
          : input.status === 'rejected'
            ? 'failed'
            : 'cancelled';
      const requestUpdate = await tx.agentRunRequest.updateMany({
        where: {
          id: existing.requestId,
          organizationId: input.organizationId,
          status: 'requires_approval',
        },
        data: {
          status: nextRequestStatus,
          lastErrorCode: input.status === 'rejected' ? 'approval_rejected' : null,
          lastErrorMessage: input.decisionReason ?? null,
        },
      });
      if (requestUpdate.count !== 1) {
        throw new AgentOsBoundaryError(
          'approval_request_not_awaiting_request',
          `AgentRunRequest ${existing.requestId} is not awaiting approval in organization ${input.organizationId}.`,
        );
      }

      if (input.status !== 'approved') {
        await tx.agentToolInvocation.updateMany({
          where: {
            organizationId: input.organizationId,
            approvalRequestId: approval.id,
            status: 'waiting_approval',
          },
          data: {
            status: input.status === 'rejected' ? 'failed' : 'cancelled',
            errorCode:
              input.status === 'rejected'
                ? 'approval_rejected'
                : `approval_${input.status}`,
            errorMessage: input.decisionReason ?? null,
            completedAt: new Date(),
          },
        });
      }
    });
  }
}
