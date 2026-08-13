import { describe, expect, it, vi } from 'vitest';
import type {
  ClaimAuthorizedRunInput,
  SourcingCollectionPermit,
  SourcingCollectionRepositoryPort,
} from '../../port/out/repository/sourcing-collection.repository.port';
import { SourcingCollectionCoordinator } from '../sourcing-collection-coordinator.service';

const permit: SourcingCollectionPermit = {
  runId: 'run-1',
  organizationId: '00000000-0000-4000-8000-000000000001',
  sourceKey: '1688.hot_product',
  scopeKey: 'default',
  targetKey: 'children-plate',
  leaseToken: '00000000-0000-4000-8000-000000000010',
  generation: 1,
  leaseExpiresAt: new Date('2026-08-08T01:02:00.000Z'),
};

const request: ClaimAuthorizedRunInput = {
  organizationId: permit.organizationId,
  sourceKey: permit.sourceKey,
  scopeKey: permit.scopeKey,
  targetKey: permit.targetKey,
  idempotencyKey: 'operation-1:1688:children-plate',
  requestHash: 'b'.repeat(64),
  collectorKey: 'trend-1688-hot-product',
  collectorVersion: '2026-08-08',
  triggerKind: 'manual',
  triggeredByUserId: null,
  leaseDurationMs: 120_000,
};

function repository(): SourcingCollectionRepositoryPort {
  return {
    claimAuthorizedRun: vi.fn(),
    resumeAuthorizedRun: vi.fn(),
    checkpoint: vi.fn(async () => 'continue' as const),
    commit: vi.fn(async () => ({
      kind: 'committed',
      runId: permit.runId,
      acceptedCount: 0,
      duplicateCount: 0,
      staleDiscardedCount: 0,
    } as const)),
    fail: vi.fn(async () => undefined),
    requestCancel: vi.fn(async () => undefined),
  };
}

describe('SourcingCollectionCoordinator', () => {
  it.each(['source_not_allowed', 'source_disabled'] as const)(
    'does not call a provider or commit when the source is %s',
    async (state) => {
      const collectionRepository = repository();
      vi.mocked(collectionRepository.claimAuthorizedRun).mockResolvedValue({
        kind: 'denied',
        reasonCode: state,
      });
      const provider = vi.fn();
      const coordinator = new SourcingCollectionCoordinator(collectionRepository);

      await expect(coordinator.execute(request, provider)).rejects.toMatchObject({
        response: { code: state },
      });
      expect(provider).not.toHaveBeenCalled();
      expect(collectionRepository.commit).not.toHaveBeenCalled();
    },
  );

  it('discards results when the source is disabled during provider IO', async () => {
    const collectionRepository = repository();
    vi.mocked(collectionRepository.claimAuthorizedRun).mockResolvedValue({
      kind: 'claimed',
      permit,
    });
    vi.mocked(collectionRepository.commit).mockResolvedValue({
      kind: 'source_denied',
      reasonCode: 'source_disabled',
    });
    const provider = vi.fn(async () => ({
      observations: [],
      typedRecords: [],
      discoveredCount: 0,
      rejectedCount: 0,
      qualityReport: {},
    }));
    const coordinator = new SourcingCollectionCoordinator(collectionRepository);

    await expect(coordinator.execute(request, provider)).rejects.toMatchObject({
      response: { code: 'source_disabled' },
    });
    expect(provider).toHaveBeenCalledTimes(1);
    expect(collectionRepository.commit).toHaveBeenCalledTimes(1);
    expect(collectionRepository.fail).not.toHaveBeenCalled();
  });

  it('does not repeat provider IO for an active idempotent run', async () => {
    const collectionRepository = repository();
    vi.mocked(collectionRepository.claimAuthorizedRun).mockResolvedValue({
      kind: 'existing',
      permit,
    });
    const provider = vi.fn();
    const coordinator = new SourcingCollectionCoordinator(collectionRepository);

    await expect(coordinator.execute(request, provider)).resolves.toEqual({
      kind: 'existing',
      runId: permit.runId,
    });
    expect(provider).not.toHaveBeenCalled();
  });

  it('uses only a pre-issued permit when an extension v2 commit requires one', async () => {
    const collectionRepository = repository();
    vi.mocked(collectionRepository.resumeAuthorizedRun).mockResolvedValue({
      kind: 'existing',
      permit,
    });
    const provider = vi.fn(async () => ({
      observations: [], typedRecords: [], discoveredCount: 0, rejectedCount: 0, qualityReport: {},
    }));
    const coordinator = new SourcingCollectionCoordinator(collectionRepository);

    await expect(coordinator.execute({ ...request, requireExistingPermit: true }, provider))
      .resolves.toMatchObject({ kind: 'committed', runId: permit.runId });
    expect(collectionRepository.resumeAuthorizedRun).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: request.idempotencyKey }),
    );
    expect(collectionRepository.claimAuthorizedRun).not.toHaveBeenCalled();
  });
});
