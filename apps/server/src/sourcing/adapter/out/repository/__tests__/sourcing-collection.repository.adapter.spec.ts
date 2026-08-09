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
    },
  };
  const prisma = {
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  return new SourcingCollectionRepositoryAdapter(prisma as never);
}

describe('SourcingCollectionRepositoryAdapter checkpoints', () => {
  it('uses the persisted lease token, generation, cancellation, and DB clock as a fence', async () => {
    await expect(adapter(run()).checkpoint(permit)).resolves.toBe('continue');
    await expect(adapter(run({ cancelRequestedAt: new Date() })).checkpoint(permit)).resolves.toBe(
      'cancel',
    );
    await expect(adapter(run({ generation: 3 })).checkpoint(permit)).resolves.toBe('superseded');
    await expect(
      adapter(run({ leaseExpiresAt: new Date('2026-08-08T00:59:59.000Z') })).checkpoint(permit),
    ).resolves.toBe('superseded');
  });
});
