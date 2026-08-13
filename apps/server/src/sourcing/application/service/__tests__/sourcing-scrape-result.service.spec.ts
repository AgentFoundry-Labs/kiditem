import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { SourcingScrapeResultService } from '../sourcing-scrape-result.service';

function identityHash(
  sourcePlatform: string,
  externalOfferId: string,
  variantKey: string,
): string {
  return createHash('sha256')
    .update(
      [sourcePlatform.toLowerCase(), externalOfferId, variantKey].join('\u001f'),
    )
    .digest('hex');
}

describe('SourcingScrapeResultService', () => {
  it('normalizes and upserts a canonical candidate before returning its route', async () => {
    const candidates = {
      upsertSourced: vi.fn().mockResolvedValue({ id: 'candidate-1' }),
    };
    const service = new SourcingScrapeResultService(candidates as never);

    const result = await service.persist({
      organizationId: 'org-1',
      triggeredByUserId: 'user-1',
      output: {
        ok: true,
        source_url:
          'https://detail.1688.com/offer/123.html?spm=a261y#tracking',
        platform: 'alibaba',
        scraped_data: {
          source_url:
            'https://detail.1688.com/offer/123.html?spm=a261y#tracking',
          title: ' 실리콘 식판 ',
          variant_key: '  Blue   Set ',
          price: 12.5,
          images: ['//img.example/123.jpg', '//img.example/123.jpg'],
          tags: [' 유아식기 ', 3, ''],
        },
      },
    });

    expect(candidates.upsertSourced).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        sourceUrl: 'https://detail.1688.com/offer/123.html?spm=a261y',
        sourcePlatform: 'ALIBABA_1688',
        externalOfferId: '123',
        variantKeyNormalized: 'blue set',
        sourceIdentityHash: identityHash('ALIBABA_1688', '123', 'blue set'),
        name: '실리콘 식판',
        tags: ['유아식기'],
        costCny: 12.5,
        triggeredByUserId: 'user-1',
        thumbnailUrl: 'https://img.example/123.jpg',
        images: [
          expect.objectContaining({
            url: 'https://img.example/123.jpg',
            isPrimary: true,
          }),
        ],
      }),
    );
    expect(result).toEqual({
      candidateId: 'candidate-1',
      href: '/product-pipeline/collected-products/candidate-1',
    });
  });

  it('rejects malformed output without writing a candidate', async () => {
    const candidates = { upsertSourced: vi.fn() };
    const service = new SourcingScrapeResultService(candidates as never);

    await expect(service.persist({
      organizationId: 'org-1',
      triggeredByUserId: null,
      output: { ok: true, scraped_data: { title: '실리콘 식판' } },
    })).rejects.toMatchObject({
      code: 'sourcing_scrape_missing_source_url',
    });
    expect(candidates.upsertSourced).not.toHaveBeenCalled();
  });

  it('rejects a non-supplier output URL without writing a candidate', async () => {
    const candidates = { upsertSourced: vi.fn() };
    const service = new SourcingScrapeResultService(candidates as never);

    await expect(service.persist({
      organizationId: 'org-1',
      triggeredByUserId: null,
      output: {
        ok: true,
        scraped_data: {
          source_url: 'http://127.0.0.1/internal',
          title: '실리콘 식판',
        },
      },
    })).rejects.toMatchObject({
      code: 'sourcing_scrape_invalid_source_url',
    });
    expect(candidates.upsertSourced).not.toHaveBeenCalled();
  });
});
