import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { canonicalOwnerInputHash } from '../../../../common/owner-idempotency-key';
import { PrismaCapabilityInvocationRepository } from './prisma-capability-invocation.repository';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';
const INVOCATION_ID = '00000000-0000-4000-8000-000000000003';
const NOW = new Date('2026-08-25T00:00:00.000Z');

describe('PrismaCapabilityInvocationRepository', () => {
  it('uses the unique insert winner for exact replay and rejects request-key drift', async () => {
    const row = invocationRow();
    const create = vi.fn().mockRejectedValue({ code: 'P2002' });
    const findFirst = vi.fn().mockResolvedValue(row);
    const repository = subject({ create, findFirst, updateMany: vi.fn() });

    await expect(repository.admit(admission())).resolves.toMatchObject({
      kind: 'replay',
      invocation: { id: INVOCATION_ID },
    });
    await expect(
      repository.admit({ ...admission(), actingAgentKey: 'supply' }),
    ).resolves.toMatchObject({
      kind: 'conflict',
      invocation: { id: INVOCATION_ID },
    });
    expect(create).toHaveBeenCalledTimes(2);
    expect(findFirst).toHaveBeenCalledWith({
      where: { organizationId: ORGANIZATION_ID, requestKey: 'request-1' },
    });
  });

  it('round-trips durable JSON before passing it to Prisma and rejects non-serializable values', async () => {
    const create = vi.fn().mockResolvedValue(invocationRow());
    const repository = subject({ create, findFirst: vi.fn(), updateMany: vi.fn() });
    const observedAt = new Date('2026-08-25T12:00:00.000Z');

    await repository.admit({
      ...admission(),
      canonicalInput: { observedAt },
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        canonicalInput: { observedAt: '2026-08-25T12:00:00.000Z' },
      }),
    });

    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    await expect(
      repository.admit({ ...admission(), canonicalInput: cyclic }),
    ).rejects.toThrow('capability_invocation_json_required');
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('lazily expires a pending approval with a conditional row fence', async () => {
    const expiredAt = new Date('2026-08-25T00:00:00.000Z');
    const pending = invocationRow({
      approvalStatus: 'pending',
      approvalInputHash: INPUT_HASH,
      approvalRequestedAt: new Date('2026-08-24T23:30:00.000Z'),
      approvalExpiresAt: expiredAt,
    });
    const expired = invocationRow({
      status: 'failed',
      approvalStatus: 'expired',
      approvalInputHash: INPUT_HASH,
      approvalRequestedAt: new Date('2026-08-24T23:30:00.000Z'),
      approvalExpiresAt: expiredAt,
      error: {
        code: 'APPROVAL_EXPIRED',
        message: 'Capability approval expired before execution.',
      },
      finishedAt: NOW,
    });
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce(pending)
      .mockResolvedValueOnce(expired);
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const repository = subject({ create: vi.fn(), findFirst, updateMany });

    await expect(
      repository.findById({ organizationId: ORGANIZATION_ID, invocationId: INVOCATION_ID }),
    ).resolves.toMatchObject({ status: 'failed', approvalStatus: 'expired' });
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: INVOCATION_ID,
        organizationId: ORGANIZATION_ID,
        status: 'pending',
        approvalStatus: 'pending',
        approvalExpiresAt: { lte: NOW },
      },
      data: {
        status: 'failed',
        approvalStatus: 'expired',
        error: {
          code: 'APPROVAL_EXPIRED',
          message: 'Capability approval expired before execution.',
        },
        finishedAt: NOW,
      },
    });
  });

  it('fences approval on the admitted hash and replays the identical decision', async () => {
    const pending = invocationRow({
      approvalStatus: 'pending',
      approvalInputHash: INPUT_HASH,
      approvalRequestedAt: NOW,
      approvalExpiresAt: new Date('2026-08-25T00:30:00.000Z'),
    });
    const approved = invocationRow({
      approvalStatus: 'approved',
      approvalInputHash: INPUT_HASH,
      approvalRequestedAt: NOW,
      approvalExpiresAt: new Date('2026-08-25T00:30:00.000Z'),
      approvalDecidedByUserId: USER_ID,
      approvalDecisionReason: 'Reviewed',
      approvalDecidedAt: NOW,
    });
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce(pending)
      .mockResolvedValueOnce(pending)
      .mockResolvedValueOnce(approved)
      .mockResolvedValueOnce(approved)
      .mockResolvedValueOnce(approved)
      .mockResolvedValueOnce(approved);
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const repository = subject({ create: vi.fn(), findFirst, updateMany });

    await expect(repository.decideApproval(approval())).resolves.toMatchObject({
      status: 'pending',
      approvalStatus: 'approved',
    });
    await expect(repository.decideApproval(approval())).resolves.toMatchObject({
      status: 'pending',
      approvalStatus: 'approved',
    });
    expect(updateMany).toHaveBeenCalledTimes(1);

    const fencedRepository = subject({
      create: vi.fn(),
      findFirst: vi.fn().mockResolvedValue(pending),
      updateMany: vi.fn(),
    });
    await expect(
      fencedRepository.decideApproval({ ...approval(), inputHash: 'b'.repeat(64) }),
    ).rejects.toMatchObject({ code: 'REQUEST_KEY_CONFLICT' });
  });

  it('returns the concurrent finalization winner instead of overwriting it', async () => {
    const completed = completedEnvelope();
    const pending = invocationRow();
    const winner = invocationRow({
      status: 'succeeded',
      result: completed,
      finishedAt: NOW,
    });
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce(pending)
      .mockResolvedValueOnce(pending)
      .mockResolvedValueOnce(winner)
      .mockResolvedValueOnce(winner);
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const repository = subject({ create: vi.fn(), findFirst, updateMany });

    await expect(
      repository.recordSucceeded({
        organizationId: ORGANIZATION_ID,
        invocationId: INVOCATION_ID,
        result: completed,
        finishedAt: NOW,
      }),
    ).resolves.toMatchObject({ status: 'succeeded', result: completed });
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: INVOCATION_ID,
        organizationId: ORGANIZATION_ID,
        status: 'pending',
        approvalStatus: { in: ['not_required', 'approved'] },
      },
      data: {
        status: 'succeeded',
        result: completed,
        error: Prisma.DbNull,
        finishedAt: NOW,
      },
    });
  });
});

