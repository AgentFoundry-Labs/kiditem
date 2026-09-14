import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { canonicalOwnerInputHash } from '../../../../common/owner-idempotency-key';
import {
  capabilityApprovalStateWhere,
  PrismaCapabilityInvocationRepository,
} from './prisma-capability-invocation.repository';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';
const INVOCATION_ID = '00000000-0000-4000-8000-000000000003';
const NOW = new Date('2026-08-25T00:00:00.000Z');
const APPROVAL_EXPIRED_ERROR = {
  code: 'APPROVAL_EXPIRED',
  message: 'Capability approval expired before execution.',
};

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
    await expect(
      repository.admit({
        ...admission(),
        initiatingUserId: '00000000-0000-4000-8000-000000000009',
      }),
    ).resolves.toMatchObject({
      kind: 'conflict',
      invocation: { id: INVOCATION_ID },
    });
    expect(create).toHaveBeenCalledTimes(3);
    expect(findFirst).toHaveBeenCalledWith({
      where: { organizationId: ORGANIZATION_ID, requestKey: 'request-1' },
    });
  });

  it('looks up a durable request key only inside its organization fence', async () => {
    const findFirst = vi.fn().mockResolvedValue(invocationRow());
    const repository = subject({ create: vi.fn(), findFirst, updateMany: vi.fn() });

    await expect(repository.findByRequestKey({
      organizationId: ORGANIZATION_ID,
      requestKey: 'request-1',
    })).resolves.toMatchObject({
      id: INVOCATION_ID,
      organizationId: ORGANIZATION_ID,
      requestKey: 'request-1',
    });

    expect(findFirst).toHaveBeenCalledTimes(2);
    expect(findFirst).toHaveBeenNthCalledWith(1, {
      where: { organizationId: ORGANIZATION_ID, requestKey: 'request-1' },
    });
    expect(findFirst).toHaveBeenNthCalledWith(2, {
      where: { organizationId: ORGANIZATION_ID, requestKey: 'request-1' },
    });
  });

  it('admits approval facts without storing an approval word', async () => {
    const expiresAt = new Date('2026-08-25T00:30:00.000Z');
    const create = vi.fn().mockResolvedValue(invocationRow({
      approvalInputHash: INPUT_HASH,
      approvalRequestedAt: NOW,
      approvalExpiresAt: expiresAt,
    }));
    const repository = subject({ create, findFirst: vi.fn(), updateMany: vi.fn() });

    await repository.admit({
      ...admission(),
      approval: { required: true, requestedAt: NOW, expiresAt },
    });

    const data = create.mock.calls[0]?.[0]?.data;
    expect(data).toMatchObject({
      status: 'pending',
      approvalInputHash: INPUT_HASH,
      approvalRequestedAt: NOW,
      approvalExpiresAt: expiresAt,
    });
    expect(data).not.toHaveProperty('approvalStatus');
    expect(data).not.toHaveProperty('approvalDecision');
  });

  it('lists only a bounded approved-pending bootstrap recovery set', async () => {
    const approved = invocationRow({
      approvalInputHash: INPUT_HASH,
      approvalRequestedAt: NOW,
      approvalExpiresAt: new Date('2026-08-25T00:30:00.000Z'),
      approvalDecision: 'approved',
      approvalDecidedByUserId: USER_ID,
      approvalDecidedAt: NOW,
    });
    const findMany = vi.fn().mockResolvedValue([approved]);
    const repository = subject({
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany,
      updateMany: vi.fn(),
    });

    await expect(repository.listApprovedPending({ limit: 7 })).resolves.toEqual([approved]);
    expect(findMany).toHaveBeenCalledWith({
      where: { AND: [{ status: 'pending' }, { approvalDecision: 'approved' }] },
      orderBy: { createdAt: 'asc' },
      take: 7,
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

  it('lazily expires a lapsed approval by failing the invocation, not by storing a word', async () => {
    const pending = invocationRow({
      approvalInputHash: INPUT_HASH,
      approvalRequestedAt: new Date('2026-08-24T23:30:00.000Z'),
      approvalExpiresAt: NOW,
    });
    const expired = {
      ...pending,
      status: 'failed',
      error: APPROVAL_EXPIRED_ERROR,
      finishedAt: NOW,
    };
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce(pending)
      .mockResolvedValueOnce(expired);
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const repository = subject({ create: vi.fn(), findFirst, updateMany });

    await expect(
      repository.findById({ organizationId: ORGANIZATION_ID, invocationId: INVOCATION_ID }),
    ).resolves.toMatchObject({
      status: 'failed',
      approvalDecision: null,
      error: APPROVAL_EXPIRED_ERROR,
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        AND: [
          { id: INVOCATION_ID, organizationId: ORGANIZATION_ID, status: 'pending' },
          capabilityApprovalStateWhere('expired', NOW),
        ],
      },
      data: {
        status: 'failed',
        error: APPROVAL_EXPIRED_ERROR,
        finishedAt: NOW,
      },
    });
  });

  it('fences approval on the admitted hash, records only the decision fact, and replays the identical decision', async () => {
    const admitted = {
      approvalInputHash: INPUT_HASH,
      approvalRequestedAt: NOW,
      approvalExpiresAt: new Date('2026-08-25T00:30:00.000Z'),
    };
    const pending = invocationRow(admitted);
    const approved = invocationRow({
      ...admitted,
      approvalDecision: 'approved',
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
      invocation: {
        status: 'pending',
        approvalDecision: 'approved',
      },
      transitioned: true,
    });
    await expect(repository.decideApproval(approval())).resolves.toMatchObject({
      invocation: {
        status: 'pending',
        approvalDecision: 'approved',
      },
      transitioned: false,
    });
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        AND: [
          {
            id: INVOCATION_ID,
            organizationId: ORGANIZATION_ID,
            approvalInputHash: INPUT_HASH,
            inputHash: INPUT_HASH,
          },
          capabilityApprovalStateWhere('pending', NOW),
        ],
      },
      data: {
        approvalDecision: 'approved',
        approvalDecidedByUserId: USER_ID,
        approvalDecisionReason: 'Reviewed',
        approvalDecidedAt: NOW,
      },
    });

    const fencedRepository = subject({
      create: vi.fn(),
      findFirst: vi.fn().mockResolvedValue(pending),
      updateMany: vi.fn(),
    });
    await expect(
      fencedRepository.decideApproval({ ...approval(), inputHash: 'b'.repeat(64) }),
    ).rejects.toMatchObject({ code: 'REQUEST_KEY_CONFLICT' });
  });

  it('refuses a decision at the expiry boundary and fails the invocation without a doomed write', async () => {
    const expiresAt = new Date('2026-08-25T00:00:00.001Z');
    const pending = invocationRow({
      approvalInputHash: INPUT_HASH,
      approvalRequestedAt: NOW,
      approvalExpiresAt: expiresAt,
    });
    const findFirst = vi.fn().mockResolvedValue(pending);
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const repository = subject({ create: vi.fn(), findFirst, updateMany });
    const decision = { ...approval(), decidedAt: expiresAt };

    await expect(repository.decideApproval(decision)).rejects.toMatchObject({
      code: 'APPROVAL_EXPIRED',
    });
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        AND: [
          { id: INVOCATION_ID, organizationId: ORGANIZATION_ID, status: 'pending' },
          capabilityApprovalStateWhere('expired', expiresAt),
        ],
      },
      data: {
        status: 'failed',
        error: APPROVAL_EXPIRED_ERROR,
        finishedAt: expiresAt,
      },
    });
  });

  it('reports the expiry sweep when it wins the conditional write against a decision', async () => {
    const pending = invocationRow({
      approvalInputHash: INPUT_HASH,
      approvalRequestedAt: NOW,
      approvalExpiresAt: new Date('2026-08-25T00:30:00.000Z'),
    });
    const swept = {
      ...pending,
      status: 'failed',
      error: APPROVAL_EXPIRED_ERROR,
      finishedAt: new Date('2026-08-25T00:30:00.000Z'),
    };
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce(pending)
      .mockResolvedValueOnce(pending)
      .mockResolvedValueOnce(swept)
      .mockResolvedValueOnce(swept);
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const repository = subject({ create: vi.fn(), findFirst, updateMany });

    await expect(repository.decideApproval(approval())).rejects.toMatchObject({
      code: 'APPROVAL_EXPIRED',
    });
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ approvalDecision: 'approved' }),
    }));
  });

  it('returns the concurrent finalization winner instead of overwriting it', async () => {
    const completed = completedReceipt();
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
        AND: [
          { id: INVOCATION_ID, organizationId: ORGANIZATION_ID, status: 'pending' },
          {
            OR: [
              capabilityApprovalStateWhere('not_required', NOW),
              capabilityApprovalStateWhere('approved', NOW),
            ],
          },
        ],
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
    approvalInputHash: null,
    approvalRequestedAt: null,
    approvalExpiresAt: null,
    approvalDecision: null,
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

function completedReceipt() {
  return {
    summary: 'Listing package created.',
    resourceRefs: [
      {
        kind: 'sourcing_candidate',
        id: '00000000-0000-4000-8000-000000000004',
        version: null,
      },
    ],
  };
}
