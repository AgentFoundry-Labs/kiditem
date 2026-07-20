import { describe, expect, it } from 'vitest';
import {
  readStampedAdTargetGrain,
  resolveAdTargetGrain,
} from '../ad-target-grain';

describe('resolveAdTargetGrain', () => {
  it('treats a row with an advertised option id as product grain', () => {
    expect(
      resolveAdTargetGrain({ externalOptionId: '94878673640' }),
    ).toBe('product');
  });

  it('treats a row matched only to a listing as product grain', () => {
    expect(
      resolveAdTargetGrain({
        externalOptionId: null,
        listingOptionId: null,
        listingId: '7d1b0f6e-0000-4000-8000-000000000001',
      }),
    ).toBe('product');
  });

  it('treats a campaign rollup row with no product identity as campaign grain', () => {
    // Real shape of a Coupang campaign rollup row: it carries a synthetic
    // descriptor in externalId but no option/listing identity at all.
    expect(
      resolveAdTargetGrain({
        externalOptionId: null,
        listingOptionId: null,
        listingId: null,
      }),
    ).toBe('campaign');
  });

  it('ignores blank identity strings', () => {
    expect(
      resolveAdTargetGrain({
        externalOptionId: '   ',
        listingOptionId: '',
        listingId: null,
      }),
    ).toBe('campaign');
  });
});

describe('readStampedAdTargetGrain', () => {
  it('accepts the known grains', () => {
    expect(readStampedAdTargetGrain('campaign')).toBe('campaign');
    expect(readStampedAdTargetGrain('product')).toBe('product');
  });

  it('returns null for legacy or unknown stamps so callers fall back', () => {
    expect(readStampedAdTargetGrain(undefined)).toBeNull();
    expect(readStampedAdTargetGrain(null)).toBeNull();
    expect(readStampedAdTargetGrain('keyword')).toBeNull();
    expect(readStampedAdTargetGrain(3)).toBeNull();
  });
});
