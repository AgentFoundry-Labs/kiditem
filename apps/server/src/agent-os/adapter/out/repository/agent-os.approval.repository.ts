import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  type CreateApprovalRequestInput,
  type ResolveApprovalRequestInput,
} from '../../../application/port/out/repository/agent-os-repository.port';
import { AgentOsBoundaryError } from '../../../domain/agent-os.errors';
import { type AgentApprovalStatus } from '../../../domain/agent-os.types';

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
}
