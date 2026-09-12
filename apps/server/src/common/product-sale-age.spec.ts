import { describe, expect, it, vi } from 'vitest';
import {
  readProductSaleAgeEvidence,
  saleStartDateFromRaw,
} from './product-sale-age';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const OLD_PRODUCT_ID = '00000000-0000-4000-8000-000000000002';
const NEW_PRODUCT_ID = '00000000-0000-4000-8000-000000000003';
const OLD_LISTING_ID = '00000000-0000-4000-8000-000000000004';
const NEW_LISTING_ID = '00000000-0000-4000-8000-000000000005';

function mappedOption(masterProductId: string, overrides: Record<string, unknown> = {}) {
  return {
    organizationId: ORGANIZATION_ID,
    isActive: true,
    inventoryComponents: [{
      quantity: 1,
      sellpiaInventorySku: {
        isActive: true,
        masterProductId,
        masterProduct: { isActive: true },
      },
    }],
    ...overrides,
  };
}

describe('readProductSaleAgeEvidence', () => {
  it('uses valid recipes from historical mapped listings without current channel/account filters', async () => {
    const findMany = vi.fn(async () => [
      {
        id: OLD_LISTING_ID,
        rawJson: { saleStartedAt: '2026-05-01' },
        options: [mappedOption(OLD_PRODUCT_ID)],
      },
      {
        id: NEW_LISTING_ID,
        rawJson: { saleStartedAt: '2026-08-31' },
        options: [mappedOption(NEW_PRODUCT_ID)],
      },
    ]);
    const queryRaw = vi.fn(async () => [
      { listingId: OLD_LISTING_ID, source: null, saleStartedAt: '2026-05-01' },
      { listingId: NEW_LISTING_ID, source: null, saleStartedAt: '2026-08-31' },
    ]);

    const result = await readProductSaleAgeEvidence(
      { channelListing: { findMany }, $queryRaw: queryRaw } as never,
      ORGANIZATION_ID,
      [OLD_PRODUCT_ID, NEW_PRODUCT_ID],
      '2026-09-01',
    );

    expect(result).toEqual([
      { masterProductId: OLD_PRODUCT_ID, mappingValid: true, saleStartDate: '2026-05-01' },
      { masterProductId: NEW_PRODUCT_ID, mappingValid: true, saleStartDate: '2026-08-31' },
    ]);
    expect(queryRaw).toHaveBeenCalledTimes(1);
    const where = (findMany.mock.calls[0]?.[0] as { where: Record<string, unknown> }).where;
    expect(where).not.toHaveProperty('channelAccount');
    expect(where).toMatchObject({
      organizationId: ORGANIZATION_ID,
      isActive: true,
      options: {
        some: {
          organizationId: ORGANIZATION_ID,
          isActive: true,
          inventoryComponents: {
            some: {
              organizationId: ORGANIZATION_ID,
              sellpiaInventorySku: { masterProductId: { in: [OLD_PRODUCT_ID, NEW_PRODUCT_ID] } },
            },
          },
        },
      },
    });
  });

  it('projects only sale-date JSON fields instead of transferring listing metadata', async () => {
    const findMany = vi.fn(async () => [{
      id: OLD_LISTING_ID,
      rawJson: {
        source: 'wing_app_data',
        saleStartedAt: '2026-01-01T00:00:00',
        largeUnusedMetadata: 'x'.repeat(100_000),
      },
      options: [mappedOption(OLD_PRODUCT_ID)],
    }]);
    const queryRaw = vi.fn(async () => [{
      listingId: OLD_LISTING_ID,
      source: 'wing_app_data',
      saleStartedAt: '2026-01-01T00:00:00',
    }]);

    await expect(readProductSaleAgeEvidence(
      { channelListing: { findMany }, $queryRaw: queryRaw } as never,
      ORGANIZATION_ID,
      [OLD_PRODUCT_ID],
      '2026-09-01',
    )).resolves.toEqual([{
      masterProductId: OLD_PRODUCT_ID,
      mappingValid: true,
      saleStartDate: '2026-01-01',
    }]);

    const select = (findMany.mock.calls[0]?.[0] as {
      select: Record<string, unknown>;
    }).select;
    expect(select).not.toHaveProperty('rawJson');
    expect(select).toMatchObject({ id: true, options: expect.any(Object) });
    const query = queryRaw.mock.calls[0]?.[0] as {
      strings: readonly string[];
      values: readonly unknown[];
    };
    const sqlText = query.strings.join(' ');
    expect(sqlText).toContain("raw_json -> 'source'");
    expect(sqlText).toContain("raw_json -> 'saleStartedAt'");
    expect(sqlText).toContain('listing.organization_id = ');
    expect(sqlText).toContain('listing.is_active = TRUE');
    expect(sqlText).toContain('EXISTS');
    expect(sqlText).toContain('option.organization_id = ');
    expect(sqlText).toContain('option.listing_id = listing.id');
    expect(sqlText).toContain('option.is_active = TRUE');
    expect(query.values).toEqual([
      ORGANIZATION_ID,
      ORGANIZATION_ID,
      ORGANIZATION_ID,
      OLD_PRODUCT_ID,
    ]);
  });

  it('keeps mapping evidence while rejecting invalid, future, and zero-quantity dates', async () => {
    const result = await readProductSaleAgeEvidence(
      {
        channelListing: {
          findMany: vi.fn(async () => [
            {
              id: OLD_LISTING_ID,
              rawJson: { saleStartedAt: '2026-02-31T00:00:00Z' },
              options: [mappedOption(OLD_PRODUCT_ID)],
            },
            {
              id: NEW_LISTING_ID,
              rawJson: { saleStartedAt: '2026-12-01' },
              options: [mappedOption(NEW_PRODUCT_ID)],
            },
          ]),
        },
        $queryRaw: vi.fn(async () => [
          { listingId: OLD_LISTING_ID, source: null, saleStartedAt: '2026-02-31T00:00:00Z' },
          { listingId: NEW_LISTING_ID, source: null, saleStartedAt: '2026-12-01' },
        ]),
      } as never,
      ORGANIZATION_ID,
      [OLD_PRODUCT_ID, NEW_PRODUCT_ID],
      '2026-09-01',
    );

    expect(result).toEqual([
      { masterProductId: OLD_PRODUCT_ID, mappingValid: true, saleStartDate: null },
      { masterProductId: NEW_PRODUCT_ID, mappingValid: true, saleStartDate: null },
    ]);
  });

  it('does not use sale age from a listing with an incomplete option recipe', async () => {
    const result = await readProductSaleAgeEvidence(
      {
        channelListing: {
          findMany: vi.fn(async () => [{
            id: OLD_LISTING_ID,
            rawJson: { saleStartedAt: '2026-05-01' },
            options: [
              mappedOption(OLD_PRODUCT_ID),
              mappedOption(NEW_PRODUCT_ID, {
                inventoryComponents: [{
                  quantity: 1,
                  sellpiaInventorySku: {
                    isActive: false,
                    masterProductId: NEW_PRODUCT_ID,
                    masterProduct: { isActive: true },
                  },
                }],
              }),
            ],
          }]),
        },
        $queryRaw: vi.fn(async () => [{
          listingId: OLD_LISTING_ID,
          source: null,
          saleStartedAt: '2026-05-01',
        }]),
      } as never,
      ORGANIZATION_ID,
      [OLD_PRODUCT_ID, NEW_PRODUCT_ID],
      '2026-09-01',
    );

    expect(result).toEqual([
      { masterProductId: OLD_PRODUCT_ID, mappingValid: false, saleStartDate: null },
      { masterProductId: NEW_PRODUCT_ID, mappingValid: false, saleStartDate: null },
    ]);
  });
});

