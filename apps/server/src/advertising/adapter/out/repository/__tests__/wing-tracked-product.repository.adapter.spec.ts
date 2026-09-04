import { describe, expect, it, vi } from 'vitest';
import { WingTrackedProductRepositoryAdapter } from '../wing-tracked-product.repository.adapter';
import {
  WING_TRACKED_PRODUCTS_SOURCE_TYPE,
  WingTrackedProductSourceAttemptRepositoryAdapter,
} from '../wing-tracked-product-source-attempt.repository.adapter';
import { upsertWingTrackedProductSnapshots } from '../wing-tracked-product-snapshot.persistence';
import { currentBusinessDate } from '../../../../domain/business-date';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ORGANIZATION_ID = '99999999-9999-4999-8999-999999999999';

describe('WingTrackedProductRepositoryAdapter.findBulkHistory', () => {
  it('performs one organization-bounded query ordered by tracked product and business date', async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        trackedProductId: '22222222-2222-4222-8222-222222222222',
        businessDate: new Date('2026-08-13T00:00:00.000Z'),
        salePriceKrw: 10_000,
        ratingCount: 1,
        ratingAverage: null,
        pvLast28Day: null,
        salesLast28d: null,
        estimatedRevenue28d: null,
        conversionRate28d: null,
        capturedAt: new Date('2026-08-13T01:00:00.000Z'),
        trackedProduct: { productName: '상품 A' },
      },
      {
        trackedProductId: '22222222-2222-4222-8222-222222222222',
        businessDate: new Date('2026-08-14T00:00:00.000Z'),
        salePriceKrw: 11_000,
        ratingCount: 2,
        ratingAverage: null,
        pvLast28Day: null,
        salesLast28d: null,
        estimatedRevenue28d: null,
        conversionRate28d: null,
        capturedAt: new Date('2026-08-14T01:00:00.000Z'),
        trackedProduct: { productName: '상품 A' },
      },
    ]);
    const adapter = new WingTrackedProductRepositoryAdapter({
      coupangWingTrackedProductDailySnapshot: { findMany },
    } as never);

    const result = await adapter.findBulkHistory(ORGANIZATION_ID, 30);

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        organizationId: ORGANIZATION_ID,
        businessDate: { gte: expect.any(Date) },
      },
      orderBy: [
        { trackedProductId: 'asc' },
        { businessDate: 'asc' },
      ],
      include: {
        trackedProduct: { select: { productName: true } },
      },
    });
    expect(JSON.stringify(findMany.mock.calls)).not.toContain(OTHER_ORGANIZATION_ID);
    expect(result).toMatchObject([
      {
        trackedProductId: '22222222-2222-4222-8222-222222222222',
        productName: '상품 A',
        points: [
          { businessDate: new Date('2026-08-13T00:00:00.000Z') },
          { businessDate: new Date('2026-08-14T00:00:00.000Z') },
        ],
      },
    ]);
  });
});

