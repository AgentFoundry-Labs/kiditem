import { describe, expect, it } from 'vitest';
import { canonicalSourcingCandidateIdentity } from './sourcing-candidate-identity';

describe('canonicalSourcingCandidateIdentity', () => {
  it('uses a normalized Alibaba supplier URL rather than extension product-id provenance', () => {
    const agent = canonicalSourcingCandidateIdentity({
      sourcePlatform: 'ALIBABA',
      sourceUrl: 'https://www.alibaba.com/product-detail/kid-toy_123.html',
      validatedExternalOfferId: null,
      variantKeyNormalized: '',
    });
    const extension = canonicalSourcingCandidateIdentity({
      sourcePlatform: 'ALIBABA',
      sourceUrl: 'https://www.alibaba.com/product-detail/kid-toy_123.html',
      validatedExternalOfferId: 'supplier-product-id-123',
      variantKeyNormalized: '',
    });

    expect(extension).toBe(agent);
  });

  it('keeps normalized supplier variants distinct and uses the 1688 offer identity when present', () => {
    const base = canonicalSourcingCandidateIdentity({
      sourcePlatform: 'ALIBABA_1688',
      sourceUrl: 'https://detail.1688.com/offer/607635921546.html',
      validatedExternalOfferId: '607635921546',
      variantKeyNormalized: 'blue set',
    });

    expect(canonicalSourcingCandidateIdentity({
      sourcePlatform: 'ALIBABA_1688',
      sourceUrl: 'https://detail.1688.com/offer/607635921546.html?spm=extension',
      validatedExternalOfferId: '607635921546',
      variantKeyNormalized: 'blue set',
    })).toBe(base);
    expect(canonicalSourcingCandidateIdentity({
      sourcePlatform: 'ALIBABA_1688',
      sourceUrl: 'https://detail.1688.com/offer/607635921546.html',
      validatedExternalOfferId: '607635921546',
      variantKeyNormalized: 'pink set',
    })).not.toBe(base);
  });
});
