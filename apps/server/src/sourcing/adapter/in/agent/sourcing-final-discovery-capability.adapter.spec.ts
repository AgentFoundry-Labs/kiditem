import { describe, expect, it, vi } from 'vitest';
import { SourcingFinalDiscoveryCapabilityAdapter } from './sourcing-final-discovery-capability.adapter';

describe('SourcingFinalDiscoveryCapabilityAdapter', () => {
  it('checks for an existing candidate without writing Sourcing state', async () => {
    const candidates = {
      findActiveBySourceUrl: vi.fn().mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000001',
      }),
      upsertSourced: vi.fn(),
    };
    const adapter = new SourcingFinalDiscoveryCapabilityAdapter(
      candidates as never,
      { scrapeProductUrl: vi.fn() } as never,
    );

    await expect(adapter.duplicateCheck({
      organizationId: '00000000-0000-4000-8000-000000000002',
      sourceUrl: 'https://detail.1688.com/offer/1.html#tracking',
    })).resolves.toEqual({
      duplicate: true,
      candidateId: '00000000-0000-4000-8000-000000000001',
    });
    expect(candidates.findActiveBySourceUrl).toHaveBeenCalledWith({
      organizationId: '00000000-0000-4000-8000-000000000002',
      sourceUrl: 'https://detail.1688.com/offer/1.html',
    });
    expect(candidates.upsertSourced).not.toHaveBeenCalled();
  });

  it('normalizes an allowed final redirect without creating a candidate', async () => {
    const candidates = { findActiveBySourceUrl: vi.fn(), upsertSourced: vi.fn() };
    const browser = {
      scrapeProductUrl: vi.fn().mockResolvedValue({
        ok: true,
        source_url: 'https://www.alibaba.com/product-detail/toy_123.html',
        scraped_data: {
          title: 'Toy',
          price: -1,
          currency: 'CNY',
          image_urls: [
            'https://images.example.com/a.png',
            'https://images.example.com/a.png',
            'not-a-url',
          ],
        },
      }),
    };
    const adapter = new SourcingFinalDiscoveryCapabilityAdapter(
      candidates as never,
      browser as never,
    );

    await expect(adapter.scrapeProductUrl({ sourceUrl: 'https://detail.1688.com/offer/1.html' })).resolves.toMatchObject({
      sourceUrl: 'https://www.alibaba.com/product-detail/toy_123.html',
      platform: 'alibaba',
      price: null,
      images: ['https://images.example.com/a.png'],
      contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(candidates.upsertSourced).not.toHaveBeenCalled();
  });

  it('rejects a disallowed final redirect before exposing a snapshot', async () => {
    const candidates = { findActiveBySourceUrl: vi.fn(), upsertSourced: vi.fn() };
    const browser = {
      scrapeProductUrl: vi.fn().mockResolvedValue({
        ok: true,
        source_url: 'https://evil.example/offer/1.html',
        scraped_data: {},
      }),
    };
    const adapter = new SourcingFinalDiscoveryCapabilityAdapter(
      candidates as never,
      browser as never,
    );

    await expect(adapter.scrapeProductUrl({ sourceUrl: 'https://detail.1688.com/offer/1.html' }))
      .rejects.toThrow('supplier_url');
    expect(candidates.upsertSourced).not.toHaveBeenCalled();
  });

  it('records an immutable Sourcing-owned receipt for an exact owner replay', async () => {
    const candidates = {
      findActiveBySourceUrl: vi.fn(),
      upsertSourced: vi.fn().mockResolvedValue({ id: '00000000-0000-4000-8000-000000000010' }),
      upsertSourcedWithIdempotencyReceipt: vi.fn().mockResolvedValue({
        candidateId: '00000000-0000-4000-8000-000000000011',
      }),
    };
    const browser = {
      scrapeProductUrl: vi.fn().mockResolvedValue({
        ok: true,
        scraped_data: {
          title: 'Toy',
          price: 1,
          currency: 'CNY',
          image_urls: ['https://images.example.com/a.png'],
        },
      }),
    };
    const adapter = new SourcingFinalDiscoveryCapabilityAdapter(
      candidates as never,
      browser as never,
    );
    const snapshot = await adapter.scrapeProductUrl({
      sourceUrl: 'https://detail.1688.com/offer/1.html',
    });

    await expect(adapter.ingestCandidate({
      organizationId: '00000000-0000-4000-8000-000000000002',
      initiatingUserId: '00000000-0000-4000-8000-000000000003',
      idempotencyKey: 'owner:attempt:ingest',
      snapshot,
    })).resolves.toEqual({ candidateId: '00000000-0000-4000-8000-000000000011' });

    expect(candidates.upsertSourcedWithIdempotencyReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        capabilityKey: 'sourcing.ingestCandidate',
        idempotencyKey: 'owner:attempt:ingest',
        requestHash: snapshot.contentHash,
      }),
    );
    expect(candidates.upsertSourced).not.toHaveBeenCalled();
  });
});
