import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import * as XLSX from 'xlsx';
import { TrafficService } from '../traffic.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { SourceFailureAlerts } from '../../../alerts/alerts.service';
import { AdTrafficSourceRepository } from '../../../advertising/adapter/out/repository/ad-traffic-source.repository';
import {
  AD_TRAFFIC_READ_PORT,
} from '../../../advertising/application/port/in/ad-traffic-source.port';
import { currentBusinessDate } from '../../../advertising/domain/business-date';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  OTHER_ORGANIZATION_ID,
  IDOR_SENTINEL,
} from '../../../test-helpers/real-prisma';
import type { MulterFile } from '../../../common/types';
import type {
  AdTrafficSourceDailyPlan,
  AdTrafficSourceDailyReceiptInput,
  AdTrafficSourcePeriodReceiptInput,
} from '@kiditem/shared/advertising';
import type { PrismaClient } from '@prisma/client';

const DAY_MS = 86_400_000;
const WING_URL = 'https://wing.coupang.com/tenants/business-insight/sales-analysis';

type TrafficSummary = {
  visitors: number;
  views: number;
  cartAdds: number;
  orders: number;
  salesQty: number;
  revenue: number;
  providerConversionRate: number | null;
};

type MonthRange = {
  year: number;
  month: number;
  startDate: string;
  endDate: string;
  days: number;
};

const dateText = (value: Date): string => value.toISOString().slice(0, 10);
const dateShift = (date: string, days: number): string =>
  dateText(new Date(Date.parse(`${date}T00:00:00.000Z`) + days * DAY_MS));

function summary(overrides: Partial<TrafficSummary> = {}): TrafficSummary {
  return {
    visitors: 10,
    views: 20,
    cartAdds: 3,
    orders: 2,
    salesQty: 4,
    revenue: 300,
    providerConversionRate: null,
    ...overrides,
  };
}

function rawSummary(label: string, values: TrafficSummary) {
  return {
    source: 'wing.summary.body',
    label,
    summaryMetrics: {
      totalUniqueVisitor: values.visitors,
      totalPageViews: values.views,
      totalAddToCart: values.cartAdds,
      totalOrders: values.orders,
      totalUnitsSold: values.salesQty,
      totalGmv: values.revenue,
      pvToOrder: values.providerConversionRate === null
        ? null
        : values.providerConversionRate / 100,
    },
  };
}

function previousMonthRange(reference = currentBusinessDate()): MonthRange {
  const currentMonthStart = new Date(Date.UTC(
    reference.getUTCFullYear(),
    reference.getUTCMonth(),
    1,
  ));
  const previousMonthEnd = new Date(currentMonthStart.getTime() - DAY_MS);
  const previousMonthStart = new Date(Date.UTC(
    previousMonthEnd.getUTCFullYear(),
    previousMonthEnd.getUTCMonth(),
    1,
  ));
  return {
    year: previousMonthEnd.getUTCFullYear(),
    month: previousMonthEnd.getUTCMonth() + 1,
    startDate: dateText(previousMonthStart),
    endDate: dateText(previousMonthEnd),
    days: Math.round((previousMonthEnd.getTime() - previousMonthStart.getTime()) / DAY_MS) + 1,
  };
}

/**
 * `TrafficService` reads owner-published account daily facts and writes
 * operator CSV/XLSX evidence. Listing daily snapshots are deliberately not a
 * read fallback for Wing traffic.
 */
