import { describe, expect, it, vi } from 'vitest';
import { canonicalOwnerInputHash } from '../../../../common/owner-idempotency-key';
import { SourcingFinalDiscoveryCapabilityAdapter } from './sourcing-final-discovery-capability.adapter';

const DRAFT_ID = '00000000-0000-4000-8000-0000000000d1';
/** 원본 기록 → 판매상품 초안. 초안은 Channels 소유라 여기서는 경계에서 대신한다. */
function collectedDrafts() {
  return {
    findForSourceRecord: vi.fn(async () => ({ salesProductId: DRAFT_ID, status: 'draft' as const })),
    createDraft: vi.fn(),
    getDraft: vi.fn(),
  };
}

describe('SourcingFinalDiscoveryCapabilityAdapter', () => {
  it('checks for an existing source record without writing Sourcing state', async () => {
    const candidates = {
      findIdBySourceUrl: vi.fn().mockResolvedValue('00000000-0000-4000-8000-000000000001'),
      admit: vi.fn(),
    };
    const adapter = new SourcingFinalDiscoveryCapabilityAdapter(
      candidates as never,
      { scrapeProductUrl: vi.fn() } as never,
      collectedDrafts() as never,
    );

    await expect(adapter.duplicateCheck({
      organizationId: '00000000-0000-4000-8000-000000000002',
      sourceUrl: 'https://detail.1688.com/offer/1.html#tracking',
    })).resolves.toEqual({
      duplicate: true,
      candidateId: '00000000-0000-4000-8000-000000000001',
      salesProductId: DRAFT_ID,
    });
    expect(candidates.findIdBySourceUrl).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000000002',
      'https://detail.1688.com/offer/1.html',
    );
    expect(candidates.admit).not.toHaveBeenCalled();
  });

  it('normalizes an allowed final redirect without creating a candidate', async () => {
    const candidates = { findIdBySourceUrl: vi.fn(), admit: vi.fn() };
    const browser = {
      scrapeProductUrl: vi.fn().mockResolvedValue({
        ok: true,
        source_url: 'https://www.alibaba.com/product-detail/toy_123.html',
        scraped_data: {
          title: 'Toy',
          price: -1,
          currency: 'CNY',
          variant_key: '  Blue   Set ',
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
      collectedDrafts() as never,
    );

    await expect(adapter.scrapeProductUrl({ sourceUrl: 'https://detail.1688.com/offer/1.html' })).resolves.toMatchObject({
      sourceUrl: 'https://www.alibaba.com/product-detail/toy_123.html',
      platform: 'alibaba',
      variantKeyNormalized: 'blue set',
      price: null,
      images: ['https://images.example.com/a.png'],
      contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(candidates.admit).not.toHaveBeenCalled();
  });

  it('rejects a disallowed final redirect before exposing a snapshot', async () => {
    const candidates = { findIdBySourceUrl: vi.fn(), admit: vi.fn() };
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
      collectedDrafts() as never,
    );

    await expect(adapter.scrapeProductUrl({ sourceUrl: 'https://detail.1688.com/offer/1.html' }))
      .rejects.toThrow('supplier_url');
    expect(candidates.admit).not.toHaveBeenCalled();
  });

  it('records an immutable Sourcing-owned receipt for an exact owner replay', async () => {
    const candidates = {
      findIdBySourceUrl: vi.fn(),
      admit: vi.fn(),
      admitOnce: vi.fn().mockResolvedValue({
        sourceRecordId: '00000000-0000-4000-8000-000000000011',
        salesProductId: DRAFT_ID,
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
      collectedDrafts() as never,
    );
    const snapshot = await adapter.scrapeProductUrl({
      sourceUrl: 'https://detail.1688.com/offer/1.html',
    });
    const requestHash = canonicalOwnerInputHash({ snapshot });

    await expect(adapter.ingestCandidate({
      organizationId: '00000000-0000-4000-8000-000000000002',
      initiatingUserId: '00000000-0000-4000-8000-000000000003',
      idempotencyKey: 'owner:attempt:ingest',
      requestHash,
      snapshot,
    })).resolves.toEqual({ candidateId: '00000000-0000-4000-8000-000000000011', salesProductId: DRAFT_ID });

    expect(candidates.admitOnce).toHaveBeenCalledWith(
      expect.objectContaining({
        capabilityKey: 'sourcing.ingestCandidate',
        idempotencyKey: 'owner:attempt:ingest',
        requestHash,
      }),
      expect.objectContaining({ sourcePlatform: 'ALIBABA_1688', sourceIdentityHash: expect.any(String) }),
      expect.anything(),
    );

    await expect(adapter.ingestCandidate({
      organizationId: '00000000-0000-4000-8000-000000000002',
      initiatingUserId: '00000000-0000-4000-8000-000000000003',
      idempotencyKey: 'owner:attempt:ingest-conflict',
      requestHash: 'b'.repeat(64),
      snapshot,
    })).rejects.toThrow('owner_idempotency_input_conflict');
    expect(candidates.admitOnce).toHaveBeenCalledTimes(1);
    expect(candidates.admit).not.toHaveBeenCalled();
  });
});
