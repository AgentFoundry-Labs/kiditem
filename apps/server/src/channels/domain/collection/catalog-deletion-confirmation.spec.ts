import { describe, expect, it } from 'vitest';
import { resolveAbsentProducts } from './catalog-deletion-confirmation';

describe('resolveAbsentProducts', () => {
  it('records only deleted, keeps present, and leaves the rest unconfirmed', () => {
    expect(resolveAbsentProducts(['a', 'b', 'c', 'd'], [
      { externalProductId: 'a', outcome: 'deleted' },
      { externalProductId: 'b', outcome: 'present' },
      { externalProductId: 'c', outcome: 'not_found' },
    ])).toEqual({ deleted: ['a'], present: ['b'], unconfirmed: ['c', 'd'], unexpected: [] });
  });

  it('lets the last confirmation for a product win and flags products that were not absent', () => {
    expect(resolveAbsentProducts(['a'], [
      { externalProductId: 'a', outcome: 'not_found' },
      { externalProductId: 'a', outcome: 'deleted' },
      { externalProductId: 'z', outcome: 'deleted' },
    ])).toEqual({ deleted: ['a'], present: [], unconfirmed: [], unexpected: ['z'] });
  });
});
