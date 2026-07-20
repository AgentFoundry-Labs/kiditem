import { describe, it, expect } from 'vitest';
import { buildAdTargetKey } from '../ad-target-key';

const account = { channelAccountId: 'account-1' } as const;

describe('buildAdTargetKey', () => {
  describe('campaign', () => {
    it('uses campaignId when present', () => {
      expect(
        buildAdTargetKey({
          ...account,
          targetType: 'campaign',
          campaignId: 'CAMP-1',
          campaignName: 'Brand Camp',
        }),
      ).toBe('account:account-1:campaign:CAMP-1');
    });

    it('falls back to campaignName when campaignId is missing', () => {
      expect(
        buildAdTargetKey({
          ...account,
          targetType: 'campaign',
          campaignName: 'Brand Camp',
        }),
      ).toBe('account:account-1:campaign:Brand Camp');
    });

    it('throws when both campaignId and campaignName are missing', () => {
      expect(() =>
        buildAdTargetKey({ ...account, targetType: 'campaign' }),
      ).toThrowError(/campaign target requires/);
    });

    it('throws when both campaignId and campaignName are blank strings', () => {
      expect(() =>
        buildAdTargetKey({
          ...account,
          targetType: 'campaign',
          campaignId: '   ',
          campaignName: '',
        }),
      ).toThrowError(/campaign target requires/);
    });
  });

  describe('keyword', () => {
    it('produces full identity when campaign + adGroup + keyword present', () => {
      expect(
        buildAdTargetKey({
          ...account,
          targetType: 'keyword',
          campaignId: 'CAMP-1',
          adGroup: 'Group-A',
          keyword: '유아 장난감',
        }),
      ).toBe('account:account-1:keyword:CAMP-1:Group-A:유아 장난감');
    });

    it('falls back to empty adGroup segment when adGroup missing', () => {
      // Documented fallback in the helper — keyword keys keep their colon shape.
      expect(
        buildAdTargetKey({
          ...account,
          targetType: 'keyword',
          campaignName: 'Brand Camp',
          keyword: 'kw',
        }),
      ).toBe('account:account-1:keyword:Brand Camp::kw');
    });

    it('throws when keyword missing', () => {
      expect(() =>
        buildAdTargetKey({
          ...account,
          targetType: 'keyword',
          campaignId: 'CAMP-1',
          adGroup: 'Group-A',
        }),
      ).toThrowError(/keyword target requires/);
    });

    it('throws when both campaign anchors missing', () => {
      expect(() =>
        buildAdTargetKey({
          ...account,
          targetType: 'keyword',
          adGroup: 'Group-A',
          keyword: 'kw',
        }),
      ).toThrowError(/keyword target requires/);
    });
  });

  describe('product', () => {
    it('uses vendorItemId/externalOptionId when present', () => {
      expect(
        buildAdTargetKey({
          ...account,
          targetType: 'product',
          externalOptionId: 'VENDOR-1',
          externalId: 'EXT-1',
          campaignId: 'CAMP-1',
        }),
      ).toBe('account:account-1:product:CAMP-1:VENDOR-1');
    });

    it('falls back to externalId, then listingId', () => {
      expect(
        buildAdTargetKey({
          ...account,
          targetType: 'product',
          externalId: 'EXT-1',
          campaignName: 'Brand Camp',
        }),
      ).toBe('account:account-1:product:Brand Camp:EXT-1');
      expect(
        buildAdTargetKey({
          ...account,
          targetType: 'product',
          listingId: 'LISTING-1',
          campaignName: 'Brand Camp',
        }),
      ).toBe('account:account-1:product:Brand Camp:LISTING-1');
    });

    it('throws when both product anchors missing', () => {
      expect(() =>
        buildAdTargetKey({
          ...account,
          targetType: 'product',
          campaignId: 'CAMP-1',
        }),
      ).toThrowError(/product target requires/);
    });
  });

  describe('idempotency / distinctness', () => {
    it('two identical inputs produce identical keys', () => {
      const inputA = {
        ...account,
        targetType: 'product' as const,
        externalOptionId: 'VENDOR-1',
      };
      const inputB = {
        ...account,
        targetType: 'product' as const,
        externalOptionId: 'VENDOR-1',
      };
      expect(buildAdTargetKey(inputA)).toBe(buildAdTargetKey(inputB));
    });

    it('two distinct campaign objects produce distinct keys', () => {
      const a = buildAdTargetKey({
        ...account,
        targetType: 'campaign',
        campaignId: 'CAMP-A',
      });
      const b = buildAdTargetKey({
        ...account,
        targetType: 'campaign',
        campaignId: 'CAMP-B',
      });
      expect(a).not.toBe(b);
    });

    it('campaign vs keyword vs product with same anchor are distinct namespaces', () => {
      const c = buildAdTargetKey({
        ...account,
        targetType: 'campaign',
        campaignId: 'CAMP-1',
      });
      const k = buildAdTargetKey({
        ...account,
        targetType: 'keyword',
        campaignId: 'CAMP-1',
        keyword: 'kw',
      });
      const p = buildAdTargetKey({
        ...account,
        targetType: 'product',
        externalOptionId: 'CAMP-1',
      });
      expect(new Set([c, k, p]).size).toBe(3);
    });
  });

  describe('unsupported types', () => {
    it('throws on unknown targetType', () => {
      expect(() =>
        buildAdTargetKey({
          ...account,
          targetType: 'unknown' as unknown as 'campaign',
          campaignId: 'CAMP-1',
        }),
      ).toThrowError(/unsupported targetType/);
    });
  });

  it('rejects a missing or blank channel account identity', () => {
    expect(() => buildAdTargetKey({
      channelAccountId: ' ',
      targetType: 'campaign',
      campaignId: 'CAMP-1',
    })).toThrowError(/channelAccountId/);
  });

  it('keeps identical provider targets distinct across channel accounts', () => {
    const first = buildAdTargetKey({
      channelAccountId: 'account-1',
      targetType: 'campaign',
      campaignId: 'CAMP-1',
    });
    const second = buildAdTargetKey({
      channelAccountId: 'account-2',
      targetType: 'campaign',
      campaignId: 'CAMP-1',
    });
    expect(first).not.toBe(second);
  });
});
