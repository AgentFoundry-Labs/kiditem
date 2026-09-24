import { describe, expect, it } from 'vitest';
import {
  filledListingProfileFields,
  LISTING_PROFILE_CONFIG_KEY,
  MALL_LISTING_PROFILE_FIELDS,
  mergeMallListingProfile,
  readMallListingProfile,
} from './mall-listing-profile';

describe('mall listing profile document (KID-235)', () => {
  it('reads only the listingProfile document and treats empty values as absent', () => {
    expect(readMallListingProfile({ orderCollection: { loginId: 'x' } })).toBeNull();
    expect(readMallListingProfile({ [LISTING_PROFILE_CONFIG_KEY]: 'text' })).toBeNull();
    expect(
      readMallListingProfile({
        [LISTING_PROFILE_CONFIG_KEY]: { shipping: {}, releaseAddress: { zipCode: '10000' }, asPhone: '  ', categoryCode: ' 12 ', unknown: 1 },
      }),
    ).toEqual({
      shipping: null,
      returnPolicy: null,
      releaseAddress: { zipCode: '10000' },
      returnAddress: null,
      asPhone: null,
      categoryCode: '12',
      namePrefix: null,
      nameSuffix: null,
    });
  });

  it('merges an update over the stored document and keeps untouched keys', () => {
    const existing = readMallListingProfile({
      [LISTING_PROFILE_CONFIG_KEY]: { releaseAddress: { zipCode: '10000' }, categoryCode: '12', namePrefix: '[키드]' },
    });
    const merged = mergeMallListingProfile(existing, {
      shipping: { summary: '기본 3,000원' },
      categoryCode: '',
      namePrefix: null,
      returnAddress: {},
    });
    expect(merged).toEqual({
      shipping: { summary: '기본 3,000원' },
      returnPolicy: null,
      releaseAddress: { zipCode: '10000' },
      returnAddress: null,
      asPhone: null,
      categoryCode: null,
      namePrefix: null,
      nameSuffix: null,
    });
    expect(filledListingProfileFields(merged)).toEqual(['shipping', 'releaseAddress']);
  });

  it('starts from an empty document when nothing was stored, so the document exists after the first save', () => {
    const merged = mergeMallListingProfile(null, { categoryCode: '77' });
    expect(merged.categoryCode).toBe('77');
    expect(Object.keys(merged)).toHaveLength(8);
    expect(readMallListingProfile({ [LISTING_PROFILE_CONFIG_KEY]: merged })).toEqual(merged);
  });

  it('defines every document field exactly once with a screen label', () => {
    const keys = MALL_LISTING_PROFILE_FIELDS.map((field) => field.key);
    expect(new Set(keys).size).toBe(8);
    expect(keys.sort()).toEqual(
      ['asPhone', 'categoryCode', 'namePrefix', 'nameSuffix', 'releaseAddress', 'returnAddress', 'returnPolicy', 'shipping'],
    );
    expect(MALL_LISTING_PROFILE_FIELDS.every((field) => field.label.length > 0)).toBe(true);
  });
});
