import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../../test-helpers/real-prisma';
import {
  readOrderByIdFact,
  readOrderListFacts,
  readOrderReturnByIdFact,
  readOrderReturns,
  readOrderReturnStatusCounts,
  readOrderStatusCounts,
  readObservedOrderBounds,
  readObservedOrderCount,
  readOrderWindowFacts,
} from '../order-facts.reader';
import type { PrismaClient } from '@prisma/client';

const ACCOUNT_ID = '71000000-0000-4000-8000-000000000001';
const SECOND_ACCOUNT_ID = '71000000-0000-4000-8000-000000000002';
const OTHER_ACCOUNT_ID = '72000000-0000-4000-8000-000000000001';
const FROM = new Date('2026-04-30T15:00:00.000Z');
const TO = new Date('2026-05-01T15:00:00.000Z');

describe('Order facts reader over disposable PostgreSQL', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    await prisma.channelAccount.createMany({
      data: [
        {
          id: ACCOUNT_ID,
          organizationId: TEST_ORGANIZATION_ID,
          channel: 'order_collection',
          name: 'Reader account',
          externalAccountId: 'haebub-mall',
        },
        {
          id: SECOND_ACCOUNT_ID,
          organizationId: TEST_ORGANIZATION_ID,
          channel: 'order_collection',
          name: 'Second reader account',
          externalAccountId: 'domeggook',
        },
        {
          id: OTHER_ACCOUNT_ID,
          organizationId: OTHER_ORGANIZATION_ID,
          channel: 'coupang',
          name: 'Foreign reader account',
          externalAccountId: 'foreign-reader-account',
        },
      ],
    });
  });

  it('keeps observed line-item facts separate from declared full-window coverage', async () => {
    await seedOrder(TEST_ORGANIZATION_ID, ACCOUNT_ID, 'ORDER-OWN', 999_999, [
      { totalPrice: 12_000, quantity: 2 },
      { totalPrice: 7_000, quantity: 1 },
    ]);
    await seedOrder(OTHER_ORGANIZATION_ID, OTHER_ACCOUNT_ID, 'ORDER-FOREIGN', 800_000, [
      { totalPrice: 800_000, quantity: 40 },
    ]);

    const result = await prisma.$transaction((tx) =>
      readOrderWindowFacts(tx, {
        organizationId: TEST_ORGANIZATION_ID,
        from: FROM,
        to: TO,
      }),
    );

    expect(result).toMatchObject({
      revenue: null,
      orderCount: null,
      quantity: null,
      observedTotals: { revenue: 19_000, orderCount: 1, quantity: 3 },
      requestedDates: ['2026-05-01'],
      includedDates: [],
      missingDates: ['2026-05-01'],
      sourceCoverage: [{
        sourceType: 'order_collection_mall',
        channelAccountId: ACCOUNT_ID,
        mallKey: 'haebub-mall',
        factDates: ['2026-05-01'],
        includedDates: [],
        missingDates: ['2026-05-01'],
      }],
    });
    expect(result.observedAt).toBeInstanceOf(Date);

    await seedCoverage(TEST_ORGANIZATION_ID, ACCOUNT_ID);
    const measured = await prisma.$transaction((tx) =>
      readOrderWindowFacts(tx, {
        organizationId: TEST_ORGANIZATION_ID,
        from: FROM,
        to: TO,
      }),
    );
    expect(measured).toMatchObject({
      revenue: 19_000,
      orderCount: 1,
      quantity: 3,
      includedDates: ['2026-05-01'],
      missingDates: [],
    });

    const bounds = await prisma.$transaction((tx) =>
      readObservedOrderBounds(tx, TEST_ORGANIZATION_ID),
    );
    expect(bounds).toEqual({
      from: new Date('2026-04-30T15:00:00.000Z'),
      to: new Date('2026-05-01T15:00:00.000Z'),
    });
  });

  it('requires declared coverage from every source scope that contributed facts', async () => {
    await seedOrder(TEST_ORGANIZATION_ID, ACCOUNT_ID, 'ORDER-FIRST-MALL', 12_000, [
      { totalPrice: 12_000, quantity: 1 },
    ]);
    await seedOrder(TEST_ORGANIZATION_ID, SECOND_ACCOUNT_ID, 'ORDER-SECOND-MALL', 7_000, [
      { totalPrice: 7_000, quantity: 1 },
    ]);
    await seedCoverage(TEST_ORGANIZATION_ID, ACCOUNT_ID);

    const result = await prisma.$transaction((tx) =>
      readOrderWindowFacts(tx, {
        organizationId: TEST_ORGANIZATION_ID,
        from: FROM,
        to: TO,
      }),
    );

    expect(result).toMatchObject({
      revenue: null,
      orderCount: null,
      observedTotals: { revenue: 19_000, orderCount: 2, quantity: 2 },
      includedDates: [],
      missingDates: ['2026-05-01'],
      sourceCoverage: [
        {
          channelAccountId: ACCOUNT_ID,
          mallKey: 'haebub-mall',
          includedDates: ['2026-05-01'],
          missingDates: [],
        },
        {
          channelAccountId: SECOND_ACCOUNT_ID,
          mallKey: 'domeggook',
          includedDates: [],
          missingDates: ['2026-05-01'],
        },
      ],
    });
  });

  it('distinguishes an unmeasured empty window from a measured zero', async () => {
    const unmeasured = await prisma.$transaction((tx) =>
      readOrderWindowFacts(tx, {
        organizationId: TEST_ORGANIZATION_ID,
        from: FROM,
        to: TO,
      }),
    );
    expect(unmeasured).toEqual({
      revenue: null,
      orderCount: null,
      quantity: null,
      observedAt: null,
      observedTotals: null,
      requestedDates: ['2026-05-01'],
      includedDates: [],
      missingDates: ['2026-05-01'],
      sourceCoverage: [],
    });

    const observedAt = new Date('2026-05-02T01:02:03.000Z');
    await prisma.sourceImportRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: ACCOUNT_ID,
        sourceType: 'order_collection_mall',
        status: 'completed',
        importedAt: observedAt,
        coverageStartDate: new Date('2026-05-01T00:00:00.000Z'),
        coverageEndDate: new Date('2026-05-01T00:00:00.000Z'),
      },
    });

    const measured = await prisma.$transaction((tx) =>
      readOrderWindowFacts(tx, {
        organizationId: TEST_ORGANIZATION_ID,
        from: FROM,
        to: TO,
      }),
    );
    expect(measured).toEqual({
      revenue: 0,
      orderCount: 0,
      quantity: 0,
      observedAt,
      observedTotals: null,
      requestedDates: ['2026-05-01'],
      includedDates: ['2026-05-01'],
      missingDates: [],
      sourceCoverage: [{
        sourceType: 'order_collection_mall',
        channelAccountId: ACCOUNT_ID,
        mallKey: 'haebub-mall',
        factDates: [],
        includedDates: ['2026-05-01'],
        missingDates: [],
        observedAt,
      }],
    });
  });

  it('does not treat unscoped coverage as an organization-wide measured zero', async () => {
    await prisma.sourceImportRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceType: 'order_collection_mall',
        status: 'completed',
        coverageStartDate: new Date('2026-05-01T00:00:00.000Z'),
        coverageEndDate: new Date('2026-05-01T00:00:00.000Z'),
      },
    });

    const result = await prisma.$transaction((tx) =>
      readOrderWindowFacts(tx, {
        organizationId: TEST_ORGANIZATION_ID,
        from: FROM,
        to: TO,
      }),
    );

    expect(result).toMatchObject({
      revenue: null,
      orderCount: null,
      observedTotals: null,
      includedDates: [],
      missingDates: ['2026-05-01'],
      sourceCoverage: [],
    });
  });

  it('keeps source observation when every order is excluded from business totals', async () => {
    await seedOrder(TEST_ORGANIZATION_ID, ACCOUNT_ID, 'ORDER-CANCELLED', 999_999, [
      { totalPrice: 12_000, quantity: 1 },
    ]);
    await prisma.order.updateMany({
      where: { organizationId: TEST_ORGANIZATION_ID, externalOrderId: 'ORDER-CANCELLED' },
      data: { status: 'cancelled' },
    });
    await seedCoverage(TEST_ORGANIZATION_ID, ACCOUNT_ID);

    const result = await prisma.$transaction((tx) =>
      readOrderWindowFacts(tx, {
        organizationId: TEST_ORGANIZATION_ID,
        from: FROM,
        to: TO,
        excludedStatuses: ['cancelled'],
      }),
    );

    expect(result).toMatchObject({ revenue: 0, orderCount: 0, quantity: 0 });
    expect(result.observedAt).toBeInstanceOf(Date);
  });

  it('does not publish order facts owned by an incomplete source run', async () => {
    const running = await prisma.sourceImportRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceType: 'coupang_direct_order_capture',
        status: 'running',
      },
    });
    await seedOrder(TEST_ORGANIZATION_ID, ACCOUNT_ID, 'ORDER-RUNNING', 999_999, [
      { totalPrice: 12_000, quantity: 1 },
    ]);
    await prisma.order.updateMany({
      where: { organizationId: TEST_ORGANIZATION_ID, externalOrderId: 'ORDER-RUNNING' },
      data: { sourceImportRunId: running.id },
    });

    const result = await prisma.$transaction((tx) =>
      readOrderWindowFacts(tx, {
        organizationId: TEST_ORGANIZATION_ID,
        from: FROM,
        to: TO,
      }),
    );

    expect(result).toEqual({
      revenue: null,
      orderCount: null,
      quantity: null,
      observedAt: null,
      observedTotals: null,
      requestedDates: ['2026-05-01'],
      includedDates: [],
      missingDates: ['2026-05-01'],
      sourceCoverage: [],
    });
  });

  it('counts every order a completed source run published, and no other', async () => {
    await seedOrder(TEST_ORGANIZATION_ID, ACCOUNT_ID, 'ORDER-COUNTED', 12_000, [
      { totalPrice: 12_000, quantity: 1 },
    ]);
    // A published order counts whatever its status: the count says whether a
    // collection published orders, not what they earned.
    await seedOrder(TEST_ORGANIZATION_ID, ACCOUNT_ID, 'ORDER-COUNTED-CANCELLED', 8_000, [
      { totalPrice: 8_000, quantity: 1 },
    ]);
    await prisma.order.updateMany({
      where: { organizationId: TEST_ORGANIZATION_ID, externalOrderId: 'ORDER-COUNTED-CANCELLED' },
      data: { status: 'cancelled' },
    });
    const running = await prisma.sourceImportRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceType: 'coupang_direct_order_capture',
        status: 'running',
      },
    });
    await seedOrder(TEST_ORGANIZATION_ID, ACCOUNT_ID, 'ORDER-RUNNING-UNCOUNTED', 5_000, [
      { totalPrice: 5_000, quantity: 1 },
    ]);
    await prisma.order.updateMany({
      where: { organizationId: TEST_ORGANIZATION_ID, externalOrderId: 'ORDER-RUNNING-UNCOUNTED' },
      data: { sourceImportRunId: running.id },
    });
    await prisma.order.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: ACCOUNT_ID,
        externalOrderId: 'ORDER-WITHOUT-SOURCE-UNCOUNTED',
        orderedAt: new Date('2026-05-01T03:00:00.000Z'),
        status: 'paid',
        totalPrice: 1_000,
      },
    });
    await seedOrder(OTHER_ORGANIZATION_ID, OTHER_ACCOUNT_ID, 'ORDER-FOREIGN', 7_000, [
      { totalPrice: 7_000, quantity: 1 },
    ]);

    const counts = await prisma.$transaction(async (tx) => ({
      test: await readObservedOrderCount(tx, TEST_ORGANIZATION_ID),
      other: await readObservedOrderCount(tx, OTHER_ORGANIZATION_ID),
    }));

    expect(counts).toEqual({ test: 2, other: 1 });
  });

  it('does not publish legacy source-null orders through owner readers', async () => {
    await prisma.order.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: ACCOUNT_ID,
        externalOrderId: 'ORDER-WITHOUT-SOURCE',
        orderedAt: new Date('2026-05-01T03:00:00.000Z'),
        status: 'paid',
        totalPrice: 12_000,
      },
    });

    const result = await prisma.$transaction(async (tx) => ({
      window: await readOrderWindowFacts(tx, {
        organizationId: TEST_ORGANIZATION_ID,
        from: FROM,
        to: TO,
      }),
      list: await readOrderListFacts(tx, {
        organizationId: TEST_ORGANIZATION_ID,
        status: 'paid',
      }),
      statuses: await readOrderStatusCounts(tx, TEST_ORGANIZATION_ID),
      bounds: await readObservedOrderBounds(tx, TEST_ORGANIZATION_ID),
    }));

    expect(result.window.observedTotals).toBeNull();
    expect(result.window.orderCount).toBeNull();
    expect(result.list).toEqual([]);
    expect(result.statuses).toEqual({ total: 0, byStatus: {} });
    expect(result.bounds).toBeNull();
  });

  it('serves order screen facts through the complete source gate at line amount grain', async () => {
    const order = await seedOrder(
      TEST_ORGANIZATION_ID,
      ACCOUNT_ID,
      'ORDER-SCREEN',
      999_999,
      [
        { totalPrice: 12_000, quantity: 2 },
        { totalPrice: 7_000, quantity: 1 },
      ],
    );
    await seedOrder(
      OTHER_ORGANIZATION_ID,
      OTHER_ACCOUNT_ID,
      'ORDER-SCREEN-FOREIGN',
      800_000,
      [{ totalPrice: 800_000, quantity: 40 }],
    );
    const running = await prisma.sourceImportRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceType: 'coupang_direct_order_capture',
        status: 'running',
      },
    });
    const incomplete = await seedOrder(
      TEST_ORGANIZATION_ID,
      ACCOUNT_ID,
      'ORDER-SCREEN-RUNNING',
      500_000,
      [{ totalPrice: 500_000, quantity: 20 }],
    );
    await prisma.order.update({
      where: { id: incomplete.id },
      data: { sourceImportRunId: running.id },
    });

    const result = await prisma.$transaction(async (tx) => ({
      list: await readOrderListFacts(tx, {
        organizationId: TEST_ORGANIZATION_ID,
        status: 'paid',
      }),
      one: await readOrderByIdFact(tx, TEST_ORGANIZATION_ID, order.id),
      incomplete: await readOrderByIdFact(tx, TEST_ORGANIZATION_ID, incomplete.id),
      statuses: await readOrderStatusCounts(tx, TEST_ORGANIZATION_ID),
    }));

    expect(result.list).toHaveLength(1);
    expect(result.list[0]).toMatchObject({
      id: order.id,
      totalPrice: 19_000,
      lineItems: [
        { totalPrice: 12_000, quantity: 2 },
        { totalPrice: 7_000, quantity: 1 },
      ],
    });
    expect(result.one).toMatchObject({ id: order.id, totalPrice: 19_000 });
    expect(result.incomplete).toBeNull();
    expect(result.statuses).toEqual({ total: 1, byStatus: { paid: 1 } });
  });

  it('serves organization-scoped return screen facts and status totals', async () => {
    const own = await prisma.orderReturn.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: ACCOUNT_ID,
        externalReturnId: 'RETURN-OWN',
        type: 'RETURN',
        status: 'UC',
        reason: 'damaged',
        requestedAt: new Date('2026-05-01T04:00:00.000Z'),
      },
    });
    await prisma.orderReturnLineItem.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        returnId: own.id,
        productName: 'Reader return item',
        quantity: 2,
      },
    });
    await prisma.orderReturn.create({
      data: {
        organizationId: OTHER_ORGANIZATION_ID,
        channelAccountId: OTHER_ACCOUNT_ID,
        externalReturnId: 'RETURN-FOREIGN',
        type: 'RETURN',
        status: 'COMPLETED',
        reason: 'foreign',
        requestedAt: new Date('2026-05-01T04:00:00.000Z'),
      },
    });

    const result = await prisma.$transaction(async (tx) => ({
      list: await readOrderReturns(tx, {
        organizationId: TEST_ORGANIZATION_ID,
        type: 'RETURN',
        from: FROM,
        to: TO,
      }),
      one: await readOrderReturnByIdFact(tx, TEST_ORGANIZATION_ID, own.id),
      statuses: await readOrderReturnStatusCounts(tx, TEST_ORGANIZATION_ID),
    }));

    expect(result.list).toHaveLength(1);
    expect(result.list[0]).toMatchObject({
      id: own.id,
      lineItems: [{ productName: 'Reader return item', quantity: 2 }],
    });
    expect(result.one?.id).toBe(own.id);
    expect(result.statuses).toEqual({ total: 1, byStatus: { UC: 1 } });
  });

  async function seedOrder(
    organizationId: string,
    channelAccountId: string,
    externalOrderId: string,
    totalPrice: number,
    lines: ReadonlyArray<{ totalPrice: number; quantity: number }>,
  ) {
    const sourceRun = await prisma.sourceImportRun.create({
      data: {
        organizationId,
        channelAccountId,
        sourceType: 'order_collection_mall',
        status: 'completed',
        importedAt: new Date('2026-05-01T05:00:00.000Z'),
      },
    });
    const order = await prisma.order.create({
      data: {
        organizationId,
        channelAccountId,
        sourceImportRunId: sourceRun.id,
        externalOrderId,
        orderedAt: new Date('2026-05-01T03:00:00.000Z'),
        status: 'paid',
        totalPrice,
      },
    });
    await prisma.orderLineItem.createMany({
      data: lines.map((line, index) => ({
        organizationId,
        orderId: order.id,
        externalLineId: `${externalOrderId}-${index}`,
        totalPrice: line.totalPrice,
        quantity: line.quantity,
      })),
    });
    return order;
  }

  async function seedCoverage(organizationId: string, channelAccountId: string) {
    return prisma.sourceImportRun.create({
      data: {
        organizationId,
        channelAccountId,
        sourceType: 'order_collection_mall',
        status: 'completed',
        importedAt: new Date('2026-05-02T01:02:03.000Z'),
        coverageStartDate: new Date('2026-05-01T00:00:00.000Z'),
        coverageEndDate: new Date('2026-05-01T00:00:00.000Z'),
      },
    });
  }
});
