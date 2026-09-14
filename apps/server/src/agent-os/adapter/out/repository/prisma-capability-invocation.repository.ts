import { Injectable } from '@nestjs/common';
import {
  CapabilityInvocationErrorSchema,
  CapabilityResultReceiptSchema,
  type CapabilityInvocationApprovalStatus,
} from '@kiditem/shared/agent-interaction';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { AgentOsError } from '../../../domain/agent-os.errors';
import { deriveCapabilityApprovalState } from '../../../domain/capability/capability-invocation.policy';
import type {
  AdmissionResult,
  AdmitCapabilityInvocation,
  CapabilityInvocationRecord,
  CapabilityInvocationRepositoryPort,
  DecideInvocationApproval,
  DecideInvocationApprovalResult,
  InvocationFence,
  InvocationRequestKeyFence,
  ListApprovedPendingCapabilityInvocations,
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

  async listApprovedPending(
    input: ListApprovedPendingCapabilityInvocations,
  ): Promise<CapabilityInvocationRecord[]> {
    const rows = await this.prisma.capabilityInvocation.findMany({
      where: {
        AND: [
          { status: 'pending' },
          capabilityApprovalStateWhere('approved', this.now()),
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: input.limit,
    });
    return rows.map(parseRow);
  }

  async decideApproval(
    input: DecideInvocationApproval,
  ): Promise<DecideInvocationApprovalResult> {
    const current = await this.requiredCurrent(input);
    const approval = deriveCapabilityApprovalState(current, input.decidedAt);
    if (approval === 'expired') {
      return this.refuseExpiredDecision(current, input.decidedAt);
    }
    if (approval === 'not_required') {
      throw new AgentOsError('APPROVAL_REQUIRED', 'This invocation does not await approval.');
    }
    if (current.approvalInputHash !== input.inputHash || current.inputHash !== input.inputHash) {
      throw new AgentOsError('REQUEST_KEY_CONFLICT', 'Approval input does not match the admitted invocation.');
    }
    if (approval !== 'pending') return settledDecision(current, approval, input.decision);

    const rejected = input.decision === 'rejected';
    const update = await this.prisma.capabilityInvocation.updateMany({
      where: {
        AND: [
          {
            id: input.invocationId,
            organizationId: input.organizationId,
            approvalInputHash: input.inputHash,
            inputHash: input.inputHash,
          },
          capabilityApprovalStateWhere('pending', input.decidedAt),
        ],
      },
      data: {
        approvalDecision: input.decision,
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
      return { invocation: await this.requiredCurrent(input), transitioned: true };
    }

    // A concurrent decision or the expiry sweep won the conditional write.
    const winner = await this.requiredCurrent(input);
    const settled = deriveCapabilityApprovalState(winner, input.decidedAt);
    if (settled === 'expired') {
      return this.refuseExpiredDecision(winner, input.decidedAt);
    }
    return settledDecision(winner, settled, input.decision);
  }

  async recordSucceeded(
    input: RecordInvocationSucceeded,
  ): Promise<CapabilityInvocationRecord> {
    const result = CapabilityResultReceiptSchema.parse(input.result);
    const current = await this.requiredCurrent(input);
    if (current.status !== 'pending') return current;
    const update = await this.prisma.capabilityInvocation.updateMany({
      where: {
        AND: [
          {
            id: input.invocationId,
            organizationId: input.organizationId,
            status: 'pending',
          },
          {
            OR: [
              capabilityApprovalStateWhere('not_required', input.finishedAt),
              capabilityApprovalStateWhere('approved', input.finishedAt),
            ],
          },
        ],
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

  private async refuseExpiredDecision(
    invocation: CapabilityInvocationRecord,
    at: Date,
  ): Promise<never> {
    await this.expireIfNecessary(invocation, at);
    throw approvalExpired();
  }

  /**
   * Conditional update is the row-lock fence for lazy expiry. It fails the
   * Invocation and stores no approval word: `failed` keeps it expired.
   */
  private async expireIfNecessary(
    invocation: CapabilityInvocationRecord,
    at: Date,
  ): Promise<void> {
    if (
      invocation.status !== 'pending'
      || deriveCapabilityApprovalState(invocation, at) !== 'expired'
    ) {
      return;
    }
    await this.prisma.capabilityInvocation.updateMany({
      where: {
        AND: [
          {
            id: invocation.id,
            organizationId: invocation.organizationId,
            status: 'pending',
          },
          capabilityApprovalStateWhere('expired', at),
        ],
      },
      data: {
        status: 'failed',
        error: toPrismaJson({
          code: 'APPROVAL_EXPIRED',
          message: 'Capability approval expired before execution.',
        }),
        finishedAt: at,
      },
    });
  }
}

/**
 * SQL form of `deriveCapabilityApprovalState` for this adapter's conditional
 * writes and bootstrap claim. Every approval predicate is built here, and
 * `capability-approval-state.pg.integration.spec.ts` proves each state selects
 * exactly the rows the domain rule derives.
 */
export function capabilityApprovalStateWhere(
  state: CapabilityInvocationApprovalStatus,
  at: Date,
): Prisma.CapabilityInvocationWhereInput {
  switch (state) {
    case 'approved':
    case 'rejected':
      return { approvalDecision: state };
    case 'not_required':
      return {
        approvalDecision: null,
        approvalInputHash: null,
        approvalRequestedAt: null,
        approvalExpiresAt: null,
      };
    case 'pending':
      return {
        approvalDecision: null,
        status: 'pending',
        approvalExpiresAt: { gt: at },
      };
    case 'expired':
      return {
        approvalDecision: null,
        AND: [
          {
            OR: [
              { approvalInputHash: { not: null } },
              { approvalRequestedAt: { not: null } },
              { approvalExpiresAt: { not: null } },
            ],
          },
          {
            OR: [
              { status: { not: 'pending' } },
              { approvalExpiresAt: null },
              { approvalExpiresAt: { lte: at } },
            ],
          },
        ],
      };
  }
}

function settledDecision(
  invocation: CapabilityInvocationRecord,
  approval: CapabilityInvocationApprovalStatus,
  decision: DecideInvocationApproval['decision'],
): DecideInvocationApprovalResult {
  if (approval === decision) return { invocation, transitioned: false };
  throw new AgentOsError('APPROVAL_REJECTED', 'Approval decision is immutable.');
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