const INPUT = { candidateId: '00000000-0000-4000-8000-000000000004' };
const INPUT_HASH = canonicalOwnerInputHash(INPUT);

function subject(capabilityInvocation: Record<string, unknown>) {
  return new PrismaCapabilityInvocationRepository(
    { capabilityInvocation } as never,
    () => NOW,
  );
}

function admission() {
  return {
    organizationId: ORGANIZATION_ID,
    initiatingUserId: USER_ID,
    capabilityKey: 'products.create_listing_generation_package',
    actingAgentKey: 'merchandising',
    requestKey: 'request-1',
    canonicalInput: INPUT,
    inputHash: INPUT_HASH,
    approval: {
      required: false,
      requestedAt: NOW,
      expiresAt: null,
    },
  };
}

function approval() {
  return {
    organizationId: ORGANIZATION_ID,
    invocationId: INVOCATION_ID,
    userId: USER_ID,
    inputHash: INPUT_HASH,
    decision: 'approved' as const,
    reason: 'Reviewed',
    decidedAt: NOW,
  };
}

function invocationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: INVOCATION_ID,
    organizationId: ORGANIZATION_ID,
    initiatingUserId: USER_ID,
    capabilityKey: 'products.create_listing_generation_package',
    actingAgentKey: 'merchandising',
    requestKey: 'request-1',
    canonicalInput: INPUT,
    inputHash: INPUT_HASH,
    status: 'pending',
    approvalStatus: 'not_required',
    approvalInputHash: null,
    approvalRequestedAt: null,
    approvalExpiresAt: null,
    approvalDecidedByUserId: null,
    approvalDecisionReason: null,
    approvalDecidedAt: null,
    result: null,
    error: null,
    createdAt: NOW,
    updatedAt: NOW,
    finishedAt: null,
    ...overrides,
  };
}

function completedEnvelope() {
  return {
    summary: 'Listing package created.',
    resourceRefs: [
      {
        kind: 'sourcing_candidate',
        id: '00000000-0000-4000-8000-000000000004',
        version: null,
      },
    ],
    operationRefs: [],
    output: { candidateId: '00000000-0000-4000-8000-000000000004' },
  };
}
