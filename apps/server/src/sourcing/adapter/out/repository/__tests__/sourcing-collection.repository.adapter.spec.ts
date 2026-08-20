import { describe, expect, it, vi } from 'vitest';
import { SourcingCollectionRepositoryAdapter } from '../sourcing-collection.repository.adapter';

const permit = {
  runId: '00000000-0000-4000-8000-000000000001',
  organizationId: '00000000-0000-4000-8000-000000000002',
  sourceKey: '1688.hot_product',
  scopeKey: 'default',
  targetKey: 'children plate',
  leaseToken: '00000000-0000-4000-8000-000000000003',
  generation: 2,
  leaseExpiresAt: new Date('2026-08-08T01:02:00.000Z'),
};

const recoverableInput = {
  organizationId: permit.organizationId,
  sourceKey: 'coupang.wing_catalog',
  scopeKey: 'default',
  targetKey: 'finalize:00000000-0000-4000-8000-000000000010',
  idempotencyKey: 'wing-operation:00000000-0000-4000-8000-000000000010:finalize',
  requestHash: 'a'.repeat(64),
  collectorKey: 'wing-catalog-operation-finalize',
  collectorVersion: '2026-08-14',
  triggerKind: 'extension' as const,
  triggeredByUserId: null,
  leaseDurationMs: 120_000,
};

function run(overrides: Record<string, unknown> = {}) {
  return {
    id: permit.runId,
    organizationId: permit.organizationId,
    leaseToken: permit.leaseToken,
    generation: permit.generation,
    status: 'collecting',
    cancelRequestedAt: null,
    leaseExpiresAt: permit.leaseExpiresAt,
    ...overrides,
  };
}

function adapter(row: Record<string, unknown> | null) {
  const tx = {
    $queryRaw: vi.fn(async () => [{ now: new Date('2026-08-08T01:00:00.000Z') }]),
    sourcingEvidenceIngestionRun: {
      findFirst: vi.fn(async () => row),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        ...row,
        ...data,
      })),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: permit.runId,
        leaseToken: permit.leaseToken,
        generation: 1,
        ...data,
      })),
    },
    sourcingCollectionSourceControl: {
      findUnique: vi.fn(async () => null),
    },
  };
  const prisma = {
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  return { repository: new SourcingCollectionRepositoryAdapter(prisma as never), tx };
}

describe('SourcingCollectionRepositoryAdapter checkpoints', () => {
  it('uses the persisted lease token, generation, cancellation, and DB clock as a fence', async () => {
    await expect(adapter(run()).repository.checkpoint(permit)).resolves.toBe('continue');
    await expect(adapter(run({ cancelRequestedAt: new Date() })).repository.checkpoint(permit)).resolves.toBe(
      'cancel',
    );
    await expect(adapter(run({ generation: 3 })).repository.checkpoint(permit)).resolves.toBe('superseded');
    await expect(
      adapter(run({ leaseExpiresAt: new Date('2026-08-08T00:59:59.000Z') })).repository.checkpoint(permit),
    ).resolves.toBe('superseded');
  });
});

describe('SourcingCollectionRepositoryAdapter recoverable finalize claims', () => {
  function recoverableRun(overrides: Record<string, unknown> = {}) {
    return run({
      sourceKey: recoverableInput.sourceKey,
      scopeKey: recoverableInput.scopeKey,
      targetKey: recoverableInput.targetKey,
      idempotencyKey: recoverableInput.idempotencyKey,
      requestHash: recoverableInput.requestHash,
      collectorKey: recoverableInput.collectorKey,
      collectorVersion: recoverableInput.collectorVersion,
      ...overrides,
    });
  }

  it('distinguishes completed and live in-progress markers without mutating them', async () => {
    const completed = adapter(recoverableRun({ status: 'complete' }));
    await expect(completed.repository.claimRecoverableRun(recoverableInput))
      .resolves.toEqual({ kind: 'completed', runId: permit.runId });
    expect(completed.tx.sourcingEvidenceIngestionRun.update).not.toHaveBeenCalled();

    const active = adapter(recoverableRun());
    await expect(active.repository.claimRecoverableRun(recoverableInput))
      .resolves.toEqual({
        kind: 'in_progress',
        runId: permit.runId,
        leaseExpiresAt: permit.leaseExpiresAt,
      });
    expect(active.tx.sourcingEvidenceIngestionRun.update).not.toHaveBeenCalled();
  });

  it.each([
    ['failed marker', { status: 'failed', completedAt: new Date('2026-08-08T00:59:00.000Z') }],
    ['expired claim', { leaseExpiresAt: new Date('2026-08-08T00:59:59.000Z') }],
  ])('reclaims a matching %s with a new fenced generation', async (_label, overrides) => {
    const current = adapter(recoverableRun(overrides));

    const claim = await current.repository.claimRecoverableRun(recoverableInput);

    expect(claim).toMatchObject({
      kind: 'claimed',
      permit: {
        runId: permit.runId,
        generation: permit.generation + 1,
        targetKey: recoverableInput.targetKey,
      },
    });
    expect(current.tx.sourcingEvidenceIngestionRun.update).toHaveBeenCalledWith({
      where: { id: permit.runId },
      data: expect.objectContaining({
        status: 'collecting',
        generation: permit.generation + 1,
        completedAt: null,
        errorCode: null,
        errorMessage: null,
      }),
    });
  });

  it('rejects a mismatched immutable request identity instead of reclaiming it', async () => {
    const current = adapter(recoverableRun({ requestHash: 'b'.repeat(64) }));

    await expect(current.repository.claimRecoverableRun(recoverableInput))
      .resolves.toEqual({ kind: 'idempotency_conflict' });
    expect(current.tx.sourcingEvidenceIngestionRun.update).not.toHaveBeenCalled();
  });
});