describe('upsertWingTrackedProductSnapshots', () => {
  it('replaces a terminal capture with bounded set-based writes', async () => {
    const findMany = vi.fn().mockResolvedValue([
      { id: 'tracked-1', productId: 'wing-1' },
      { id: 'tracked-2', productId: 'wing-2' },
    ]);
    const deleteMany = vi.fn().mockResolvedValue({ count: 2 });
    const createMany = vi.fn().mockResolvedValue({ count: 2 });
    const updateMany = vi.fn().mockResolvedValue({ count: 2 });
    const capturedAt = new Date('2026-08-14T03:15:00.000Z');

    await expect(upsertWingTrackedProductSnapshots({
      coupangWingTrackedProduct: { findMany, updateMany },
      coupangWingTrackedProductDailySnapshot: { deleteMany, createMany },
    } as never, [
      {
        productId: 'wing-1',
        businessDate: new Date('2026-08-14T00:00:00.000Z'),
        sourceKeyword: 'A Pencil',
        capturedAt,
        salePriceKrw: 1200,
        ratingCount: 3,
        ratingAverage: 4.5,
        pvLast28Day: 10,
        salesLast28d: 2,
        estimatedRevenue28d: 2400,
        conversionRate28d: 0.2,
      },
      {
        productId: 'wing-2',
        businessDate: new Date('2026-08-14T00:00:00.000Z'),
        sourceKeyword: 'Other Pencil',
        capturedAt,
        salePriceKrw: 2300,
        ratingCount: 4,
        ratingAverage: 4.7,
        pvLast28Day: 12,
        salesLast28d: 3,
        estimatedRevenue28d: 6900,
        conversionRate28d: 0.25,
      },
    ], ORGANIZATION_ID)).resolves.toEqual({ captured: 2, ignored: 0 });

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(deleteMany).toHaveBeenCalledTimes(1);
    expect(createMany).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { trackedProductId: 'tracked-1', businessDate: new Date('2026-08-14T00:00:00.000Z') },
          { trackedProductId: 'tracked-2', businessDate: new Date('2026-08-14T00:00:00.000Z') },
        ],
      },
    });
    expect(createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ trackedProductId: 'tracked-1', capturedAt, salePriceKrw: 1200 }),
        expect.objectContaining({ trackedProductId: 'tracked-2', capturedAt, salePriceKrw: 2300 }),
      ]),
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['tracked-1', 'tracked-2'] }, organizationId: ORGANIZATION_ID, enabled: true },
      data: { lastCapturedAt: capturedAt },
    });
  });
});

