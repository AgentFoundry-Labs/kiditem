import { describe, expect, it, vi } from 'vitest';
import { SourcingScrapeUrlCapabilityAdapter } from '../sourcing-scrape-url-capability.adapter';

describe('SourcingScrapeUrlCapabilityAdapter', () => {
  it('is a Sourcing-owned Operation port adapter, not an Agent OS handler registrar', async () => {
    const operations = { startDirect: vi.fn().mockResolvedValue({ operationRunId: '00000000-0000-4000-8000-000000000001', status: 'queued' }) };
    const adapter = new SourcingScrapeUrlCapabilityAdapter(operations as never);

    await expect(adapter.scrapeUrlWorkflow({
      organizationId: '00000000-0000-4000-8000-000000000002', triggeredByUserId: 'user-1',
      sourceUrl: 'https://detail.1688.com/offer/123.html', idempotencyKey: 'exact-owner-key',
    })).resolves.toEqual({
      skipped: false, candidateId: null, href: null,
      operation: 'organizations/00000000-0000-4000-8000-000000000002/operations/00000000-0000-4000-8000-000000000001',
    });
    expect(operations.startDirect).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: 'exact-owner-key' }));
    expect('onModuleInit' in adapter).toBe(false);
  });

  it('rejects a missing key instead of substituting a URL-derived key', async () => {
    const operations = { startDirect: vi.fn() };
    const adapter = new SourcingScrapeUrlCapabilityAdapter(operations as never);
    await expect(adapter.scrapeUrlWorkflow({
      organizationId: 'org-1', sourceUrl: 'https://detail.1688.com/offer/123.html', idempotencyKey: ' ',
    })).rejects.toThrow('owner_idempotency_key_required');
    expect(operations.startDirect).not.toHaveBeenCalled();
  });
});
