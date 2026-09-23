import { describe, expect, it } from 'vitest';
import { canonicalSourceRecordIdentity } from './source-record-identity';

describe('canonicalSourceRecordIdentity', () => {
  it('uses a normalized Alibaba supplier URL rather than extension product-id provenance', () => {
    const agent = canonicalSourceRecordIdentity({
      sourcePlatform: 'ALIBABA',
      sourceUrl: 'https://www.alibaba.com/product-detail/kid-toy_123.html',
      validatedExternalOfferId: null,
      variantKeyNormalized: '',
    });
    const extension = canonicalSourceRecordIdentity({
      sourcePlatform: 'ALIBABA',
      sourceUrl: 'https://www.alibaba.com/product-detail/kid-toy_123.html',
      validatedExternalOfferId: 'supplier-product-id-123',
      variantKeyNormalized: '',
    });

    expect(extension).toBe(agent);
  });

  it('keeps normalized supplier variants distinct and uses the 1688 offer identity when present', () => {
    const base = canonicalSourceRecordIdentity({
      sourcePlatform: 'ALIBABA_1688',
      sourceUrl: 'https://detail.1688.com/offer/607635921546.html',
      validatedExternalOfferId: '607635921546',
      variantKeyNormalized: 'blue set',
    });

    expect(canonicalSourceRecordIdentity({
      sourcePlatform: 'ALIBABA_1688',
      sourceUrl: 'https://detail.1688.com/offer/607635921546.html?spm=extension',
      validatedExternalOfferId: '607635921546',
      variantKeyNormalized: 'blue set',
    })).toBe(base);
    expect(canonicalSourceRecordIdentity({
      sourcePlatform: 'ALIBABA_1688',
      sourceUrl: 'https://detail.1688.com/offer/607635921546.html',
      validatedExternalOfferId: '607635921546',
      variantKeyNormalized: 'pink set',
    })).not.toBe(base);
  });

  it('uses the same Alibaba identity for equivalent tracking and host spellings while retaining the normalized variant', () => {
    const tracked = canonicalSourceRecordIdentity({
      sourcePlatform: 'ALIBABA',
      sourceUrl: 'https://ALIBABA.com/product-detail/kid-toy_123.html?spm=feed&utm_source=ad',
      validatedExternalOfferId: null,
      variantKeyNormalized: '  Blue   Set ',
    });
    const direct = canonicalSourceRecordIdentity({
      sourcePlatform: 'ALIBABA',
      sourceUrl: 'https://www.alibaba.com/product-detail/kid-toy_123.html',
      validatedExternalOfferId: 'untrusted-product-id',
      variantKeyNormalized: 'blue set',
    });

    expect(tracked).toBe(direct);
    expect(canonicalSourceRecordIdentity({
      sourcePlatform: 'ALIBABA',
      sourceUrl: 'https://www.alibaba.com/product-detail/kid-toy_123.html',
      validatedExternalOfferId: null,
      variantKeyNormalized: 'pink set',
    })).not.toBe(direct);
  });
});
