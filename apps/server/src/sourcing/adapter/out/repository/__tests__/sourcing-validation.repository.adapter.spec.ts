import { describe, expect, it, vi } from 'vitest';
import { SourcingValidationRepositoryAdapter } from '../sourcing-validation.repository.adapter';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const RUN_ID = '00000000-0000-4000-8000-000000000002';
const ITEM_ID = '00000000-0000-4000-8000-000000000003';
const EVIDENCE_ID = '00000000-0000-4000-8000-000000000004';

describe('SourcingValidationRepositoryAdapter', () => {
  it('writes episode, checks, and evidence links with constant batch operations', async () => {
    const tx = {
      sourcingRecommendationItem: {
        findMany: vi.fn(async () => [{ id: ITEM_ID }]),
      },
      sourcingValidationEpisode: {
        findMany: vi.fn(async () => []),
        createMany: vi.fn(async () => ({ count: 1 })),
      },
      sourcingEvidenceObservation: {
        findMany: vi.fn(async () => [{ id: EVIDENCE_ID }]),
      },
      sourcingValidationCheck: {
        createMany: vi.fn(async () => ({ count: 10 })),
      },
      sourcingValidationCheckEvidence: {
        createMany: vi.fn(async () => ({ count: 10 })),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback) => callback(tx)),
      sourcingValidationEpisode: {
        findMany: vi.fn(async () => [storedEpisode()]),
      },
    };
    const repository = new SourcingValidationRepositoryAdapter(prisma as never);

    const result = await repository.replaceForRun({
      organizationId: ORGANIZATION_ID,
      recommendationRunId: RUN_ID,
      episodes: [episode()],
    });

    expect(result).toMatchObject([{ itemKey: 'a'.repeat(64), status: 'blocked' }]);
    expect(tx.sourcingValidationEpisode.createMany).toHaveBeenCalledOnce();
    expect(tx.sourcingValidationCheck.createMany).toHaveBeenCalledOnce();
    expect(tx.sourcingValidationCheckEvidence.createMany).toHaveBeenCalledOnce();
  });

  it('replays an existing immutable run item graph without episode, check, or link writes', async () => {
    let episodeExists = false;
    const tx = {
      $queryRaw: vi.fn(async () => [{ lock: 'locked' }]),
      sourcingRecommendationItem: {
        findMany: vi.fn(async () => [{ id: ITEM_ID }]),
      },
      sourcingValidationEpisode: {
        findMany: vi.fn(async () => episodeExists ? [{ recommendationItemId: ITEM_ID }] : []),
        createMany: vi.fn(async () => {
          episodeExists = true;
          return { count: 1 };
        }),
      },
      sourcingEvidenceObservation: {
        findMany: vi.fn(async () => [{ id: EVIDENCE_ID }]),
      },
      sourcingValidationCheck: {
        createMany: vi.fn(async () => ({ count: 10 })),
      },
      sourcingValidationCheckEvidence: {
        createMany: vi.fn(async () => ({ count: 10 })),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)),
      sourcingValidationEpisode: {
        findMany: vi.fn(async () => [storedEpisode()]),
      },
    };
    const repository = new SourcingValidationRepositoryAdapter(prisma as never);
    const command = {
      organizationId: ORGANIZATION_ID,
      recommendationRunId: RUN_ID,
      idempotencyKey: 'validation-owner-key',
      episodes: [episode()],
    };

    const first = await repository.replaceForRun(command);
    const replay = await repository.replaceForRun(command);

    expect(replay).toEqual(first);
    expect(tx.sourcingValidationEpisode.createMany).toHaveBeenCalledOnce();
    expect(tx.sourcingValidationCheck.createMany).toHaveBeenCalledOnce();
    expect(tx.sourcingValidationCheckEvidence.createMany).toHaveBeenCalledOnce();
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('takes an exact owner-key transaction lock before the immutable validation create-or-get', async () => {
    const tx = {
      $queryRaw: vi.fn(async () => [{ lock: 'locked' }]),
      sourcingRecommendationItem: { findMany: vi.fn(async () => [{ id: ITEM_ID }]) },
      sourcingValidationEpisode: {
        findMany: vi.fn(async () => [{ recommendationItemId: ITEM_ID }]),
        createMany: vi.fn(),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback) => callback(tx)),
      sourcingValidationEpisode: { findMany: vi.fn(async () => [storedEpisode()]) },
    };
    const repository = new SourcingValidationRepositoryAdapter(prisma as never);

    await repository.replaceForRun({
      organizationId: ORGANIZATION_ID,
      recommendationRunId: RUN_ID,
      idempotencyKey: 'validation-owner-key',
      episodes: [episode()],
    });

    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(tx.sourcingValidationEpisode.createMany).not.toHaveBeenCalled();
  });

  it('replays the Sourcing owner receipt only for its exact canonical input hash', async () => {
    let receipt: { requestHash: string; result: unknown } | null = null;
    const tx = {
      $queryRaw: vi.fn(async () => [{ lock: 'locked' }]),
      sourcingOwnerIdempotencyReceipt: {
        findFirst: vi.fn(async () => receipt),
        create: vi.fn(async ({ data }) => {
          receipt = { requestHash: data.requestHash, result: data.result };
          return receipt;
        }),
      },
      sourcingRecommendationItem: { findMany: vi.fn(async () => [{ id: ITEM_ID }]) },
      sourcingValidationEpisode: {
        findMany: vi.fn(async () => []),
        createMany: vi.fn(async () => ({ count: 1 })),
      },
      sourcingEvidenceObservation: { findMany: vi.fn(async () => [{ id: EVIDENCE_ID }]) },
      sourcingValidationCheck: { createMany: vi.fn(async () => ({ count: 1 })) },
      sourcingValidationCheckEvidence: { createMany: vi.fn(async () => ({ count: 1 })) },
    };
    const prisma = {
      $transaction: vi.fn(async (callback) => callback(tx)),
      sourcingValidationEpisode: { findMany: vi.fn(async () => [storedEpisode()]) },
    };
    const repository = new SourcingValidationRepositoryAdapter(prisma as never);
    const command = {
      organizationId: ORGANIZATION_ID,
      recommendationRunId: RUN_ID,
      idempotencyKey: 'capability-invocation:00000000-0000-4000-8000-000000000011',
      requestHash: 'a'.repeat(64),
      episodes: [episode()],
    };

    await repository.replaceForRun(command);
    await expect(repository.replaceForRun({
      ...command,
      requestHash: 'b'.repeat(64),
    })).rejects.toThrow('owner_idempotency_input_conflict');
    expect(tx.sourcingOwnerIdempotencyReceipt.create).toHaveBeenCalledOnce();
  });

  it('orders validation pages by updated time and id without exposing malformed image URLs', async () => {
    const prisma = {
      sourcingValidationEpisode: {
        findMany: vi.fn(async () => [storedEpisode({
          recommendationItem: {
            itemKey: 'a'.repeat(64),
            displayName: '유아 우산',
            sourceSnapshot: { imageUrl: 'not-a-url' },
          },
        })]),
      },
    };
    const repository = new SourcingValidationRepositoryAdapter(prisma as never);

    const result = await repository.listForRun({
      organizationId: ORGANIZATION_ID,
      recommendationRunId: RUN_ID,
      limit: 50,
    });

    expect(result.items[0]).toMatchObject({ imageUrl: null });
    expect(prisma.sourcingValidationEpisode.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ organizationId: ORGANIZATION_ID, recommendationRunId: RUN_ID }),
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: 51,
    }));
  });

  it('lists the persisted validation episodes for the exact recommendation run without hiding demand-only rows', async () => {
    const prisma = {
      sourcingValidationEpisode: {
        findMany: vi.fn(async () => []),
      },
    };
    const repository = new SourcingValidationRepositoryAdapter(prisma as never);

    await repository.listForRun({
      organizationId: ORGANIZATION_ID,
      recommendationRunId: RUN_ID,
      limit: 50,
    });

    const query = vi.mocked(prisma.sourcingValidationEpisode.findMany).mock.calls[0][0];
    expect(query).toEqual(expect.objectContaining({
      where: expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        recommendationRunId: RUN_ID,
      }),
    }));
    expect(query.where).not.toHaveProperty('recommendationItem');
  });
});

