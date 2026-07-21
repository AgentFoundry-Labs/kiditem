import { describe, it, expect } from 'vitest';
import {
  buildAdTargetKey,
  normalizeStableCampaignIdentity,
} from '../ad-target-key';

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

    it('rejects campaignName as an identity fallback', () => {
      expect(() =>
        buildAdTargetKey({
          ...account,
          targetType: 'campaign',
          campaignName: 'Brand Camp',
        }),
      ).toThrowError(/stable campaign identity/);
    });

    it('uses the canonical provider id from a Coupang campaign detail URL', () => {
      expect(
        buildAdTargetKey({
          ...account,
          targetType: 'campaign',
          campaignIdentity:
            'href:https://advertising.coupang.com/campaign/identity-a',
          campaignName: '같은 이름',
        }),
      ).toBe('account:account-1:campaign:identity-a');
    });

    it('rejects a name-prefixed pseudo identity and a generic dashboard href', () => {
      expect(() => buildAdTargetKey({
        ...account,
        targetType: 'campaign',
        campaignIdentity: 'name:Brand Camp',
        campaignName: 'Brand Camp',
      })).toThrowError(/stable campaign identity/);
      expect(() => buildAdTargetKey({
        ...account,
        targetType: 'campaign',
        campaignIdentity: 'href:https://advertising.coupang.com/marketing/dashboard/sales',
      })).toThrowError(/stable campaign identity/);
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
          campaignIdentity: 'campaign:CAMP-1',
          campaignName: 'Brand Camp',
          keyword: 'kw',
        }),
      ).toBe('account:account-1:keyword:CAMP-1::kw');
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
    it('qualifies vendorItemId/externalOptionId with campaignId when present', () => {
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

    it('rejects product rows carrying campaign display evidence without stable identity', () => {
      expect(() =>
        buildAdTargetKey({
          ...account,
          targetType: 'product',
          externalId: 'EXT-1',
          campaignName: 'Brand Camp',
        }),
      ).toThrowError(/stable campaign identity/);
      expect(() =>
        buildAdTargetKey({
          ...account,
          targetType: 'product',
          listingId: 'LISTING-1',
          campaignName: 'Brand Camp',
        }),
      ).toThrowError(/stable campaign identity/);
    });

    it.each([
      { evidence: 'adGroup', adGroup: 'Group A' },
      { evidence: 'keyword', keyword: 'kids cup' },
    ])(
      'rejects campaignless product rows carrying $evidence evidence without stable identity',
      ({ adGroup, keyword }) => {
        expect(() => buildAdTargetKey({
          ...account,
          targetType: 'product',
          campaignless: true,
          externalOptionId: 'VENDOR-1',
          adGroup,
          keyword,
        })).toThrowError(/stable campaign identity/);
      },
    );

    it('retains the explicit account-qualified campaign-less product identity', () => {
      expect(buildAdTargetKey({ ...account, targetType: 'product', campaignless: true, externalOptionId: 'VENDOR-1', externalId: 'EXT-1' }))
        .toBe('account:account-1:product:VENDOR-1');
      expect(buildAdTargetKey({ ...account, targetType: 'product', campaignless: true, externalId: 'EXT-1' }))
        .toBe('account:account-1:product:EXT-1');
      expect(buildAdTargetKey({ ...account, targetType: 'product', campaignless: true, listingId: 'LISTING-1' }))
        .toBe('account:account-1:product:LISTING-1');
    });

    it('requires callers to explicitly attest that an identity-free product is campaign-less', () => {
      expect(() => buildAdTargetKey({
        ...account,
        targetType: 'product',
        externalOptionId: 'VENDOR-1',
      })).toThrowError(/campaignless/);
    });

    it('keeps same-name products distinct by canonical campaignIdentity', () => {
      const first = buildAdTargetKey({
        ...account,
        targetType: 'product',
        campaignIdentity: 'href:https://advertising.coupang.com/campaign/a',
        campaignName: '같은 이름',
        externalOptionId: 'VENDOR-1',
      });
      const second = buildAdTargetKey({
        ...account,
        targetType: 'product',
        campaignIdentity: 'href:https://advertising.coupang.com/campaign/b',
        campaignName: '같은 이름',
        externalOptionId: 'VENDOR-1',
      });
      expect(first).not.toBe(second);
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
        campaignless: true,
        externalOptionId: 'VENDOR-1',
      };
      const inputB = {
        ...account,
        targetType: 'product' as const,
        campaignless: true,
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

    it('keeps the same product distinct across campaigns', () => {
      const a = buildAdTargetKey({
        ...account,
        targetType: 'product',
        campaignId: 'CAMP-A',
        externalOptionId: 'VENDOR-1',
      });
      const b = buildAdTargetKey({
        ...account,
        targetType: 'product',
        campaignId: 'CAMP-B',
        externalOptionId: 'VENDOR-1',
      });
      expect(a).toBe('account:account-1:product:CAMP-A:VENDOR-1');
      expect(b).toBe('account:account-1:product:CAMP-B:VENDOR-1');
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
        campaignless: true,
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

  it('canonicalizes provider id, campaign identity, and Coupang detail URL to one identity and target key', () => {
    const byId = buildAdTargetKey({
      ...account,
      targetType: 'campaign',
      campaignId: 'X',
    });
    const byIdentity = buildAdTargetKey({
      ...account,
      targetType: 'campaign',
      campaignIdentity: 'campaign:X',
    });
    const byHref = buildAdTargetKey({
      ...account,
      targetType: 'campaign',
      campaignIdentity:
        'href:https://advertising.coupang.com/marketing/campaign/X/product?z=2&campaignId=X&a=1#ignored',
    });

    expect(byId).toBe('account:account-1:campaign:X');
    expect(byIdentity).toBe(byId);
    expect(byHref).toBe(byId);
    expect(normalizeStableCampaignIdentity('campaign:X')).toBe('campaign:X');
    expect(normalizeStableCampaignIdentity(
      'href:https://advertising.coupang.com/marketing/campaign/X/product?a=1&campaignId=X&z=2',
    )).toBe('campaign:X');
  });

  it.each([
    'href:https://example.test/campaign/X',
    'href:https://advertising.coupang.com.evil.test/campaign/X',
    'href:http://advertising.coupang.com/campaign/X',
    'href:https://user@advertising.coupang.com/campaign/X',
    'href:https://advertising.coupang.com/marketing/dashboard/sales#campaign/X',
    'href:https://advertising.coupang.com/campaign/',
  ])('rejects non-Coupang or non-specific campaign href %s', (identity) => {
    expect(normalizeStableCampaignIdentity(identity)).toBeNull();
  });
});