describe('saleStartDateFromRaw', () => {
  it('accepts the documented Coupang Wing local timestamp as KST only', () => {
    expect(saleStartDateFromRaw({
      source: 'wing_app_data',
      saleStartedAt: '2026-01-01T23:00:00',
    }, '2026-09-01')).toBe('2026-01-01');
    expect(saleStartDateFromRaw({
      source: 'unknown',
      saleStartedAt: '2026-01-01T23:00:00',
    }, '2026-09-01')).toBeNull();
  });

  it('accepts naive KST timestamps from verified staged Wing catalog sources', () => {
    for (const source of ['coupang_catalog_details', 'coupang_catalog_basics']) {
      expect(saleStartDateFromRaw({
        source,
        saleStartedAt: '2026-04-01T14:41:57',
      }, '2026-09-01')).toBe('2026-04-01');
    }
  });

  it('does not infer a sale start from unrelated provider dates or unknown sources', () => {
    expect(saleStartDateFromRaw({
      source: 'coupang_catalog_details',
      createdOn: '2026-04-01 11:32:06',
      saleDates: { start: '2026-04-01' },
    }, '2026-09-01')).toBeNull();
    expect(saleStartDateFromRaw({
      source: 'unverified_wing_payload',
      saleStartedAt: '2026-04-01T14:41:57',
    }, '2026-09-01')).toBeNull();
  });

  it('rejects invalid and future staged Wing timestamps', () => {
    expect(saleStartDateFromRaw({
      source: 'coupang_catalog_details',
      saleStartedAt: '2026-02-31T14:41:57',
    }, '2026-09-01')).toBeNull();
    expect(saleStartDateFromRaw({
      source: 'coupang_catalog_basics',
      saleStartedAt: '2026-12-01T14:41:57',
    }, '2026-09-01')).toBeNull();
  });

  it.each([
    '2026-02-29',
    '2026-02-31T00:00:00Z',
    '2026-01-01T24:00:00Z',
    '2026-01-01T00:00:60Z',
  ])('rejects malformed date %s', (value) => {
    expect(saleStartDateFromRaw({ saleStartedAt: value }, '2026-09-01')).toBeNull();
  });
});