describe('TrafficService (PG integration) — daily facts', () => {
  let prisma: PrismaClient;
  let service: TrafficService;
  let trafficOwner: AdTrafficSourceRepository;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const prismaService = prisma as unknown as PrismaService;
    trafficOwner = new AdTrafficSourceRepository(
      prismaService,
      new SourceFailureAlerts(prismaService),
    );
    const m = await Test.createTestingModule({
      providers: [
        TrafficService,
        { provide: PrismaService, useValue: prisma },
        { provide: AD_TRAFFIC_READ_PORT, useValue: trafficOwner },
      ],
    }).compile();
    service = m.get(TrafficService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  async function seedListing(organizationId: string, suffix: string) {
    const account = await prisma.channelAccount.create({
      data: {
        organizationId,
        channel: 'coupang',
        name: `Wing ${suffix}`,
        externalAccountId: `WING-${suffix}`,
        vendorId: `VENDOR-${suffix}`,
        isPrimary: true,
      },
    });
    const listing = await prisma.channelListing.create({
      data: {
        organizationId,
        channelAccountId: account.id,
        externalId: `EXT-${suffix}`,
      },
    });
    await prisma.channelListingOption.create({
      data: {
        organizationId,
        listingId: listing.id,
        externalOptionId: '1001',
        isActive: true,
      },
    });
    return listing;
  }

  function dailyReceipt(
    attemptId: string,
    plan: AdTrafficSourceDailyPlan,
    businessDate: string,
    values: TrafficSummary,
  ): AdTrafficSourceDailyReceiptInput {
    return {
      key: `${attemptId}:daily:${businessDate}`,
      capturedAt: `${businessDate}T01:00:00.000Z`,
      url: WING_URL,
      providerVendorId: plan.providerVendorId,
      kind: 'daily_page',
      filterScope: plan.filterScope,
      businessDate,
      startDate: businessDate,
      endDate: businessDate,
      period: 1,
      pageIndex: 1,
      proof: {
        expectedPages: 1,
        visitedPages: [1],
        terminalPageObserved: true,
        verified: true,
        complete: true,
      },
      data: [{
        vendorItemId: '1001',
        visitors: values.visitors,
        views: values.views,
        cartAdds: values.cartAdds,
        orders: values.orders,
        salesQty: values.salesQty,
        revenue: values.revenue,
      }],
      accountSummary: values,
      accountSummaryRaw: rawSummary(`daily:${businessDate}`, values),
    };
  }

  function periodReceipt(
    attemptId: string,
    plan: AdTrafficSourceDailyPlan,
    values: TrafficSummary,
  ): AdTrafficSourcePeriodReceiptInput {
    return {
      key: `${attemptId}:period`,
      capturedAt: `${plan.endDate}T02:00:00.000Z`,
      url: WING_URL,
      providerVendorId: plan.providerVendorId,
      kind: 'period_summary',
      filterScope: plan.filterScope,
      startDate: plan.startDate,
      endDate: plan.endDate,
      period: plan.periodDays,
      accountSummary: values,
      accountSummaryRaw: rawSummary('period', values),
    };
  }

  /** Begins an owner attempt and uploads its receipts; the terminal submission is the caller's. */
  async function stageOwnerRange(
    organizationId: string,
    channelAccountId: string,
    startDate: string,
    endDate: string,
    dailyValues: TrafficSummary,
  ) {
    const started = await trafficOwner.beginAttempt({
      organizationId,
      idempotencyKey: randomUUID(),
      request: {
        channelAccountId,
        startDate,
        endDate,
        url: WING_URL,
      },
    });
    const control = await trafficOwner.readAttemptControl({
      organizationId,
      attemptId: started.attemptId,
    });
    if (!control) throw new Error('Owner attempt control was not created.');
    const plan = started.plan as AdTrafficSourceDailyPlan;
    const days = plan.expectedDates.length;
    for (const [index, businessDate] of plan.expectedDates.entries()) {
      await trafficOwner.uploadReceipt({
        organizationId,
        attemptId: started.attemptId,
        attemptToken: control.attemptToken,
        sequence: index * 100,
        receipt: dailyReceipt(started.attemptId, plan, businessDate, dailyValues),
      });
    }
    const periodValues: TrafficSummary = {
      ...dailyValues,
      visitors: dailyValues.visitors * days,
      views: dailyValues.views * days,
      cartAdds: dailyValues.cartAdds * days,
      orders: dailyValues.orders * days,
      salesQty: dailyValues.salesQty * days,
      revenue: dailyValues.revenue * days,
    };
    await trafficOwner.uploadReceipt({
      organizationId,
      attemptId: started.attemptId,
      attemptToken: control.attemptToken,
      sequence: days * 100,
      receipt: periodReceipt(started.attemptId, plan, periodValues),
    });
    const stagedControl = await trafficOwner.readAttemptControl({
      organizationId,
      attemptId: started.attemptId,
    });
    if (!stagedControl) throw new Error('Owner attempt control was lost.');
    return {
      attemptId: started.attemptId,
      attemptToken: control.attemptToken,
      manifestChecksum: stagedControl.manifestChecksum,
    };
  }

  async function collectOwnerRange(
    organizationId: string,
    channelAccountId: string,
    startDate: string,
    endDate: string,
    dailyValues: TrafficSummary,
  ) {
    const staged = await stageOwnerRange(organizationId, channelAccountId, startDate, endDate, dailyValues);
    await trafficOwner.finalizeAttempt({ organizationId, ...staged });
    return staged;
  }

  it('getTrafficSummary — owner coverage includes today and withholds incomplete totals', async () => {
    const listing = await seedListing(TEST_ORGANIZATION_ID, 'A');
    const today = dateText(currentBusinessDate());
    const closedEnd = dateShift(today, -1);
    await collectOwnerRange(
      TEST_ORGANIZATION_ID,
      listing.channelAccountId,
      dateShift(today, -7),
      closedEnd,
      summary({ revenue: 100, orders: 1, salesQty: 1, visitors: 10 }),
    );

    const result = await service.getTrafficSummary(7, TEST_ORGANIZATION_ID);
    expect(result).toMatchObject({
      revenue: null,
      orders: null,
      salesQty: null,
      visitors: null,
      averageDailyVisitors: null,
      coverage: {
        from: dateShift(today, -6),
        to: today,
        targetDays: 7,
        completedDays: 6,
        missingDates: [today],
      },
    });
  });

  it('getTrafficSummary — missing owner publication returns null metrics and explicit coverage', async () => {
    const today = dateText(currentBusinessDate());
    const result = await service.getTrafficSummary(7, TEST_ORGANIZATION_ID);
    expect(result).toMatchObject({
      revenue: null,
      orders: null,
      salesQty: null,
      visitors: null,
      averageDailyVisitors: null,
      coverage: {
        from: dateShift(today, -6),
        to: today,
        targetDays: 7,
        completedDays: 0,
        missingDates: Array.from({ length: 7 }, (_, index) => dateShift(today, -6 + index)),
      },
    });
  });

  it('getMonthlyRevenue — owner publications remain organization-scoped', async () => {
    const tListing = await seedListing(TEST_ORGANIZATION_ID, 'T');
    const oListing = await seedListing(OTHER_ORGANIZATION_ID, 'O');
    const range = previousMonthRange();

    await collectOwnerRange(
      TEST_ORGANIZATION_ID,
      tListing.channelAccountId,
      range.startDate,
      range.endDate,
      summary({ revenue: 500, orders: 5 }),
    );
    await collectOwnerRange(
      OTHER_ORGANIZATION_ID,
      oListing.channelAccountId,
      range.startDate,
      range.endDate,
      summary({ revenue: IDOR_SENTINEL, orders: IDOR_SENTINEL }),
    );

    const tResult = await service.getMonthlyRevenue(
      range.year,
      range.month,
      TEST_ORGANIZATION_ID,
    );
    expect(tResult.total.revenue).toBe(range.days * 500);
    expect(tResult.total.orders).toBe(range.days * 5);
    expect(tResult.total.revenue).not.toBe(IDOR_SENTINEL);

    const oResult = await service.getMonthlyRevenue(
      range.year,
      range.month,
      OTHER_ORGANIZATION_ID,
    );
    expect(oResult.total.revenue).toBe(range.days * IDOR_SENTINEL);
    expect(oResult.total.orders).toBe(range.days * IDOR_SENTINEL);
    expect(oResult.total.revenue).not.toBe(tResult.total.revenue);
  });

  it('uploadTrafficStats — preserves every raw CSV/XLSX row and upserts one summed daily fact per listing/date', async () => {
    const listing = await seedListing(TEST_ORGANIZATION_ID, 'UPLOAD-RAW');
    const rows = [
      {
        등록상품ID: listing.externalId,
        날짜: '2026-04-14',
        방문자: 10,
        조회: 20,
        주문: 1,
        판매량: 1,
        '매출(원)': 1000,
      },
      {
        등록상품ID: listing.externalId,
        날짜: '2026-04-14',
        방문자: 30,
        조회: 40,
        주문: 2,
        판매량: 3,
        '매출(원)': 4000,
      },
    ];
    const sheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'traffic');
    const buffer = XLSX.write(workbook, {
      type: 'buffer',
      bookType: 'xlsx',
    }) as Buffer;

    const result = await service.uploadTrafficStats(
      {
        fieldname: 'file',
        buffer,
        encoding: '7bit',
        mimetype:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: buffer.length,
        originalname: 'traffic-upload.xlsx',
      },
      TEST_ORGANIZATION_ID,
    );

    expect(result).toMatchObject({ success: true, upserted: 1, skipped: 0 });

    const run = await prisma.channelScrapeRun.findFirst({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        source: 'traffic_csv_upload',
        pageType: 'traffic',
      },
      orderBy: { startedAt: 'desc' },
    });
    expect(run).toBeDefined();
    expect(run?.status).toBe('complete');

    const snapshots = await prisma.channelScrapeSnapshot.findMany({
      where: { scrapeRunId: run!.id },
      orderBy: { observedAt: 'asc' },
    });
    expect(snapshots).toHaveLength(2);
    expect(snapshots[0].rawJson).toMatchObject({ 방문자: 10 });
    expect(snapshots[1].rawJson).toMatchObject({ 방문자: 30 });
    expect(snapshots.every((s) => s.matchStatus === 'matched')).toBe(true);

    const daily = await prisma.channelListingDailySnapshot.findFirst({
      where: { organizationId: TEST_ORGANIZATION_ID, listingId: listing.id },
    });
    expect(daily?.businessDate.toISOString().slice(0, 10)).toBe('2026-04-14');
    expect(daily?.trafficVisitors).toBe(40);
    expect(daily?.trafficViews).toBe(60);
    expect(daily?.trafficOrders).toBe(3);
    expect(daily?.trafficSalesQty).toBe(4);
    expect(daily?.trafficRevenue).toBe(5000);
    expect(daily?.metaJson).toMatchObject({
      'traffic.currentSource': 'traffic.csv_upload',
      'traffic.csv_upload': { source: 'traffic_csv_upload' },
    });
  });

  it('uploadTrafficStats — daily fact failure keeps raw snapshots and marks run error', async () => {
    const listing = await seedListing(TEST_ORGANIZATION_ID, 'UPLOAD-FAIL');
    const sheet = XLSX.utils.json_to_sheet([
      {
        등록상품ID: listing.externalId,
        날짜: '2026-04-14',
        방문자: 10,
        조회: 20,
        주문: 1,
        판매량: 1,
        '매출(원)': 1000,
      },
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'traffic');
    const buffer = XLSX.write(workbook, {
      type: 'buffer',
      bookType: 'xlsx',
    }) as Buffer;

    const originalTransaction = prisma.$transaction.bind(prisma);
    (prisma as { $transaction: typeof originalTransaction }).$transaction =
      (async () => {
      throw new Error('boom daily upsert');
    }) as typeof originalTransaction;

    try {
      await expect(
        service.uploadTrafficStats(
          {
            fieldname: 'file',
            buffer,
            encoding: '7bit',
            mimetype:
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            size: buffer.length,
            originalname: 'traffic-upload-fail.xlsx',
          },
          TEST_ORGANIZATION_ID,
        ),
      ).rejects.toThrow('boom daily upsert');
    } finally {
      (prisma as { $transaction: typeof originalTransaction }).$transaction =
        originalTransaction;
    }

    const run = await prisma.channelScrapeRun.findFirst({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        source: 'traffic_csv_upload',
        pageType: 'traffic',
      },
      orderBy: { startedAt: 'desc' },
    });
    expect(run?.status).toBe('error');
    expect(run?.errorJson).toMatchObject({
      message: expect.stringContaining('boom daily upsert'),
    });
    const snapshots = await prisma.channelScrapeSnapshot.findMany({
      where: { scrapeRunId: run!.id },
    });
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].rawJson).toMatchObject({ 방문자: 10 });

    const dailyCount = await prisma.channelListingDailySnapshot.count({
      where: { organizationId: TEST_ORGANIZATION_ID, listingId: listing.id },
    });
    expect(dailyCount).toBe(0);
  });

  function trafficWorkbook(rows: Array<Record<string, unknown>>, originalname: string): MulterFile {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'traffic');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    return {
      fieldname: 'file',
      buffer,
      encoding: '7bit',
      mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: buffer.length,
      originalname,
    };
  }

  async function waitingAdvisoryLocks(): Promise<number> {
    const [row] = await prisma.$queryRaw<Array<{ waiting: number }>>`
      SELECT count(*)::int AS waiting FROM pg_locks WHERE locktype = 'advisory' AND NOT granted
    `;
    return row?.waiting ?? 0;
  }

  it('uploadTrafficStats — waits for a Wing traffic publication holding the traffic lock, so that publication cannot zero the uploaded day from a stale read', async () => {
    const reportedListing = await seedListing(TEST_ORGANIZATION_ID, 'RACE');
    const businessDate = dateShift(dateText(currentBusinessDate()), -1);
    // A catalog listing Wing's report leaves out: the publication zero-fills its day.
    const uploadedListing = await prisma.channelListing.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: reportedListing.channelAccountId,
        externalId: 'EXT-RACE-UPLOADED',
        createdAt: new Date(Date.now() - DAY_MS),
        rawJson: { source: 'coupang_catalog_basics', createdOn: '2026-01-02 09:00:00' },
      },
    });
    const staged = await stageOwnerRange(
      TEST_ORGANIZATION_ID,
      reportedListing.channelAccountId,
      businessDate,
      businessDate,
      summary(),
    );
    // The gate pauses the publication at its first row, after its upsert
    // statement has read which listing-days to zero.
    await prisma.$executeRaw`CREATE FUNCTION test_wing_traffic_publication_gate() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.meta_json -> 'traffic.currentSource' = '"wing.traffic"'::jsonb THEN PERFORM pg_advisory_xact_lock(195195); END IF; RETURN NEW; END $$`;
    await prisma.$executeRaw`CREATE TRIGGER test_wing_traffic_publication_gate BEFORE INSERT ON channel_listing_daily_snapshots FOR EACH ROW EXECUTE FUNCTION test_wing_traffic_publication_gate()`;
    let openGate!: () => void;
    let gateHeld!: () => void;
    const opened = new Promise<void>((resolve) => { openGate = resolve; });
    const held = new Promise<void>((resolve) => { gateHeld = resolve; });
    const gate = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(195195)::text`;
      gateHeld();
      await opened;
    }, { timeout: 20_000 });
    let publication: Promise<unknown> = Promise.resolve();
    let upload: Promise<unknown> = Promise.resolve();
    try {
      await held;
      publication = trafficOwner.finalizeAttempt({ organizationId: TEST_ORGANIZATION_ID, ...staged })
        .then(() => 'COMPLETE', (error: unknown) => error);
      await expect.poll(waitingAdvisoryLocks, { timeout: 10_000, interval: 20 }).toBe(1);

      let uploadSettled = false;
      upload = service.uploadTrafficStats(
        trafficWorkbook([{
          등록상품ID: 'EXT-RACE-UPLOADED',
          날짜: businessDate,
          방문자: 30,
          조회: 40,
          주문: 2,
          판매량: 3,
          '매출(원)': 4000,
        }], 'traffic-race.xlsx'),
        TEST_ORGANIZATION_ID,
      ).then((result) => result, (error: unknown) => error).finally(() => { uploadSettled = true; });
      // The upload either waits behind the publication's lock or commits while
      // the publication is paused.
      await expect.poll(
        async () => uploadSettled || (await waitingAdvisoryLocks()) === 2,
        { timeout: 10_000, interval: 20 },
      ).toBe(true);
      const uploadWaited = !uploadSettled;
      openGate();
      await gate;
      await expect(publication).resolves.toBe('COMPLETE');
      await expect(upload).resolves.toMatchObject({ success: true, upserted: 1 });

      const uploadedDay = await prisma.channelListingDailySnapshot.findUniqueOrThrow({
        where: {
          organizationId_listingId_businessDate: {
            organizationId: TEST_ORGANIZATION_ID,
            listingId: uploadedListing.id,
            businessDate: new Date(`${businessDate}T00:00:00.000Z`),
          },
        },
      });
      expect({ uploadWaited, uploadedDay }).toMatchObject({
        uploadWaited: true,
        uploadedDay: {
          trafficVisitors: 30,
          trafficViews: 40,
          trafficOrders: 2,
          trafficSalesQty: 3,
          trafficRevenue: 4000,
          metaJson: { 'traffic.currentSource': 'traffic.csv_upload' },
        },
      });
    } finally {
      openGate();
      await Promise.allSettled([gate, publication, upload]);
      await prisma.$executeRaw`DROP TRIGGER IF EXISTS test_wing_traffic_publication_gate ON channel_listing_daily_snapshots`;
      await prisma.$executeRaw`DROP FUNCTION IF EXISTS test_wing_traffic_publication_gate()`;
    }
  });

  it('getMonthlyRevenue — aggregates complete owner days, averages visitors, and blocks listing fallback', async () => {
    const listing = await seedListing(TEST_ORGANIZATION_ID, 'M');
    const legacyListing = await prisma.channelListing.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: listing.channelAccountId,
        externalId: 'EXT-M-LEGACY',
      },
    });
    const range = previousMonthRange();
    await collectOwnerRange(
      TEST_ORGANIZATION_ID,
      listing.channelAccountId,
      range.startDate,
      range.endDate,
      summary({ visitors: 100, views: 20, cartAdds: 3, orders: 2, salesQty: 4, revenue: 1000 }),
    );
    await collectOwnerRange(
      TEST_ORGANIZATION_ID,
      listing.channelAccountId,
      dateShift(range.startDate, -1),
      dateShift(range.startDate, -1),
      summary({
        visitors: IDOR_SENTINEL,
        views: IDOR_SENTINEL,
        cartAdds: IDOR_SENTINEL,
        orders: IDOR_SENTINEL,
        salesQty: IDOR_SENTINEL,
        revenue: IDOR_SENTINEL,
      }),
    );

    // A legacy listing fact with a sentinel value must never supplement the
    // owner's accountDaily projection.
    await prisma.channelListingDailySnapshot.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        listingId: legacyListing.id,
        channel: 'coupang',
        externalId: legacyListing.externalId,
        businessDate: new Date(`${range.startDate}T00:00:00.000Z`),
        trafficVisitors: IDOR_SENTINEL,
        trafficViews: IDOR_SENTINEL,
        trafficOrders: IDOR_SENTINEL,
        trafficSalesQty: IDOR_SENTINEL,
        trafficRevenue: IDOR_SENTINEL,
      },
    });

    const result = await service.getMonthlyRevenue(
      range.year,
      range.month,
      TEST_ORGANIZATION_ID,
    );
    expect(result.year).toBe(range.year);
    expect(result.month).toBe(range.month);
    expect(result.total).toEqual({
      revenue: range.days * 1000,
      orders: range.days * 2,
      salesQty: range.days * 4,
      visitors: 100,
      views: range.days * 20,
      cartAdds: range.days * 3,
    });
    expect(result.averageDailyVisitors).toBe(100);
    expect(result.days).toHaveLength(range.days);
    expect(result.coverage).toEqual({
      from: range.startDate,
      to: range.endDate,
      targetDays: range.days,
      completedDays: range.days,
      missingDates: [],
    });
  });

});
