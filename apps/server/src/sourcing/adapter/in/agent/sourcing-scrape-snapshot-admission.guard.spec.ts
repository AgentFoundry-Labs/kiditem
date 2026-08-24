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
});
