import { describe, expect, it } from 'vitest';
import {
  AdKeywordGroupPlanSchema,
  AdKeywordGroupResultSchema,
  AdKeywordRosterSchema,
  AdKeywordSourceBeginSchema,
} from './ad-keyword-source';

describe('Ad keyword source transport contracts', () => {
  it('does not accept client organization or client-selected observation dates at begin', () => {
    expect(AdKeywordSourceBeginSchema.safeParse({}).success).toBe(true);
    expect(AdKeywordSourceBeginSchema.safeParse({ organizationId: 'org' }).success).toBe(false);
    expect(AdKeywordSourceBeginSchema.safeParse({ startDate: '2026-09-01' }).success).toBe(false);
  });
  it('preserves unknown identity/pagination as evidence rather than coercing it to a successful empty response', () => {
    const raw = {
      advertiserId: null,
      campaigns: [],
      pages: [{ page: 0, campaignsArrayObserved: false, hasNextPage: null, campaignCount: 0 }],
    };
    expect(AdKeywordRosterSchema.parse(raw)).toEqual(raw);
    expect(
      AdKeywordRosterSchema.safeParse({
        ...raw,
        pages: [{ ...raw.pages[0], hasNextPage: 'false' }],
      }).success,
    ).toBe(false);
  });
  it('retains the original 60-ad group boundary without erasing truncation evidence', () => {
    const raw = {
      advertiserId: 'A',
      adsArrayObserved: true,
      adGroupName: null,
      enumeratedAdCount: 61,
      ads: Array.from({ length: 60 }, (_, i) => ({
        adId: String(i),
        vendorItemId: String(i),
        itemName: '',
        isActive: true,
      })),
    };
    expect(AdKeywordGroupPlanSchema.parse(raw).enumeratedAdCount).toBe(61);
    expect(
      AdKeywordGroupPlanSchema.safeParse({ ...raw, ads: [...raw.ads, raw.ads[0]] }).success,
    ).toBe(false);
  });
  it('carries both request outcomes, normalized rows and the original capture timestamp without imposing a new keyword cap', () => {
    const raw = {
      advertiserId: 'A',
      capturedAt: new Date('2026-09-06T01:00:00Z'),
      ads: [{ adId: '1', metricsOk: true, registeredOk: false }],
      rows: Array.from({ length: 953 }, () => ({
        keyword: '문구',
        extraProviderField: 'retained',
      })),
    };
    const result = AdKeywordGroupResultSchema.parse(raw);
    expect(result.capturedAt).toBe('2026-09-06T01:00:00.000Z');
    expect(result.ads[0].registeredOk).toBe(false);
    expect(result.rows).toHaveLength(953);
    expect(result.rows[0].extraProviderField).toBe('retained');
  });
});