describe('WingTrackedProductSourceAttemptRepositoryAdapter', () => {
  const attempt = {
    id: '22222222-2222-4222-8222-222222222222',
    organizationId: ORGANIZATION_ID,
    sourceType: WING_TRACKED_PRODUCTS_SOURCE_TYPE,
    status: 'running',
    attemptToken: '33333333-3333-4333-8333-333333333333',
    idempotencyKey: 'retry-key',
    requestFingerprint: null,
    expiresAt: new Date('2099-08-14T04:00:00.000Z'),
    plan: {
      businessDate: '2026-08-14',
      sourceKeywordFallback: 'any_requested_keyword_for_unassigned_product',
      keywords: ['A Pencil'],
      products: [{ productId: 'wing-1', sourceKeyword: 'A Pencil' }],
    },
    qualityReport: {
      expectedProductCount: 1,
      capturedProductCount: 0,
      failedProductCount: 0,
    },
    importedAt: null,
    createdAt: new Date('2026-08-14T03:00:00.000Z'),
    updatedAt: new Date('2026-08-14T03:00:00.000Z'),
    errorCode: null,
    errorMessage: null,
    rowCount: 1,
  };

  it('creates an immutable server-owned plan and token for the requested keyword scope', async () => {
    const create = vi.fn().mockResolvedValue(attempt);
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      sourceImportRun: {
        findFirst: vi.fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(null),
        create,
      },
      coupangWingTrackedProduct: {
        findMany: vi.fn().mockResolvedValue([
          { productId: 'wing-1', sourceKeyword: 'A Pencil' },
        ]),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const adapter = new WingTrackedProductSourceAttemptRepositoryAdapter(prisma as never, {
      resolveSourceFailure: vi.fn(),
      upsertSourceFailure: vi.fn(),
    } as never);

    await expect(adapter.beginAttempt({
      organizationId: ORGANIZATION_ID,
      idempotencyKey: 'retry-key',
      keywords: ['A Pencil'],
    })).resolves.toMatchObject({
      attemptId: attempt.id,
      attemptToken: attempt.attemptToken,
      businessDate: expect.any(String),
      products: [{ productId: 'wing-1' }],
    });

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        sourceType: WING_TRACKED_PRODUCTS_SOURCE_TYPE,
        status: 'running',
        idempotencyKey: 'retry-key',
        plan: expect.objectContaining({ keywords: ['A Pencil'] }),
      }),
    }));
  });

  it('rejects begin before creating an attempt when an enabled tracker keyword is outside the requested scope', async () => {
    const create = vi.fn();
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      sourceImportRun: {
        findFirst: vi.fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(null),
        create,
      },
      coupangWingTrackedProduct: {
        findMany: vi.fn().mockResolvedValue([
          { productId: 'wing-1', sourceKeyword: 'Required Pencil' },
        ]),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const adapter = new WingTrackedProductSourceAttemptRepositoryAdapter(prisma as never, {
      resolveSourceFailure: vi.fn(),
      upsertSourceFailure: vi.fn(),
    } as never);

    await expect(adapter.beginAttempt({
      organizationId: ORGANIZATION_ID,
      idempotencyKey: 'retry-key',
      keywords: ['Other Pencil'],
    })).rejects.toThrow('WING_TRACKED_KEYWORD_SCOPE_INCOMPLETE');

    expect(create).not.toHaveBeenCalled();
  });

  it('rejects a begin request above the fixed keyword limit before it enters the source transaction', async () => {
    const prisma = { $transaction: vi.fn() };
    const adapter = new WingTrackedProductSourceAttemptRepositoryAdapter(prisma as never, {
      resolveSourceFailure: vi.fn(),
      upsertSourceFailure: vi.fn(),
    } as never);

    await expect(adapter.beginAttempt({
      organizationId: ORGANIZATION_ID,
      idempotencyKey: 'retry-key',
      keywords: Array.from({ length: 13 }, (_, index) => `Keyword ${index}`),
    })).rejects.toThrow('WING_TRACKED_KEYWORD_LIMIT');

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('commits an expired idempotent attempt as failed and replays its terminal state', async () => {
    const expiredAttempt = {
      ...attempt,
      expiresAt: new Date('2000-08-14T04:00:00.000Z'),
    };
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      sourceImportRun: {
        findFirst: vi.fn().mockResolvedValue(expiredAttempt),
        updateMany,
      },
    };
    let committed = false;
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => {
        const result = await callback(tx);
        committed = true;
        return result;
      }),
    };
    const alerts = {
      resolveSourceFailure: vi.fn(),
      upsertSourceFailure: vi.fn().mockResolvedValue(undefined),
    };
    const adapter = new WingTrackedProductSourceAttemptRepositoryAdapter(prisma as never, alerts as never);

    await expect(adapter.beginAttempt({
      organizationId: ORGANIZATION_ID,
      idempotencyKey: 'retry-key',
      keywords: ['A Pencil'],
    })).resolves.toMatchObject({
      attemptId: attempt.id,
      state: 'FAILED',
    });

    expect(committed).toBe(true);
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'failed', errorCode: 'ATTEMPT_EXPIRED' }),
    }));
    expect(alerts.upsertSourceFailure).toHaveBeenCalledWith(tx, expect.objectContaining({
      attemptId: attempt.id,
      href: '/sourcing-ai/product-tracking',
    }));
  });

  it('publishes facts and resolves the source alert in the same owner transaction', async () => {
    const findFirst = vi.fn()
      .mockResolvedValueOnce(attempt)
      .mockResolvedValueOnce({ ...attempt, status: 'completed', importedAt: new Date('2026-08-14T03:15:00.000Z') })
      .mockResolvedValueOnce({ ...attempt, status: 'completed', importedAt: new Date('2026-08-14T03:15:00.000Z') });
    const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
    const createMany = vi.fn().mockResolvedValue({ count: 1 });
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      sourceImportRun: { findFirst, updateMany },
      coupangWingTrackedProduct: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'tracked-1', productId: 'wing-1', sourceKeyword: 'A Pencil' },
        ]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      coupangWingTrackedProductDailySnapshot: { deleteMany, createMany },
    };
    const alerts = {
      resolveSourceFailure: vi.fn().mockResolvedValue(undefined),
      upsertSourceFailure: vi.fn().mockResolvedValue(undefined),
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const adapter = new WingTrackedProductSourceAttemptRepositoryAdapter(prisma as never, alerts as never);

    await expect(adapter.submitAttempt({
      organizationId: ORGANIZATION_ID,
      attemptId: attempt.id,
      attemptToken: attempt.attemptToken,
      items: [{
        productId: 'wing-1',
        sourceKeyword: 'A Pencil',
        salePriceKrw: 1200,
        ratingCount: 3,
        ratingAverage: 4.5,
        pvLast28Day: 10,
        salesLast28d: 2,
        estimatedRevenue28d: 2400,
        conversionRate28d: 0.2,
      }],
    })).resolves.toMatchObject({
      status: 'STALE',
      latestAttempt: { state: 'COMPLETE' },
    });

    expect(deleteMany).toHaveBeenCalledTimes(1);
    expect(createMany).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'completed' }),
    }));
    expect(alerts.resolveSourceFailure).toHaveBeenCalledWith(tx, expect.objectContaining({
      organizationId: ORGANIZATION_ID,
      attemptId: attempt.id,
    }));
  });

  it('rejects a failed frozen product instead of publishing a partial complete snapshot', async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
    const createMany = vi.fn().mockResolvedValue({ count: 1 });
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      sourceImportRun: { findFirst: vi.fn().mockResolvedValue(attempt), updateMany },
      coupangWingTrackedProduct: {
        findMany: vi.fn().mockResolvedValue([{ id: 'tracked-1', productId: 'wing-1' }]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      coupangWingTrackedProductDailySnapshot: { deleteMany, createMany },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const alerts = {
      resolveSourceFailure: vi.fn(),
      upsertSourceFailure: vi.fn(),
    };
    const adapter = new WingTrackedProductSourceAttemptRepositoryAdapter(prisma as never, alerts as never);

    await expect(adapter.submitAttempt({
      organizationId: ORGANIZATION_ID,
      attemptId: attempt.id,
      attemptToken: attempt.attemptToken,
      items: [],
    })).rejects.toThrow('WING_TRACKED_SNAPSHOT_INCOMPLETE');

    expect(deleteMany).not.toHaveBeenCalled();
    expect(createMany).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
    expect(alerts.resolveSourceFailure).not.toHaveBeenCalled();
  });

  it('rejects a product submitted through a different frozen source keyword', async () => {
    const keywordBoundAttempt = {
      ...attempt,
      plan: {
        businessDate: '2026-08-14',
        sourceKeywordFallback: 'any_requested_keyword_for_unassigned_product',
        keywords: ['A Pencil', 'Other Pencil'],
        products: [{ productId: 'wing-1', sourceKeyword: 'A Pencil' }],
      },
    };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      sourceImportRun: {
        findFirst: vi.fn().mockResolvedValue(keywordBoundAttempt),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      coupangWingTrackedProduct: {
        findMany: vi.fn().mockResolvedValue([{ id: 'tracked-1', productId: 'wing-1' }]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      coupangWingTrackedProductDailySnapshot: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const adapter = new WingTrackedProductSourceAttemptRepositoryAdapter(prisma as never, {
      resolveSourceFailure: vi.fn(),
      upsertSourceFailure: vi.fn(),
    } as never);

    await expect(adapter.submitAttempt({
      organizationId: ORGANIZATION_ID,
      attemptId: attempt.id,
      attemptToken: attempt.attemptToken,
      items: [{
        productId: 'wing-1',
        sourceKeyword: 'Other Pencil',
        salePriceKrw: 1200,
        ratingCount: 3,
        ratingAverage: 4.5,
        pvLast28Day: 10,
        salesLast28d: 2,
        estimatedRevenue28d: 2400,
        conversionRate28d: 0.2,
      }],
    })).rejects.toThrow('WING_TRACKED_PRODUCT_KEYWORD_MISMATCH');
  });

  it('allows an unassigned tracker only through a keyword frozen in the owner plan', async () => {
    const fallbackAttempt = {
      ...attempt,
      plan: {
        businessDate: '2026-08-14',
        sourceKeywordFallback: 'any_requested_keyword_for_unassigned_product',
        keywords: ['A Pencil', 'Other Pencil'],
        products: [{ productId: 'wing-1', sourceKeyword: null }],
      },
    };
    const completed = {
      ...fallbackAttempt,
      status: 'completed',
      importedAt: new Date('2026-08-14T03:15:00.000Z'),
    };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      sourceImportRun: {
        findFirst: vi.fn()
          .mockResolvedValueOnce(fallbackAttempt)
          .mockResolvedValueOnce(completed)
          .mockResolvedValueOnce(completed),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      coupangWingTrackedProduct: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'tracked-1', productId: 'wing-1', sourceKeyword: null },
        ]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      coupangWingTrackedProductDailySnapshot: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const adapter = new WingTrackedProductSourceAttemptRepositoryAdapter(prisma as never, {
      resolveSourceFailure: vi.fn(),
      upsertSourceFailure: vi.fn(),
    } as never);

    await expect(adapter.submitAttempt({
      organizationId: ORGANIZATION_ID,
      attemptId: attempt.id,
      attemptToken: attempt.attemptToken,
      items: [{
        productId: 'wing-1',
        sourceKeyword: 'Other Pencil',
        salePriceKrw: 1200,
        ratingCount: 3,
        ratingAverage: 4.5,
        pvLast28Day: 10,
        salesLast28d: 2,
        estimatedRevenue28d: 2400,
        conversionRate28d: 0.2,
      }],
    })).resolves.toMatchObject({ latestAttempt: { state: 'COMPLETE' } });
  });

  it('rejects terminal publication when an enabled tracker was added after its plan froze', async () => {
    const completeAttempt = {
      ...attempt,
      status: 'completed',
      importedAt: new Date('2026-08-14T03:15:00.000Z'),
    };
    const findFirst = vi.fn()
      .mockResolvedValueOnce(attempt)
      .mockResolvedValueOnce(completeAttempt)
      .mockResolvedValueOnce(completeAttempt);
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
    const createMany = vi.fn().mockResolvedValue({ count: 1 });
    const findMany = vi.fn().mockResolvedValue([
      { id: 'tracked-1', productId: 'wing-1', sourceKeyword: 'A Pencil' },
      { id: 'tracked-2', productId: 'wing-2', sourceKeyword: 'Other Pencil' },
    ]);
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      sourceImportRun: { findFirst, updateMany },
      coupangWingTrackedProduct: { findMany, updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      coupangWingTrackedProductDailySnapshot: { deleteMany, createMany },
    };
    const alerts = {
      resolveSourceFailure: vi.fn().mockResolvedValue(undefined),
      upsertSourceFailure: vi.fn().mockResolvedValue(undefined),
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const adapter = new WingTrackedProductSourceAttemptRepositoryAdapter(prisma as never, alerts as never);

    await expect(adapter.submitAttempt({
      organizationId: ORGANIZATION_ID,
      attemptId: attempt.id,
      attemptToken: attempt.attemptToken,
      items: [{
        productId: 'wing-1',
        sourceKeyword: 'A Pencil',
        salePriceKrw: 1200,
        ratingCount: 3,
        ratingAverage: 4.5,
        pvLast28Day: 10,
        salesLast28d: 2,
        estimatedRevenue28d: 2400,
        conversionRate28d: 0.2,
      }],
    })).rejects.toThrow('WING_TRACKED_TARGET_CHANGED');

    expect(deleteMany).not.toHaveBeenCalled();
    expect(createMany).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
    expect(alerts.resolveSourceFailure).not.toHaveBeenCalled();
  });

  it('rejects terminal publication when the owner alert write fails', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      sourceImportRun: {
        findFirst: vi.fn().mockResolvedValue(attempt),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      coupangWingTrackedProduct: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'tracked-1', productId: 'wing-1', sourceKeyword: 'A Pencil' },
        ]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      coupangWingTrackedProductDailySnapshot: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const alerts = {
      resolveSourceFailure: vi.fn().mockRejectedValue(new Error('alert write failed')),
      upsertSourceFailure: vi.fn().mockResolvedValue(undefined),
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const adapter = new WingTrackedProductSourceAttemptRepositoryAdapter(prisma as never, alerts as never);

    await expect(adapter.submitAttempt({
      organizationId: ORGANIZATION_ID,
      attemptId: attempt.id,
      attemptToken: attempt.attemptToken,
      items: [{
        productId: 'wing-1',
        sourceKeyword: 'A Pencil',
        salePriceKrw: 1200,
        ratingCount: 3,
        ratingAverage: 4.5,
        pvLast28Day: 10,
        salesLast28d: 2,
        estimatedRevenue28d: 2400,
        conversionRate28d: 0.2,
      }],
    })).rejects.toThrow('alert write failed');
  });

  it('derives STALE when the current enabled tracker set drifts from the latest complete plan', async () => {
    const businessDate = currentBusinessDate().toISOString().slice(0, 10);
    const completeAttempt = {
      ...attempt,
      status: 'completed',
      importedAt: new Date(),
      plan: {
        ...attempt.plan,
        businessDate,
      },
      qualityReport: {
        expectedProductCount: 1,
        capturedProductCount: 1,
        failedProductCount: 0,
      },
    };
    const findFirst = vi.fn().mockResolvedValueOnce(completeAttempt).mockResolvedValueOnce(completeAttempt);
    const currentTargets = vi.fn().mockResolvedValue([
      { productId: 'wing-1', sourceKeyword: 'changed keyword' },
    ]);
    const tx = {
      sourceImportRun: { findFirst },
      coupangWingTrackedProduct: { findMany: currentTargets },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const adapter = new WingTrackedProductSourceAttemptRepositoryAdapter(prisma as never, {
      resolveSourceFailure: vi.fn(),
      upsertSourceFailure: vi.fn(),
    } as never);

    await expect(adapter.readSourceStatus({ organizationId: ORGANIZATION_ID })).resolves.toMatchObject({
      latestAttempt: { attemptId: attempt.id, state: 'COMPLETE' },
      latestComplete: { sourceImportRunId: attempt.id, businessDate },
      status: 'STALE',
    });

    expect(currentTargets).toHaveBeenCalledWith({
      where: { organizationId: ORGANIZATION_ID, enabled: true },
      orderBy: { productId: 'asc' },
      select: { productId: true, sourceKeyword: true },
    });
  });

  it('keeps a fresh prior complete snapshot READY while a replacement attempt is RUNNING', async () => {
    const businessDate = currentBusinessDate().toISOString().slice(0, 10);
    const completeAttempt = {
      ...attempt,
      status: 'completed',
      importedAt: new Date(),
      plan: { ...attempt.plan, businessDate },
      qualityReport: {
        expectedProductCount: 1,
        capturedProductCount: 1,
        failedProductCount: 0,
      },
    };
    const replacement = {
      ...completeAttempt,
      id: '44444444-4444-4444-8444-444444444444',
      status: 'running',
      importedAt: null,
    };
    const tx = {
      sourceImportRun: {
        findFirst: vi.fn().mockResolvedValueOnce(replacement).mockResolvedValueOnce(completeAttempt),
      },
      coupangWingTrackedProduct: {
        findMany: vi.fn().mockResolvedValue([{ productId: 'wing-1', sourceKeyword: 'A Pencil' }]),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const adapter = new WingTrackedProductSourceAttemptRepositoryAdapter(prisma as never, {
      resolveSourceFailure: vi.fn(),
      upsertSourceFailure: vi.fn(),
    } as never);

    await expect(adapter.readSourceStatus({ organizationId: ORGANIZATION_ID })).resolves.toMatchObject({
      latestAttempt: { attemptId: replacement.id, state: 'RUNNING' },
      latestComplete: { sourceImportRunId: completeAttempt.id, businessDate },
      status: 'READY',
    });
  });
});
