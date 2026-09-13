import { describe, expect, it } from 'vitest';
import {
  CoupangAccountSettingsSchema,
  UpdateCoupangAccountSettingsSchema,
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
