import { Injectable } from '@nestjs/common';
import {
  CapabilityInvocationErrorSchema,
  CapabilityResultReceiptSchema,
} from '@kiditem/shared/agent-interaction';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { AgentOsError } from '../../../domain/agent-os.errors';
import type {
  AdmissionResult,
  AdmitCapabilityInvocation,
  CapabilityInvocationRecord,
  CapabilityInvocationRepositoryPort,
  DecideInvocationApproval,
  InvocationFence,
  InvocationRequestKeyFence,
  RecordInvocationFailure,
  RecordInvocationSucceeded,
} from '../../../application/port/out/capability-invocation.repository.port';
import { CapabilityInvocationRecordSchema } from '../../../application/port/out/capability-invocation.repository.port';

/**
 * Atomic Prisma adapter for the one durable Agent OS record. It never turns an
 * Invocation into a queue: all updates are state-specific conditional writes.
 */
@Injectable()
export class PrismaCapabilityInvocationRepository
  implements CapabilityInvocationRepositoryPort
{
  constructor(
    private readonly prisma: PrismaService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async admit(input: AdmitCapabilityInvocation): Promise<AdmissionResult> {
    try {
      const row = await this.prisma.capabilityInvocation.create({
        data: {
          organizationId: input.organizationId,
          initiatingUserId: input.initiatingUserId,
          capabilityKey: input.capabilityKey,
          actingAgentKey: input.actingAgentKey,
          requestKey: input.requestKey,
          canonicalInput: toPrismaJson(input.canonicalInput),
          inputHash: input.inputHash,
          status: 'pending',
          approvalStatus: input.approval.required ? 'pending' : 'not_required',
          approvalInputHash: input.approval.required ? input.inputHash : null,
          approvalRequestedAt: input.approval.required
            ? input.approval.requestedAt
            : null,
          approvalExpiresAt: input.approval.required
            ? input.approval.expiresAt
            : null,
        },
      });
      return { kind: 'created', invocation: parseRow(row) };
    } catch (error) {
      if (!isUniqueRequestKeyViolation(error)) throw error;
      // PostgreSQL's unique index makes this a winner lookup, never a
      // check-then-insert race. The losing insert waits for the winner.
      const winner = await this.findByRequestKey({
        organizationId: input.organizationId,
        requestKey: input.requestKey,
      });
      if (!winner) throw error;
      return sameRequest(winner, input)
        ? { kind: 'replay', invocation: winner }
        : { kind: 'conflict', invocation: winner };
    }
  }

  async findById(input: InvocationFence): Promise<CapabilityInvocationRecord | null> {
    const row = await this.prisma.capabilityInvocation.findFirst({
      where: { id: input.invocationId, organizationId: input.organizationId },
    });
    if (!row) return null;
    await this.expireIfNecessary(parseRow(row), this.now());
    const current = await this.prisma.capabilityInvocation.findFirst({
      where: { id: input.invocationId, organizationId: input.organizationId },
    });
    return current ? parseRow(current) : null;
  }

  async findByRequestKey(
    input: InvocationRequestKeyFence,
  ): Promise<CapabilityInvocationRecord | null> {
    const row = await this.prisma.capabilityInvocation.findFirst({
      where: {
        organizationId: input.organizationId,
        requestKey: input.requestKey,
      },
    });
    if (!row) return null;
    const parsed = parseRow(row);
    await this.expireIfNecessary(parsed, this.now());
    const current = await this.prisma.capabilityInvocation.findFirst({
      where: {
        organizationId: input.organizationId,
        requestKey: input.requestKey,
      },
    });
    return current ? parseRow(current) : null;
  }

  async decideApproval(
    input: DecideInvocationApproval,
  ): Promise<CapabilityInvocationRecord> {
    let current = await this.findById({
      organizationId: input.organizationId,
      invocationId: input.invocationId,
    });
    if (!current) throw notFound();
    if (current.approvalStatus === 'expired') throw approvalExpired();
    if (current.approvalStatus === 'not_required') {
      throw new AgentOsError('APPROVAL_REQUIRED', 'This invocation does not await approval.');
    }
    if (current.approvalInputHash !== input.inputHash || current.inputHash !== input.inputHash) {
      throw new AgentOsError('REQUEST_KEY_CONFLICT', 'Approval input does not match the admitted invocation.');
    }
    if (current.approvalStatus === input.decision) return current;
    if (current.approvalStatus === 'approved' || current.approvalStatus === 'rejected') {
      throw new AgentOsError('APPROVAL_REJECTED', 'Approval decision is immutable.');
    }
    if (current.status !== 'pending') {
      return current;
    }

    const rejected = input.decision === 'rejected';
    const update = await this.prisma.capabilityInvocation.updateMany({
      where: {
        id: input.invocationId,
        organizationId: input.organizationId,
        status: 'pending',
        approvalStatus: 'pending',
        approvalInputHash: input.inputHash,
        inputHash: input.inputHash,
      },
      data: {
        approvalStatus: input.decision,
        approvalDecidedByUserId: input.userId,
        approvalDecisionReason: input.reason,
        approvalDecidedAt: input.decidedAt,
        ...(rejected
          ? {
              status: 'failed',
              error: toPrismaJson({
                code: 'APPROVAL_REJECTED',
                message: 'User rejected the exact capability invocation.',
              }),
              finishedAt: input.decidedAt,
            }
          : {}),
      },
    });
    if (update.count === 1) {
      const updated = await this.findById({
        organizationId: input.organizationId,
        invocationId: input.invocationId,
      });
      if (!updated) throw notFound();
      return updated;
    }

    current = await this.findById({
      organizationId: input.organizationId,
      invocationId: input.invocationId,
    });
    if (!current) throw notFound();
    if (current.approvalStatus === input.decision) return current;
    if (current.approvalStatus === 'expired') throw approvalExpired();
    throw new AgentOsError('APPROVAL_REJECTED', 'Approval decision is immutable.');
  }

  async recordSucceeded(
    input: RecordInvocationSucceeded,
  ): Promise<CapabilityInvocationRecord> {
    const result = CapabilityResultReceiptSchema.parse(input.result);
    const current = await this.requiredCurrent(input);
    if (current.status !== 'pending') return current;
    const update = await this.prisma.capabilityInvocation.updateMany({
      where: {
        id: input.invocationId,
        organizationId: input.organizationId,
        status: 'pending',
        approvalStatus: { in: ['not_required', 'approved'] },
      },
      data: {
        status: 'succeeded',
        result: toPrismaJson(result),
        error: Prisma.DbNull,
        finishedAt: input.finishedAt,
      },
    });
    if (update.count === 1) return this.requiredCurrent(input);
    return this.requiredCurrent(input);
  }

  async recordKnownFailure(
    input: RecordInvocationFailure,
  ): Promise<CapabilityInvocationRecord> {
    const error = CapabilityInvocationErrorSchema.parse(input.error);
    const current = await this.requiredCurrent(input);
    if (current.status !== 'pending') return current;
    const update = await this.prisma.capabilityInvocation.updateMany({
      where: {
        id: input.invocationId,
        organizationId: input.organizationId,
        status: 'pending',
      },
      data: {
        status: 'failed',
        error: toPrismaJson(error),
        finishedAt: input.finishedAt,
      },
    });
    if (update.count === 1) return this.requiredCurrent(input);
    return this.requiredCurrent(input);
  }

  private async requiredCurrent(input: InvocationFence): Promise<CapabilityInvocationRecord> {
    const current = await this.findById(input);
    if (!current) throw notFound();
    return current;
  }

  /** Conditional update is the row-lock fence for lazy expiry. */
  private async expireIfNecessary(
    invocation: CapabilityInvocationRecord,
    at: Date,
  ): Promise<void> {
    if (
      invocation.status !== 'pending' ||
      invocation.approvalStatus !== 'pending' ||
      !invocation.approvalExpiresAt ||
      invocation.approvalExpiresAt.getTime() > at.getTime()
    ) {
      return;
    }
    await this.prisma.capabilityInvocation.updateMany({
      where: {
        id: invocation.id,
        organizationId: invocation.organizationId,
        status: 'pending',
        approvalStatus: 'pending',
        approvalExpiresAt: { lte: at },
      },
      data: {
        status: 'failed',
        approvalStatus: 'expired',
        error: toPrismaJson({
          code: 'APPROVAL_EXPIRED',
          message: 'Capability approval expired before execution.',
        }),
        finishedAt: at,
      },
    });
  }
}

function parseRow(row: unknown): CapabilityInvocationRecord {
  return CapabilityInvocationRecordSchema.parse(row);
}

function sameRequest(
  winner: CapabilityInvocationRecord,
  input: AdmitCapabilityInvocation,
): boolean {
  return (
    winner.initiatingUserId === input.initiatingUserId &&
    winner.capabilityKey === input.capabilityKey &&
    winner.actingAgentKey === input.actingAgentKey &&
    winner.inputHash === input.inputHash
  );
}

function isUniqueRequestKeyViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

function notFound(): AgentOsError {
  return new AgentOsError('CAPABILITY_NOT_FOUND', 'Capability invocation was not found.');
}

function approvalExpired(): AgentOsError {
  return new AgentOsError('APPROVAL_EXPIRED', 'Capability approval expired.');
}

function toPrismaJson(
  value: unknown,
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  try {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new Error('capability_invocation_json_required');
    const plainJson = JSON.parse(encoded) as unknown;
    return plainJson === null
      ? Prisma.JsonNull
      : (plainJson as Prisma.InputJsonValue);
  } catch {
    throw new Error('capability_invocation_json_required');
  }
}
