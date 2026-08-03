import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { planCanonicalInventoryLinks } from '../data-migrations/v0.1.30/canonical-master-inventory-identity.ts';

describe('canonical MasterProduct inventory identity migration policy', () => {
  it('creates one canonical product identity per physical SKU', () => {
    assert.deepEqual(planCanonicalInventoryLinks({
      skuIds: ['sku-2', 'sku-1', 'sku-1'],
      listings: [],
    }), {
      canonicalSkuIds: ['sku-1', 'sku-2'],
      listingOwners: [],
      unresolvedListingIds: [],
    });
  });

  it('converges several channel listings that consume the same SKU', () => {
    assert.deepEqual(planCanonicalInventoryLinks({
      skuIds: ['sku-shared'],
      listings: [
        { listingId: 'wing', optionSkuIds: [['sku-shared']] },
        { listingId: 'rocket', optionSkuIds: [['sku-shared'], ['sku-shared']] },
      ],
    }), {
      canonicalSkuIds: ['sku-shared'],
      listingOwners: [
        { listingId: 'rocket', skuId: 'sku-shared' },
        { listingId: 'wing', skuId: 'sku-shared' },
      ],
      unresolvedListingIds: [],
    });
  });

  it('leaves listings with zero or several component SKUs unresolved', () => {
    assert.deepEqual(planCanonicalInventoryLinks({
      skuIds: ['sku-a', 'sku-b'],
      listings: [
        { listingId: 'empty', optionSkuIds: [] },
        { listingId: 'partially-matched', optionSkuIds: [['sku-a'], []] },
        { listingId: 'mixed', optionSkuIds: [['sku-a'], ['sku-b']] },
      ],
    }), {
      canonicalSkuIds: ['sku-a', 'sku-b'],
      listingOwners: [],
      unresolvedListingIds: ['empty', 'mixed', 'partially-matched'],
    });
  });
});
