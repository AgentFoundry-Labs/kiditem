import { describe, expect, it } from 'vitest';
import { SourcingScrapeSnapshotAdmissionGuard } from './sourcing-scrape-snapshot-admission.guard';

const context = {
  organizationId: '00000000-0000-4000-8000-000000000001',
  initiatingUserId: '00000000-0000-4000-8000-000000000002',
  executionId: 'execution-1',
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
  it('admits only the exact same-live-execution normalized receipt before Invocation admission', async () => {
    const guard = new SourcingScrapeSnapshotAdmissionGuard();
    guard.recordScrapeSnapshot({ ...context, snapshot });

    await expect(guard.admit({ ...context, capabilityKey: 'sourcing.ingestCandidate', input: { snapshot } }))
      .resolves.toEqual({ canonicalInput: { snapshot } });
    await expect(guard.admit({ ...context, capabilityKey: 'sourcing.ingestCandidate', input: { snapshot: { ...snapshot, title: 'Fabricated' } } }))
      .rejects.toThrow('sourcing_scrape_snapshot_unbound');
    await expect(guard.admit({ ...context, executionId: 'execution-2', capabilityKey: 'sourcing.ingestCandidate', input: { snapshot } }))
      .rejects.toThrow('sourcing_scrape_snapshot_unbound');
  });

  it('clears the receipt when its execution binding is revoked', async () => {
    const guard = new SourcingScrapeSnapshotAdmissionGuard();
    guard.recordScrapeSnapshot({ ...context, snapshot });
    guard.revokeExecution(context);

    await expect(guard.admit({ ...context, capabilityKey: 'sourcing.ingestCandidate', input: { snapshot } }))
      .rejects.toThrow('sourcing_scrape_snapshot_unbound');
  });

  it('fails closed after the short live-receipt TTL elapses', async () => {
    let now = 1_000;
    const guard = new SourcingScrapeSnapshotAdmissionGuard({
      now: () => new Date(now),
      ttlMs: 100,
    });
    guard.recordScrapeSnapshot({ ...context, snapshot });
    now += 101;

    await expect(guard.admit({ ...context, capabilityKey: 'sourcing.ingestCandidate', input: { snapshot } }))
      .rejects.toThrow('sourcing_scrape_snapshot_unbound');
  });

  it('retains only one bounded receipt for an execution and no durable replay path', () => {
    const guard = new SourcingScrapeSnapshotAdmissionGuard({ maxEntries: 1 });
    guard.recordScrapeSnapshot({ ...context, snapshot });

    expect(() => guard.recordScrapeSnapshot({ ...context, executionId: 'execution-2', snapshot }))
      .toThrow('sourcing_scrape_snapshot_capacity_exhausted');
    expect('retainAuthorizedReplay' in guard).toBe(false);
  });
});
