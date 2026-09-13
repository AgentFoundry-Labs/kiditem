import { afterEach, describe, expect, it, vi } from 'vitest';
import { snapshotBasisPartial, snapshotBasisStatus } from '@kiditem/shared/dashboard';
import type { ReadinessCheck } from '@kiditem/shared/readiness';
import { ReadinessService } from '../readiness.service';

const ORGANIZATION_ID = '00000000-0000-0000-0000-0000000c0001';
const ACTIVE_COUPANG_ACCOUNT_ID = '00000000-0000-4000-8000-0000000c0002';
const SELLPIA_COMPLETE_RUN_ID = '00000000-0000-4000-8000-0000000c0003';

/** One measured ad day as `readAdWindowFacts` reads it from the ledger. */
function adPublishedRow(
  businessDate: string,
  observedAt = '2026-05-02T01:00:00.000Z',
) {
  return {
    business_date: new Date(`${businessDate}T00:00:00.000Z`),
    spend: 0,
    revenue: 0,
    impressions: 0,
    clicks: 0,
    conversions: 0,
    orders: 0,
    observed_at: new Date(observedAt),
  };
}

/** The ad ledger read, as the service reaches it through `$queryRaw`. */
function adLedger(rows: ReturnType<typeof adPublishedRow>[] = []) {
  return vi.fn(async () => rows);
}

/**
 * The distinct business-date bounds the ledger read carried (`[from, to)`).
 * The reader binds the same pair in more than one CTE, so the raw `values`
 * repeat them; the bounds themselves are what the service chose.
 */
function queriedDates(queryRaw: ReturnType<typeof vi.fn>): string[] {
  const sql = queryRaw.mock.calls[0]?.[0] as
    | { strings?: readonly string[]; values?: unknown[] }
    | undefined;
  // The ad ledger read, whatever CTE the reader opens with.
  expect((sql?.strings ?? []).join('')).toContain('channel_ad_target_daily_snapshots');
  const dates = (sql?.values ?? []).filter(
    (v): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v),
  );
  return [...new Set(dates)];
}

/** The organization a `$queryRaw` call was scoped to. */
function queriedOrganization(queryRaw: ReturnType<typeof vi.fn>): string | undefined {
  const sql = queryRaw.mock.calls[0]?.[0] as { values?: unknown[] } | undefined;
  return sql?.values?.[0] as string | undefined;
}

function withSellpiaReaderTransaction<T extends {
  sourceImportRun: object;
  sellpiaSalesDailySnapshot: { findMany: ReturnType<typeof vi.fn> };
}>(prisma: T): T & { $transaction: ReturnType<typeof vi.fn> } {
  const legacyFindMany = prisma.sellpiaSalesDailySnapshot.findMany;
  const tx = {
    ...prisma,
    sourceImportRun: {
      ...prisma.sourceImportRun,
      findMany: vi.fn(async () => [{ id: SELLPIA_COMPLETE_RUN_ID }]),
    },
    sellpiaSalesDailySnapshot: {
      findMany: vi.fn(async (query: unknown) => {
        const rows = await legacyFindMany(query) as Array<{
          businessDate: Date;
          capturedAt?: Date;
          lastObservedAt?: Date;
        }>;
        return rows.map((row) => ({
          sourceImportRunId: SELLPIA_COMPLETE_RUN_ID,
          businessDate: row.businessDate,
          sellerId: '__kiditem_sellpia_sales_coverage__',
          sellerName: 'KidItem 수집 완료',
          channelGroup: 'others',
          revenueKrw: 0,
          qty: 0,
          costKrw: 0,
          capturedAt: row.capturedAt ?? row.lastObservedAt ?? row.businessDate,
        }));
      }),
    },
  };
  return Object.assign(prisma, {
    $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx)),
  });
}

