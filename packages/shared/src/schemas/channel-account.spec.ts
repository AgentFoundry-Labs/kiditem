import { describe, expect, it } from 'vitest';
import {
  CoupangAccountSettingsSchema,
  MallListingProfileSchema,
  UpdateCoupangAccountSettingsSchema,
  UpdateMallListingProfileSchema,
} from './channel-account';

describe('Coupang channel account contract', () => {
  it('keeps only the vendor identity in the settings response', () => {
    const settings = {
      configured: true,
      vendorId: 'A00012345',
      status: 'active',
      updatedAt: '2026-09-07T00:00:00.000Z',
    };

    expect(CoupangAccountSettingsSchema.parse(settings)).toEqual(settings);
    for (const field of ['accessKeyMasked', 'hasAccessKey', 'hasSecretKey']) {
      expect(
        CoupangAccountSettingsSchema.safeParse({ ...settings, [field]: 'retired' }).success,
      ).toBe(false);
    }
  });

  it('rejects Open API credentials from the update request', () => {
    expect(UpdateCoupangAccountSettingsSchema.parse({ vendorId: 'A00012345' })).toEqual({
      vendorId: 'A00012345',
    });
    for (const field of ['accessKey', 'secretKey']) {
      expect(
        UpdateCoupangAccountSettingsSchema.safeParse({ vendorId: 'A00012345', [field]: 'retired' }).success,
      ).toBe(false);
    }
  });
});

describe('mall listing profile contract (KID-235)', () => {
  const profile = {
    shipping: { summary: '기본 배송비 3,000원, 5만원 이상 무료' },
    returnPolicy: null,
    releaseAddress: { zipCode: '10000' },
    returnAddress: null,
    asPhone: '02-000-0000',
    categoryCode: '12345',
    namePrefix: null,
    nameSuffix: null,
  };

  it('reads the stored document with free-form records and nullable texts', () => {
    expect(MallListingProfileSchema.parse(profile)).toEqual(profile);
    expect(MallListingProfileSchema.safeParse({ ...profile, shipping: {} }).success).toBe(false);
    expect(MallListingProfileSchema.safeParse({ ...profile, extra: 1 }).success).toBe(false);
  });

  it('accepts a partial update, trims texts and refuses keys outside the document', () => {
    expect(UpdateMallListingProfileSchema.parse({ categoryCode: ' 12345 ', releaseAddress: null })).toEqual({
      categoryCode: '12345',
      releaseAddress: null,
    });
    expect(UpdateMallListingProfileSchema.parse({})).toEqual({});
    expect(UpdateMallListingProfileSchema.safeParse({ shipping: {} }).success).toBe(false);
    expect(UpdateMallListingProfileSchema.safeParse({ shipping: 'text' }).success).toBe(false);
    for (const field of ['loginId', 'password', 'enabled']) {
      expect(UpdateMallListingProfileSchema.safeParse({ [field]: 'x' }).success).toBe(false);
    }
  });
});
