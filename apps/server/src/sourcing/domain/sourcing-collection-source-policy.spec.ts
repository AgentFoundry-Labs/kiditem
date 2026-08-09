import { describe, expect, it } from 'vitest';
import {
  collectionSourceDeniedReason,
  isAllowedSourcingCollectionSource,
} from './sourcing-collection-source-policy';

describe('sourcing collection source policy', () => {
  it('accepts only a reviewed server-side collector key', () => {
    expect(isAllowedSourcingCollectionSource('1688.hot_product')).toBe(true);
    expect(isAllowedSourcingCollectionSource('page_world.fetch')).toBe(false);
    expect(collectionSourceDeniedReason('page_world.fetch')).toBe(
      'source_not_allowed',
    );
  });
});