describe('ReadinessService', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('includes the KST reference date when querying @db.Date business dates', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-02T01:00:00.000Z'));

    const expectedDates = [
      '2026-04-18',
      '2026-04-19',
      '2026-04-20',
      '2026-04-21',
      '2026-04-22',
      '2026-04-23',
      '2026-04-24',
      '2026-04-25',
      '2026-04-26',
      '2026-04-27',
      '2026-04-28',
      '2026-04-29',
      '2026-04-30',
      '2026-05-01',
    ];
    const adExpectedDates = Array.from({ length: 30 }, (_, index) => {
      const date = new Date('2026-04-02T00:00:00.000Z');
      date.setUTCDate(date.getUTCDate() + index);
      return date.toISOString().slice(0, 10);
    });
    const row = (businessDate: string) => ({
      businessDate: new Date(`${businessDate}T00:00:00.000Z`),
      lastObservedAt: new Date('2026-05-02T01:00:00.000Z'),
    });

    const prisma = {
      channelAccount: {
        findFirst: vi.fn(async () => ({ id: ACTIVE_COUPANG_ACCOUNT_ID })),
      },
      channelAccountDailyKpiSnapshot: {
        findMany: vi.fn(async (_args: unknown) =>
          expectedDates.filter((d) => d !== '2026-04-18').map(row),
        ),
      },
      coupangWingSalesRankDailySnapshot: {
        findFirst: vi.fn(async () => ({
          businessDate: new Date('2026-05-01T00:00:00.000Z'),
          capturedAt: new Date('2026-05-02T01:00:00.000Z'),
        })),
        findMany: vi.fn(async () => [
          { vendorItemId: 'vendor-item-1' },
          { vendorItemId: 'vendor-item-2' },
        ]),
        count: vi.fn(async () => 4934),
      },
      channelListingOption: {
        findMany: vi.fn(async () => [
          { externalOptionId: 'vendor-item-1' },
          { externalOptionId: 'vendor-item-2' },
        ]),
      },
      channelListing: {
        count: vi.fn(async () => 1752),
      },
      sourceImportRun: {
        findFirst: vi.fn(async () => ({
          importedAt: new Date('2026-05-02T01:00:00.000Z'),
          coverageEndDate: new Date('2026-05-01T00:00:00.000Z'),
        })),
      },
      // 일별 매출(wing_sales) readiness 는 셀피아 판매현황 기준. 전 일자 present → ok.
      sellpiaSalesDailySnapshot: {
        findMany: vi.fn(async (_args: unknown) =>
          expectedDates.map((businessDate) => ({
            businessDate: new Date(`${businessDate}T00:00:00.000Z`),
            capturedAt: new Date('2026-05-02T01:00:00.000Z'),
          })),
        ),
      },
    };

    const queryRaw = adLedger(adExpectedDates
        .filter((d) => d !== '2026-04-02')
        .map((d) => adPublishedRow(d)),
    );
    (prisma as { $queryRaw?: unknown }).$queryRaw = queryRaw;
    const service = new ReadinessService(withSellpiaReaderTransaction(prisma) as never);
    const status = await service.getStatus(ORGANIZATION_ID);

    const sellpiaQuery = prisma.sellpiaSalesDailySnapshot.findMany.mock.calls[0]?.[0] as {
      where: { sellerId: string };
    };
    // Half-open `[from, to)` over KST business dates, fenced to the organization.
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(queriedOrganization(queryRaw)).toBe(ORGANIZATION_ID);
    expect(queriedDates(queryRaw)).toEqual(['2026-04-02', '2026-05-02']);
    expect(sellpiaQuery.where).toMatchObject({
      organizationId: ORGANIZATION_ID,
      sourceImportRunId: { in: [SELLPIA_COMPLETE_RUN_ID] },
    });
    expect(prisma.channelListing.count).toHaveBeenCalledWith({
      where: {
        organizationId: ORGANIZATION_ID,
        channelAccountId: ACTIVE_COUPANG_ACCOUNT_ID,
        isActive: true,
        lastImportRun: {
          is: {
            organizationId: ORGANIZATION_ID,
            sourceType: {
              in: [
                'coupang_wing_catalog',
                'coupang_wing_catalog_basics',
                'coupang_wing_catalog_details',
              ],
            },
          },
        },
      },
    });
    expect(prisma.sourceImportRun.findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: ORGANIZATION_ID,
        channelAccountId: ACTIVE_COUPANG_ACCOUNT_ID,
        sourceType: { in: ['coupang_wing_catalog', 'coupang_wing_catalog_details'] },
        status: 'completed',
        importedAt: { not: null },
      },
      orderBy: { importedAt: 'desc' },
      select: { importedAt: true, coverageEndDate: true },
    });

    const wingSales = status.checks.find((check) => check.key === 'wing_sales');
    const coupangAds = status.checks.find((check) => check.key === 'coupang_ads');
    const coupangProducts = status.checks.find(
      (check) => check.key === 'coupang_products',
    );
    const wingRank = status.checks.find((check) => check.key === 'wing_kpi');
    expect(readinessState(wingSales)).toBe('ok');
    expect(readinessState(coupangAds)).toBe('stale');
    expect(coupangAds?.missingDates).toEqual(['2026-04-02']);
    expect(coupangProducts).toMatchObject({
      count: 1752,
      lastSyncedAt: '2026-05-02T01:00:00.000Z',
    });
    expect(wingRank).toMatchObject({
      label: 'Wing 판매순위',
      count: 4934,
    });
    expect(readinessState(coupangProducts)).toBe('ok');
    expect(readinessState(wingRank)).toBe('ok');
    expect(status.checks.some((check) => check.key === 'rocket_sales')).toBe(false);
  });

  it('closes Sellpia readiness at yesterday on the first day of a KST month', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-01T01:00:00.000Z'));

    const priorDates = Array.from({ length: 14 }, (_, index) => {
      const date = new Date('2026-06-17T00:00:00.000Z');
      date.setUTCDate(date.getUTCDate() + index);
      return date.toISOString().slice(0, 10);
    });
    const row = (businessDate: string) => ({
      businessDate: new Date(`${businessDate}T00:00:00.000Z`),
      capturedAt: new Date('2026-07-01T01:00:00.000Z'),
    });
    const prisma = {
      channelAccount: {
        findFirst: vi.fn(async () => ({ id: ACTIVE_COUPANG_ACCOUNT_ID })),
      },
      channelAccountDailyKpiSnapshot: {
        findMany: vi.fn(async () => []),
      },
      coupangWingSalesRankDailySnapshot: {
        findFirst: vi.fn(async () => null),
        findMany: vi.fn(async () => []),
        count: vi.fn(async () => 0),
      },
      channelListingOption: { findMany: vi.fn(async () => []) },
      channelListing: {
        count: vi.fn(async () => 0),
      },
      sourceImportRun: { findFirst: vi.fn(async () => null) },
      sellpiaSalesDailySnapshot: {
        // The rolling window is complete through the final closed business day.
        findMany: vi.fn(async (_args: unknown) => priorDates.map(row)),
      },
    };

    const status = await new ReadinessService(withSellpiaReaderTransaction(
      Object.assign(prisma, { $queryRaw: adLedger() }),
    ) as never).getStatus(
      ORGANIZATION_ID,
    );
    const sellpiaQuery =
      prisma.sellpiaSalesDailySnapshot.findMany.mock.calls[0]?.[0] as {
        where: { businessDate: { gte: Date; lte: Date } };
      };
    const wingSales = status.checks.find((check) => check.key === 'wing_sales');

    expect(sellpiaQuery.where.businessDate).toEqual({
      gte: new Date('2026-06-17T00:00:00.000Z'),
      lte: new Date('2026-06-30T00:00:00.000Z'),
    });
    expect(wingSales).toMatchObject({
      referenceDate: '2026-06-30',
      expectedDates: priorDates,
      missingDates: [],
    });
    expect(readinessState(wingSales)).toBe('ok');
  });

  it('keeps a partial Wing sales-rank batch stale until every active vendor item is covered', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-18T01:00:00.000Z'));

    const latestBusinessDate = new Date('2026-07-18T00:00:00.000Z');
    const prisma = {
      channelAccount: {
        findFirst: vi.fn(async () => ({ id: ACTIVE_COUPANG_ACCOUNT_ID })),
      },
      channelAccountDailyKpiSnapshot: { findMany: vi.fn(async () => []) },
      coupangWingSalesRankDailySnapshot: {
        findFirst: vi.fn(async () => ({
          businessDate: latestBusinessDate,
          capturedAt: new Date('2026-07-18T00:30:00.000Z'),
        })),
        findMany: vi.fn(async () => [{ vendorItemId: 'vendor-item-1' }]),
        count: vi.fn(async () => 1),
      },
      channelListingOption: {
        findMany: vi.fn(async () => [
          { externalOptionId: 'vendor-item-1' },
          { externalOptionId: 'vendor-item-2' },
        ]),
      },
      channelListing: {
        count: vi.fn(async () => 2),
      },
      sourceImportRun: {
        findFirst: vi.fn(async () => ({
          importedAt: new Date('2026-07-18T00:30:00.000Z'),
        })),
      },
      sellpiaSalesDailySnapshot: { findMany: vi.fn(async (_args: unknown) => []) },
    };

    const status = await new ReadinessService(withSellpiaReaderTransaction(
      Object.assign(prisma, { $queryRaw: adLedger() }),
    ) as never).getStatus(
      ORGANIZATION_ID,
    );
    const wingRank = status.checks.find((check) => check.key === 'wing_kpi');

    expect(wingRank).toMatchObject({
      count: 1,
      detail: expect.stringContaining('1/2상품'),
    });
    expect(readinessState(wingRank)).toBe('stale');
    expect(
      prisma.coupangWingSalesRankDailySnapshot.findMany,
    ).toHaveBeenCalledWith({
      where: {
        organizationId: ORGANIZATION_ID,
        businessDate: latestBusinessDate,
        vendorItemId: { in: ['vendor-item-1', 'vendor-item-2'] },
        sourceImportRun: {
          organizationId: ORGANIZATION_ID,
          sourceType: 'coupang_wing_rank',
          parserVersion: 'wing-rank-v1',
          status: 'completed',
        },
      },
      select: { vendorItemId: true },
      distinct: ['vendorItemId'],
    });
  });

  it('does not let facts from inactive Coupang accounts mark ads or Wing ready', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-18T01:00:00.000Z'));

    const prisma = {
      channelAccount: { findFirst: vi.fn(async () => null) },
      // These mocks represent stale rows that still exist in the database.
      // They must not be queried when there is no active account.
      channelAccountDailyKpiSnapshot: {
        findMany: vi.fn(async () => [
          {
            businessDate: new Date('2026-07-17T00:00:00.000Z'),
            lastObservedAt: new Date('2026-07-18T00:00:00.000Z'),
          },
        ]),
      },
      channelListingOption: {
        findMany: vi.fn(async () => [{ externalOptionId: 'inactive-vendor' }]),
      },
      coupangWingSalesRankDailySnapshot: {
        findFirst: vi.fn(async () => ({
          businessDate: new Date('2026-07-17T00:00:00.000Z'),
          capturedAt: new Date('2026-07-18T00:00:00.000Z'),
        })),
        findMany: vi.fn(async () => [{ vendorItemId: 'inactive-vendor' }]),
        count: vi.fn(async () => 1),
      },
      channelListing: {
        count: vi.fn(async () => 0),
      },
      sourceImportRun: { findFirst: vi.fn(async () => null) },
      sellpiaSalesDailySnapshot: { findMany: vi.fn(async (_args: unknown) => []) },
    };

    const queryRaw = adLedger();
    (prisma as { $queryRaw?: unknown }).$queryRaw = queryRaw;
    const status = await new ReadinessService(withSellpiaReaderTransaction(prisma) as never).getStatus(
      ORGANIZATION_ID,
    );

    expect(prisma.channelAccountDailyKpiSnapshot.findMany).not.toHaveBeenCalled();
    expect(queryRaw).not.toHaveBeenCalled();
    expect(prisma.channelListingOption.findMany).not.toHaveBeenCalled();
    expect(prisma.channelListing.count).not.toHaveBeenCalled();
    expect(prisma.sourceImportRun.findFirst).not.toHaveBeenCalled();
    expect(
      prisma.coupangWingSalesRankDailySnapshot.findFirst,
    ).not.toHaveBeenCalled();
    const ads = status.checks.find((check) => check.key === 'coupang_ads');
    expect(ads).toMatchObject({
      count: 0,
    });
    const wingRank = status.checks.find((check) => check.key === 'wing_kpi');
    expect(wingRank).toMatchObject({
      count: 0,
    });
    const products = status.checks.find((check) => check.key === 'coupang_products');
    expect(products).toMatchObject({
      count: 0,
      lastSyncedAt: null,
    });
    expect(readinessState(ads)).toBe('missing');
    expect(readinessState(wingRank)).toBe('missing');
    expect(readinessState(products)).toBe('missing');
  });

  it('keeps the ad readiness window at exactly 30 days while Sellpia stays month-aware', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-18T01:00:00.000Z'));

    const prisma = {
      channelAccount: {
        findFirst: vi.fn(async () => ({ id: ACTIVE_COUPANG_ACCOUNT_ID })),
      },
      channelAccountDailyKpiSnapshot: { findMany: vi.fn(async () => []) },
      coupangWingSalesRankDailySnapshot: {
        findFirst: vi.fn(async () => null),
        findMany: vi.fn(async () => []),
        count: vi.fn(async () => 0),
      },
      channelListingOption: { findMany: vi.fn(async () => []) },
      channelListing: {
        count: vi.fn(async () => 0),
      },
      sourceImportRun: { findFirst: vi.fn(async () => null) },
      sellpiaSalesDailySnapshot: { findMany: vi.fn(async () => []) },
    };

    const queryRaw = adLedger();
    (prisma as { $queryRaw?: unknown }).$queryRaw = queryRaw;
    const status = await new ReadinessService(withSellpiaReaderTransaction(prisma) as never).getStatus(
      ORGANIZATION_ID,
    );
    const sellpiaQuery =
      prisma.sellpiaSalesDailySnapshot.findMany.mock.calls[0]?.[0] as {
        where: { businessDate: { gte: Date; lte: Date } };
      };
    const ads = status.checks.find((check) => check.key === 'coupang_ads');
    const sales = status.checks.find((check) => check.key === 'wing_sales');

    // Half-open `[from, to)` over KST business dates.
    expect(queriedDates(queryRaw)).toEqual(['2026-06-18', '2026-07-18']);
    expect(sellpiaQuery.where.businessDate).toEqual({
      gte: new Date('2026-07-01T00:00:00.000Z'),
      lte: new Date('2026-07-17T00:00:00.000Z'),
    });
    expect(ads?.expectedDates).toHaveLength(30);
    expect(ads?.expectedDates?.[0]).toBe('2026-06-18');
    expect(sales?.expectedDates?.[0]).toBe('2026-07-01');
  });

  it('keeps previous owner-published coverage after a failed refresh and ignores legacy rows', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-18T01:00:00.000Z'));

    const expectedDates = Array.from({ length: 30 }, (_, index) => {
      const date = new Date('2026-06-18T00:00:00.000Z');
      date.setUTCDate(date.getUTCDate() + index);
      return date.toISOString().slice(0, 10);
    });
    const previousCompleteObservedAt = '2026-07-17T23:30:00.000Z';
    const prisma = {
      channelAccount: {
        findFirst: vi.fn(async () => ({ id: ACTIVE_COUPANG_ACCOUNT_ID })),
      },
      // A failed new attempt and legacy rows must not become a second read path.
      channelAccountDailyKpiSnapshot: {
        findMany: vi.fn(async () => expectedDates.map((businessDate) => ({
          businessDate: new Date(`${businessDate}T00:00:00.000Z`),
          lastObservedAt: new Date('2026-07-18T00:00:00.000Z'),
        }))),
      },
      coupangWingSalesRankDailySnapshot: {
        findFirst: vi.fn(async () => null),
        findMany: vi.fn(async () => []),
        count: vi.fn(async () => 0),
      },
      channelListingOption: { findMany: vi.fn(async () => []) },
      channelListing: { count: vi.fn(async () => 0) },
      sourceImportRun: { findFirst: vi.fn(async () => null) },
      sellpiaSalesDailySnapshot: { findMany: vi.fn(async () => []) },
    };
    const queryRaw = adLedger(expectedDates.map((businessDate) =>
        adPublishedRow(businessDate, previousCompleteObservedAt),
      ),
    );

    (prisma as { $queryRaw?: unknown }).$queryRaw = queryRaw;

    const status = await new ReadinessService(withSellpiaReaderTransaction(prisma) as never).getStatus(
      ORGANIZATION_ID,
    );
    const ads = status.checks.find((check) => check.key === 'coupang_ads');

    // Half-open `[from, to)` over KST business dates.
    expect(queriedDates(queryRaw)).toEqual(['2026-06-18', '2026-07-18']);
    expect(prisma.channelAccountDailyKpiSnapshot.findMany).not.toHaveBeenCalled();
    expect(ads).toMatchObject({
      count: expectedDates.length,
      lastSyncedAt: previousCompleteObservedAt,
    });
    expect(readinessState(ads)).toBe('ok');
  });

  it('does not promote a nullable staged inventory identity into a Wing vendor target', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-18T01:00:00.000Z'));

    const latestBusinessDate = new Date('2026-07-17T00:00:00.000Z');
    const prisma = {
      channelAccount: {
        findFirst: vi.fn(async () => ({ id: ACTIVE_COUPANG_ACCOUNT_ID })),
      },
      channelAccountDailyKpiSnapshot: { findMany: vi.fn(async () => []) },
      channelListingOption: {
        findMany: vi.fn(async () => [
          {
            externalOptionId: 'inventory-item-fallback',
            rawJson: {
              source: 'coupang_wing_catalog_basics',
              externalOptionIdentitySource: 'inventory_item',
              vendorInventoryItemId: 'inventory-item-fallback',
            },
          },
          {
            externalOptionId: 'vendor-item-1',
            rawJson: {
              source: 'coupang_wing_catalog_basics',
              externalOptionIdentitySource: 'vendor_item',
              vendorItemId: 'vendor-item-1',
            },
          },
          {
            externalOptionId: 'vendor-item-known',
            rawJson: {
              source: 'coupang_wing_catalog_details',
              externalOptionIdentitySource: 'vendor_item',
              vendorItemId: null,
            },
          },
        ]),
      },
      channelListing: { count: vi.fn(async () => 1) },
      sourceImportRun: {
        findFirst: vi.fn(async () => ({
          importedAt: new Date('2026-07-18T00:30:00.000Z'),
        })),
      },
      coupangWingSalesRankDailySnapshot: {
        findFirst: vi.fn(async () => ({
          businessDate: latestBusinessDate,
          capturedAt: new Date('2026-07-18T00:30:00.000Z'),
        })),
        findMany: vi.fn(async () => [
          { vendorItemId: 'vendor-item-1' },
          { vendorItemId: 'vendor-item-known' },
        ]),
        count: vi.fn(async () => 2),
      },
      sellpiaSalesDailySnapshot: { findMany: vi.fn(async () => []) },
    };

    const status = await new ReadinessService(withSellpiaReaderTransaction(
      Object.assign(prisma, { $queryRaw: adLedger() }),
    ) as never).getStatus(
      ORGANIZATION_ID,
    );

    expect(prisma.coupangWingSalesRankDailySnapshot.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          vendorItemId: { in: ['vendor-item-1', 'vendor-item-known'] },
        }),
      }),
    );
    expect(status.checks.find((check) => check.key === 'wing_kpi')).toMatchObject({
      count: 2,
    });
    expect(readinessState(status.checks.find((check) => check.key === 'wing_kpi'))).toBe('ok');
  });

  it('marks the catalog ready after a completed basics publication is followed by details', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-11T01:00:00.000Z'));
    const prisma = catalogReadinessPrisma({
      productCount: 1254,
      latestCatalogRun: {
        sourceType: 'coupang_wing_catalog_details',
        importedAt: new Date('2026-09-10T00:10:00.000Z'),
        coverageEndDate: new Date('2026-09-10T00:00:00.000Z'),
      },
    });

    const status = await new ReadinessService(withSellpiaReaderTransaction(
      Object.assign(prisma, { $queryRaw: adLedger() }),
    ) as never).getStatus(
      ORGANIZATION_ID,
    );
    const products = status.checks.find((check) => check.key === 'coupang_products');

    expect(products).toMatchObject({
      count: 1254,
      detail: '쿠팡 상품 1254건 수집됨',
    });
    expect(readinessState(products)).toBe('ok');
    expect(prisma.channelListing.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        lastImportRun: {
          is: {
            organizationId: ORGANIZATION_ID,
            sourceType: {
              in: [
                'coupang_wing_catalog',
                'coupang_wing_catalog_basics',
                'coupang_wing_catalog_details',
              ],
            },
          },
        },
      }),
    });
    expect(prisma.sourceImportRun.findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: ORGANIZATION_ID,
        channelAccountId: ACTIVE_COUPANG_ACCOUNT_ID,
        sourceType: {
          in: ['coupang_wing_catalog', 'coupang_wing_catalog_details'],
        },
        status: 'completed',
        importedAt: { not: null },
      },
      orderBy: { importedAt: 'desc' },
      select: { importedAt: true, coverageEndDate: true },
    });
  });

  it('keeps legacy catalog coverage unknown instead of inferring it from import time', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-11T01:00:00.000Z'));
    const importedAt = new Date('2026-09-10T00:10:00.000Z');
    const prisma = catalogReadinessPrisma({
      productCount: 1254,
      latestCatalogRun: {
        sourceType: 'coupang_wing_catalog_details',
        importedAt,
        coverageEndDate: null,
      },
    });

    const status = await new ReadinessService(withSellpiaReaderTransaction(
      Object.assign(prisma, { $queryRaw: adLedger() }),
    ) as never).getStatus(ORGANIZATION_ID);
    const products = status.checks.find((check) => check.key === 'coupang_products');

    expect(products?.basis).toMatchObject({
      measured: true,
      asOf: null,
      observedAt: importedAt.toISOString(),
    });
    expect(snapshotBasisStatus(products!.basis)).toBe('unknown');
  });

  it('keeps basic coverage visible while a details publication is partial', async () => {
    const prisma = catalogReadinessPrisma({
      productCount: 1254,
      latestCatalogRun: null,
    });

    const status = await new ReadinessService(withSellpiaReaderTransaction(
      Object.assign(prisma, { $queryRaw: adLedger() }),
    ) as never).getStatus(
      ORGANIZATION_ID,
    );
    const products = status.checks.find((check) => check.key === 'coupang_products');

    expect(products).toMatchObject({
      count: 1254,
      detail: '쿠팡 상품 기본 목록 1254건 반영됨 — 전체 상세 수집 필요',
    });
    expect(readinessState(products)).toBe('missing');
    expect(products?.detail).not.toContain('최초 수집 필요');
  });
});

function catalogReadinessPrisma(input: {
  productCount: number;
  latestCatalogRun: {
    sourceType: string;
    importedAt: Date;
    coverageEndDate: Date | null;
  } | null;
}) {
  return {
    channelAccount: {
      findFirst: vi.fn(async () => ({ id: ACTIVE_COUPANG_ACCOUNT_ID })),
    },
    channelListingOption: {
      findMany: vi.fn(async () => []),
    },
    channelListing: {
      count: vi.fn(async () => input.productCount),
    },
    sourceImportRun: {
      findFirst: vi.fn(async () => input.latestCatalogRun),
    },
    coupangWingSalesRankDailySnapshot: {
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 0),
    },
    sellpiaSalesDailySnapshot: {
      findMany: vi.fn(async () => []),
    },
  };
}

function readinessState(check: ReadinessCheck | undefined): 'ok' | 'stale' | 'missing' {
  if (!check || snapshotBasisStatus(check.basis) === 'unavailable') return 'missing';
  return snapshotBasisStatus(check.basis) === 'current' && !snapshotBasisPartial(check.basis)
    ? 'ok'
    : 'stale';
}
