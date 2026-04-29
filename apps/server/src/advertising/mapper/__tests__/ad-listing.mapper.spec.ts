import { describe, it, expect } from 'vitest';
import {
  hydratedListingToSummary,
  scopedListingToSummary,
  toListingSummary,
} from '../ad-listing.mapper';
import type { HydratedListing } from '../../domain/model/strategy-types';
import type { ScopedAdListingReadModel } from '../../adapter/out/prisma/ad-listing.query';

describe('mappers/ad-listing — HydratedListing → AdListingSummary', () => {
  it('strips ad/inventory fields, returns AdListingSummary shape with option:null', () => {
    const listing: HydratedListing = {
      id: 'L1',
      externalId: 'EXT-1',
      channelName: '쿠팡상품',
      masterProduct: {
        id: 'M1',
        code: 'M-00001',
        name: 'Test',
        abcGrade: 'A',
        adTier: '1차',
        healthScore: 80,
      },
      primaryOption: null,
    };
    const result = hydratedListingToSummary(listing);
    expect(result).toEqual({
      listingId: 'L1',
      externalId: 'EXT-1',
      channelName: '쿠팡상품',
      masterProduct: { id: 'M1', code: 'M-00001', name: 'Test' },
      option: null,
    });
  });

  it('toListingSummary alias matches hydratedListingToSummary', () => {
    const listing: HydratedListing = {
      id: 'L2',
      externalId: 'EXT-2',
      channelName: null,
      masterProduct: {
        id: 'M2',
        code: 'M-00002',
        name: 'Aliased',
        abcGrade: null,
        adTier: null,
        healthScore: null,
      },
      primaryOption: null,
    };
    expect(toListingSummary(listing)).toEqual(hydratedListingToSummary(listing));
  });
});

describe('mappers/ad-listing — ScopedAdListingReadModel → ScopedAdListingSummary', () => {
  it('preserves abcGrade / adTier / healthScore on master', () => {
    const scoped: ScopedAdListingReadModel = {
      id: 'L3',
      externalId: 'EXT-3',
      channelName: 'coupang',
      masterProduct: {
        id: 'M3',
        code: 'M-3',
        name: 'Scoped',
        abcGrade: 'B',
        adTier: '2차',
        healthScore: 65,
      },
    };
    const result = scopedListingToSummary(scoped);
    expect(result).toEqual({
      listingId: 'L3',
      externalId: 'EXT-3',
      channelName: 'coupang',
      masterProduct: scoped.masterProduct,
      option: null,
    });
    expect(result.masterProduct.abcGrade).toBe('B');
    expect(result.masterProduct.adTier).toBe('2차');
    expect(result.masterProduct.healthScore).toBe(65);
  });
});
