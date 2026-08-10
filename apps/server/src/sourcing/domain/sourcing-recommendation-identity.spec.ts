import { describe, expect, it } from 'vitest';
import { recommendationItemKey } from './sourcing-recommendation-identity';

describe('recommendationItemKey', () => {
  it('normalizes platform and variant while preserving matched product identity', () => {
    const left = recommendationItemKey({
      sourcePlatform: ' 1688 ',
      externalOfferId: '607635921546 ',
      variantKey: ' Color = Pink ',
      matchedCoupangProductId: '123',
    });
    const right = recommendationItemKey({
      sourcePlatform: '1688',
      externalOfferId: '607635921546',
      variantKey: 'color=pink',
      matchedCoupangProductId: '123',
    });

    expect(left).toMatch(/^[a-f0-9]{64}$/);
    expect(left).toBe(right);
    expect(left).not.toBe(
      recommendationItemKey({
        sourcePlatform: '1688',
        externalOfferId: '607635921546',
        variantKey: 'color=pink',
        matchedCoupangProductId: '456',
      }),
    );
  });

  it('rejects an index or title fallback when the external identity is missing', () => {
    expect(() =>
      recommendationItemKey({
        sourcePlatform: '1688',
        externalOfferId: ' ',
        variantKey: '',
        matchedCoupangProductId: null,
      }),
    ).toThrow('externalOfferId is required');
  });
});