function episode() {
  return {
    recommendationItemId: ITEM_ID,
    status: 'blocked' as const,
    policyKey: 'sourcing_validation' as const,
    policyVersion: '2026-08-10',
    evidenceCutoffAt: new Date('2026-08-10T00:00:00.000Z'),
    completedAt: new Date('2026-08-10T00:00:00.000Z'),
    validUntil: null,
    summary: { score: 80, landedCostKrw: null, expectedMarginBps: null },
    checks: Array.from({ length: 10 }, (_, index) => ({
      checkKey: `check-${index}`,
      status: 'missing' as const,
      severity: 'warning',
      score: null,
      summary: null,
      details: {},
      evidenceObservationIds: [EVIDENCE_ID],
    })),
  };
}

function storedEpisode(overrides: Record<string, unknown> = {}) {
  return {
    id: '00000000-0000-4000-8000-000000000010',
    recommendationRunId: RUN_ID,
    status: 'blocked',
    validUntil: null,
    summary: { score: 80, landedCostKrw: null, expectedMarginBps: null },
    updatedAt: new Date('2026-08-10T00:00:00.000Z'),
    recommendationItem: {
      itemKey: 'a'.repeat(64),
      displayName: '유아 우산',
      sourceSnapshot: { imageUrl: 'https://example.test/umbrella.jpg' },
    },
    checks: [{ checkKey: 'landed_cost', status: 'missing', summary: 'missing' }],
    ...overrides,
  };
}
