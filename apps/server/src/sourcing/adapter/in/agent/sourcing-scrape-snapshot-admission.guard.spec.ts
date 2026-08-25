import { describe, expect, it } from 'vitest';
import { SourcingScrapeSnapshotAdmissionGuard } from './sourcing-scrape-snapshot-admission.guard';

const context = {
  organizationId: '00000000-0000-4000-8000-000000000001',
  initiatingUserId: '00000000-0000-4000-8000-000000000002',
  attemptId: '00000000-0000-4000-8000-000000000003',
};
const snapshot = {
  sourceUrl: 'https://detail.1688.com/offer/1.html',
  platform: '1688' as const,
  title: 'Toy',
  price: 1,
  currency: 'CNY',
  variantKeyNormalized: '',
  images: [],
  contentHash: 'a'.repeat(64),
};

describe('SourcingScrapeSnapshotAdmissionGuard', () => {
  it('admits only the exact same-attempt normalized scrape snapshot before durable authorization', async () => {
    const guard = new SourcingScrapeSnapshotAdmissionGuard();
    guard.recordScrapeSnapshot({ ...context, snapshot });

    await expect(guard.admit({ ...context, capabilityKey: 'sourcing.ingestCandidate', input: { snapshot } })).resolves.toBeUndefined();
    await expect(guard.admit({ ...context, capabilityKey: 'sourcing.ingestCandidate', input: { snapshot: { ...snapshot, title: 'Fabricated' } } })).rejects.toThrow('sourcing_scrape_snapshot_unbound');
    await expect(guard.admit({ ...context, attemptId: '00000000-0000-4000-8000-000000000004', capabilityKey: 'sourcing.ingestCandidate', input: { snapshot } })).rejects.toThrow('sourcing_scrape_snapshot_unbound');
  });

  it('rejects an ingest after pre-admission process state has been lost', async () => {
    const guard = new SourcingScrapeSnapshotAdmissionGuard();
    await expect(guard.admit({ ...context, capabilityKey: 'sourcing.ingestCandidate', input: { snapshot } })).rejects.toThrow('sourcing_scrape_snapshot_unbound');
  });

  it('fails closed after the short attempt-local evidence TTL elapses', async () => {
    let now = 1_000;
    const guard = new SourcingScrapeSnapshotAdmissionGuard({
      now: () => new Date(now),
      ttlMs: 100,
    });
    guard.recordScrapeSnapshot({ ...context, snapshot });

    now += 101;
    await expect(guard.admit({
      ...context,
      capabilityKey: 'sourcing.ingestCandidate',
      input: { snapshot },
    })).rejects.toThrow('sourcing_scrape_snapshot_unbound');
  });

  it('rejects a new scrape admission rather than retaining evidence beyond the global cap', () => {
    const guard = new SourcingScrapeSnapshotAdmissionGuard({ maxEntries: 1 });
    guard.recordScrapeSnapshot({ ...context, snapshot });

    expect(() => guard.recordScrapeSnapshot({
      ...context,
      attemptId: '00000000-0000-4000-8000-000000000004',
      snapshot,
    })).toThrow('sourcing_scrape_snapshot_capacity_exhausted');
  });

  it('keeps exact same-attempt replay admissible while its short-lived evidence is still valid', async () => {
    const guard = new SourcingScrapeSnapshotAdmissionGuard();
    guard.recordScrapeSnapshot({ ...context, snapshot });
    const request = {
      ...context,
      capabilityKey: 'sourcing.ingestCandidate',
      input: { snapshot },
    };

    await expect(Promise.all([guard.admit(request), guard.admit(request)])).resolves.toEqual([
      undefined,
      undefined,
    ]);
  });

  it('keeps multiple exact server scrape fingerprints available for concurrent work in one Attempt', async () => {
    const guard = new SourcingScrapeSnapshotAdmissionGuard();
    const second = {
      ...snapshot,
      sourceUrl: 'https://detail.1688.com/offer/2.html',
      contentHash: 'b'.repeat(64),
    };
    guard.recordScrapeSnapshot({ ...context, snapshot });
    guard.recordScrapeSnapshot({ ...context, snapshot: second });

    await expect(Promise.all([
      guard.admit({ ...context, capabilityKey: 'sourcing.ingestCandidate', input: { snapshot } }),
      guard.admit({ ...context, capabilityKey: 'sourcing.ingestCandidate', input: { snapshot: second } }),
    ])).resolves.toEqual([undefined, undefined]);
  });

  it('retains only a single hash fingerprint and does not revoke an admitted identical scrape', async () => {
    let now = 1_000;
    const guard = new SourcingScrapeSnapshotAdmissionGuard({
      now: () => new Date(now),
      ttlMs: 100,
    });
    const request = {
      ...context,
      capabilityKey: 'sourcing.ingestCandidate',
      input: { snapshot },
    };
    guard.recordScrapeSnapshot({ ...context, snapshot });
    await guard.admit(request);

    // A concurrent, identical scrape result must not undo the already
    // admitted exact fingerprint while durable authorization is in flight.
    guard.recordScrapeSnapshot({ ...context, snapshot });
    guard.retainAuthorizedReplay({
      ...request,
      authorizationExpiresAt: new Date(2_000),
    });

    const entries = [
      ...(guard as unknown as { snapshots: Map<string, unknown> }).snapshots,
    ];
    expect(entries).toHaveLength(1);
    expect(entries[0]?.[0]).toMatch(/^[a-f0-9]{64}$/);

    now += 101;
    await expect(guard.admit(request)).resolves.toBeUndefined();
  });

  it('retains only an admitted fingerprint through its durable authorization expiry', async () => {
    let now = 1_000;
    const guard = new SourcingScrapeSnapshotAdmissionGuard({
      now: () => new Date(now),
      ttlMs: 100,
    });
    const request = {
      ...context,
      capabilityKey: 'sourcing.ingestCandidate',
      input: { snapshot },
    };
    guard.recordScrapeSnapshot({ ...context, snapshot });
    await guard.admit(request);
    guard.retainAuthorizedReplay({
      ...request,
      authorizationExpiresAt: new Date(2_000),
    });

    now += 101;
    await expect(guard.admit(request)).resolves.toBeUndefined();

    now = 2_001;
    await expect(guard.admit(request)).rejects.toThrow('sourcing_scrape_snapshot_unbound');
  });
});
