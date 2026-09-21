import { describe, expect, it, vi } from 'vitest';
import {
  readProductSaleAgeEvidence,
  saleStartDateFromRaw,
} from './product-sale-age';
import { readProductSaleAgeMappings } from '../products/adapter/out/persistence/read/product-source-availability';

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
      masterProductId,
    }],
    ...overrides,
  };
}

function inventoryReader() {
  return {
    readSaleAgeMappings: (
      context: { client: unknown },
      organizationId: string,
      masterProductIds: string[],
    ) => readProductSaleAgeMappings(
      context.client as never,
      organizationId,
      masterProductIds,
    ),
  };
}

describe('readProductSaleAgeEvidence', () => {
  it('uses valid recipes from historical mapped listings without current channel/account filters', async () => {
    const channelListingFindMany = vi.fn(async (_query: unknown) => [
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
    const queryRaw = vi.fn(async (_query: unknown) => [
      { listingId: OLD_LISTING_ID, source: null, saleStartedAt: '2026-05-01' },
      { listingId: NEW_LISTING_ID, source: null, saleStartedAt: '2026-08-31' },
    ]);

    const db = {
      channelListing: { findMany: channelListingFindMany },
      $queryRaw: queryRaw,
    };
    const result = await readProductSaleAgeEvidence(
      db as never,
      ORGANIZATION_ID,
      [OLD_PRODUCT_ID, NEW_PRODUCT_ID],
      '2026-09-01',
      inventoryReader(),
    );

    expect(result).toEqual([
      { masterProductId: OLD_PRODUCT_ID, mappingValid: true, saleStartDate: '2026-05-01' },
      { masterProductId: NEW_PRODUCT_ID, mappingValid: true, saleStartDate: '2026-08-31' },
    ]);
    expect(queryRaw).toHaveBeenCalledTimes(1);
    const where = ((channelListingFindMany.mock.calls[0] as unknown[] | undefined)?.[0] as {
      where: Record<string, unknown>;
    }).where;
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
              masterProductId: { in: [OLD_PRODUCT_ID, NEW_PRODUCT_ID] },
            },
          },
        },
      },
    });
  });

  it('projects only sale-date JSON fields instead of transferring listing metadata', async () => {
    const channelListingFindMany = vi.fn(async (_query: unknown) => [{
      id: OLD_LISTING_ID,
      rawJson: {
        source: 'wing_app_data',
        saleStartedAt: '2026-01-01T00:00:00',
        largeUnusedMetadata: 'x'.repeat(100_000),
      },
      options: [mappedOption(OLD_PRODUCT_ID)],
    }]);
    const queryRaw = vi.fn(async (_query: unknown) => [{
      listingId: OLD_LISTING_ID,
      source: 'wing_app_data',
      saleStartedAt: '2026-01-01T00:00:00',
    }]);

    const db = {
      channelListing: { findMany: channelListingFindMany },
      $queryRaw: queryRaw,
    };
    await expect(readProductSaleAgeEvidence(
      db as never,
      ORGANIZATION_ID,
      [OLD_PRODUCT_ID],
      '2026-09-01',
      inventoryReader(),
    )).resolves.toEqual([{
      masterProductId: OLD_PRODUCT_ID,
      mappingValid: true,
      saleStartDate: '2026-01-01',
    }]);

    const select = ((channelListingFindMany.mock.calls[0] as unknown[] | undefined)?.[0] as {
      select: Record<string, unknown>;
    }).select;
    expect(select).not.toHaveProperty('rawJson');
    expect(select).toMatchObject({ id: true, options: expect.any(Object) });
    const query = (queryRaw.mock.calls[0] as unknown[] | undefined)?.[0] as {
      strings: readonly string[];
      values: readonly unknown[];
    };
    const sqlText = query.strings.join(' ');
    expect(sqlText).toContain("raw_json -> 'source'");
    expect(sqlText).toContain("raw_json -> 'saleStartedAt'");
    expect(sqlText).toContain('listing.organization_id = ');
    expect(sqlText).toContain('listing.is_active = TRUE');
    expect(sqlText).toContain('listing.id IN');
    expect(sqlText).not.toContain('sellpia_inventory_skus');
    expect(query.values).toEqual([
      ORGANIZATION_ID,
      OLD_LISTING_ID,
    ]);
  });

  it('keeps mapping evidence while rejecting invalid, future, and zero-quantity dates', async () => {
    const db = {
      channelListing: {
        findMany: vi.fn(async (_query: unknown) => [
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
      $queryRaw: vi.fn(async (_query: unknown) => [
        { listingId: OLD_LISTING_ID, source: null, saleStartedAt: '2026-02-31T00:00:00Z' },
        { listingId: NEW_LISTING_ID, source: null, saleStartedAt: '2026-12-01' },
      ]),
    };
    const result = await readProductSaleAgeEvidence(
      db as never,
      ORGANIZATION_ID,
      [OLD_PRODUCT_ID, NEW_PRODUCT_ID],
      '2026-09-01',
      inventoryReader(),
    );

    expect(result).toEqual([
      { masterProductId: OLD_PRODUCT_ID, mappingValid: true, saleStartDate: null },
      { masterProductId: NEW_PRODUCT_ID, mappingValid: true, saleStartDate: null },
    ]);
  });

  it('keeps sale age evidence for every mapped source product', async () => {
    const db = {
      channelListing: {
        findMany: vi.fn(async (_query: unknown) => [{
          id: OLD_LISTING_ID,
          rawJson: { saleStartedAt: '2026-05-01' },
          options: [
            mappedOption(OLD_PRODUCT_ID),
            mappedOption(NEW_PRODUCT_ID),
          ],
        }]),
      },
      $queryRaw: vi.fn(async (_query: unknown) => [{
        listingId: OLD_LISTING_ID,
        source: null,
        saleStartedAt: '2026-05-01',
      }]),
    };
    const result = await readProductSaleAgeEvidence(
      db as never,
      ORGANIZATION_ID,
      [OLD_PRODUCT_ID, NEW_PRODUCT_ID],
      '2026-09-01',
      inventoryReader(),
    );

    expect(result).toEqual([
      { masterProductId: OLD_PRODUCT_ID, mappingValid: true, saleStartDate: '2026-05-01' },
      { masterProductId: NEW_PRODUCT_ID, mappingValid: true, saleStartDate: '2026-05-01' },
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
