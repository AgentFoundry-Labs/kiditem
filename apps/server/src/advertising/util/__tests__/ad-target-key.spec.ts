import { describe, it, expect } from 'vitest';
import { buildAdTargetKey } from '../ad-target-key';

describe('buildAdTargetKey', () => {
  describe('campaign', () => {
    it('uses campaignId when present', () => {
      expect(
        buildAdTargetKey({
          targetType: 'campaign',
          campaignId: 'CAMP-1',
          campaignName: 'Brand Camp',
        }),
      ).toBe('campaign:CAMP-1');
    });

    it('falls back to campaignName when campaignId is missing', () => {
      expect(
        buildAdTargetKey({
          targetType: 'campaign',
          campaignName: 'Brand Camp',
        }),
      ).toBe('campaign:Brand Camp');
    });

    it('throws when both campaignId and campaignName are missing', () => {
      expect(() =>
        buildAdTargetKey({ targetType: 'campaign' }),
      ).toThrowError(/campaign target requires/);
    });

    it('throws when both campaignId and campaignName are blank strings', () => {
      expect(() =>
        buildAdTargetKey({
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
          targetType: 'keyword',
          campaignId: 'CAMP-1',
          adGroup: 'Group-A',
          keyword: '유아 장난감',
        }),
      ).toBe('keyword:CAMP-1:Group-A:유아 장난감');
    });

    it('falls back to empty adGroup segment when adGroup missing', () => {
      // Documented fallback in the helper — keyword keys keep their colon shape.
      expect(
        buildAdTargetKey({
          targetType: 'keyword',
          campaignName: 'Brand Camp',
          keyword: 'kw',
        }),
      ).toBe('keyword:Brand Camp::kw');
    });

    it('throws when keyword missing', () => {
      expect(() =>
        buildAdTargetKey({
          targetType: 'keyword',
          campaignId: 'CAMP-1',
          adGroup: 'Group-A',
        }),
      ).toThrowError(/keyword target requires/);
    });

    it('throws when both campaign anchors missing', () => {
      expect(() =>
        buildAdTargetKey({
          targetType: 'keyword',
          adGroup: 'Group-A',
          keyword: 'kw',
        }),
      ).toThrowError(/keyword target requires/);
    });
  });

  describe('product', () => {
    it('uses externalId + campaignId when present', () => {
      expect(
        buildAdTargetKey({
          targetType: 'product',
          externalId: 'EXT-1',
          campaignId: 'CAMP-1',
        }),
      ).toBe('product:EXT-1:CAMP-1');
    });

    it('falls back to listingId when externalId missing', () => {
      expect(
        buildAdTargetKey({
          targetType: 'product',
          listingId: 'LISTING-1',
          campaignName: 'Brand Camp',
        }),
      ).toBe('product:LISTING-1:Brand Camp');
    });

    it('throws when both product anchors missing', () => {
      expect(() =>
        buildAdTargetKey({
          targetType: 'product',
          campaignId: 'CAMP-1',
        }),
      ).toThrowError(/product target requires/);
    });

    it('throws when campaign anchor missing', () => {
      expect(() =>
        buildAdTargetKey({
          targetType: 'product',
          externalId: 'EXT-1',
        }),
      ).toThrowError(/product target requires/);
    });
  });

  describe('ad_product', () => {
    it('produces ad_product key with externalId + campaignId', () => {
      expect(
        buildAdTargetKey({
          targetType: 'ad_product',
          externalId: 'EXT-1',
          campaignId: 'CAMP-1',
        }),
      ).toBe('ad_product:EXT-1:CAMP-1');
    });

    it('throws when both anchors missing', () => {
      expect(() =>
        buildAdTargetKey({ targetType: 'ad_product' }),
      ).toThrowError(/ad_product target requires/);
    });
  });

  describe('idempotency / distinctness', () => {
    it('two identical inputs produce identical keys', () => {
      const inputA = {
        targetType: 'product' as const,
        externalId: 'EXT-1',
        campaignId: 'CAMP-1',
      };
      const inputB = {
        targetType: 'product' as const,
        externalId: 'EXT-1',
        campaignId: 'CAMP-1',
      };
      expect(buildAdTargetKey(inputA)).toBe(buildAdTargetKey(inputB));
    });

    it('two distinct campaign objects produce distinct keys', () => {
      const a = buildAdTargetKey({
        targetType: 'campaign',
        campaignId: 'CAMP-A',
      });
      const b = buildAdTargetKey({
        targetType: 'campaign',
        campaignId: 'CAMP-B',
      });
      expect(a).not.toBe(b);
    });

    it('campaign vs keyword vs product with same anchor are distinct namespaces', () => {
      const c = buildAdTargetKey({
        targetType: 'campaign',
        campaignId: 'CAMP-1',
      });
      const k = buildAdTargetKey({
        targetType: 'keyword',
        campaignId: 'CAMP-1',
        keyword: 'kw',
      });
      const p = buildAdTargetKey({
        targetType: 'product',
        externalId: 'CAMP-1',
        campaignId: 'CAMP-1',
      });
      expect(new Set([c, k, p]).size).toBe(3);
    });
  });

  describe('unsupported types', () => {
    it('throws on unknown targetType', () => {
      expect(() =>
        buildAdTargetKey({
          targetType: 'unknown' as unknown as 'campaign',
          campaignId: 'CAMP-1',
        }),
      ).toThrowError(/unsupported targetType/);
    });
  });
});
