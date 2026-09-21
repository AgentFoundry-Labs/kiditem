import { describe, expect, it } from 'vitest';
import { listingProductIdFromRecipes } from './listing-product-summary';

describe('listing product summary from recipes', () => {
  const option = (...ids: string[]) => ({ inventoryComponents: ids.map((masterProductId) => ({ masterProductId })) });
  it('has no summary without options or with an unlinked option', () => {
    expect(listingProductIdFromRecipes([])).toBeNull();
    expect(listingProductIdFromRecipes([option('A'), option()])).toBeNull();
  });
  it('summarizes only a single source shared by every option', () => {
    expect(listingProductIdFromRecipes([option('A'), option('A')])).toBe('A');
    expect(listingProductIdFromRecipes([option('A'), option('B')])).toBeNull();
    expect(listingProductIdFromRecipes([option('A', 'B')])).toBeNull();
  });
});
