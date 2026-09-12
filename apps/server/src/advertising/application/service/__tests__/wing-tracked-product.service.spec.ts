import { describe, expect, it, vi } from 'vitest';
import type {
  WingTrackedProductAttemptPlan,
  WingTrackedProductRepositoryPort,
  WingTrackedProductSourceView,
  WingTrackedSnapshotRow,
} from '../../port/out/repository/wing-tracked-product.repository.port';
import type { WingTrackedProductSourceAttemptRepositoryPort } from '../../port/out/repository/wing-tracked-product-source-attempt.repository.port';
import { WingTrackedProductService } from '../wing-tracked-product.service';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';

function point(trackedProductId: string): WingTrackedSnapshotRow {
  return {
    trackedProductId,
    businessDate: new Date('2026-08-14T00:00:00.000Z'),
    salePriceKrw: 12_000,
    ratingCount: 8,
    ratingAverage: 4.5,
    pvLast28Day: 200,
    salesLast28d: 12,
    estimatedRevenue28d: 144_000,
    conversionRate28d: 0.06,
    capturedAt: new Date('2026-08-14T03:00:00.000Z'),
  };
}

function makeRepository() {
  return {
    list: vi.fn(),
    registerWithInitialSnapshot: vi.fn(),
    delete: vi.fn(),
    findById: vi.fn(),
    findHistory: vi.fn(),
    findBulkHistory: vi.fn(),
  } satisfies Record<keyof WingTrackedProductRepositoryPort, ReturnType<typeof vi.fn>>;
}

function makeAttemptRepository() {
  return {
    beginAttempt: vi.fn(),
    readAttemptControl: vi.fn(),
    readSourceStatus: vi.fn(),
    submitAttempt: vi.fn(),
    failAttempt: vi.fn(),
  } satisfies Record<keyof WingTrackedProductSourceAttemptRepositoryPort, ReturnType<typeof vi.fn>>;
}

describe('WingTrackedProductService.getBulkHistory', () => {
  it('uses one repository call scoped only by the authenticated organization and days', async () => {
    const repo = makeRepository();
    repo.findBulkHistory.mockResolvedValue([
      {
        trackedProductId: '22222222-2222-4222-8222-222222222222',
        productName: '조직 상품',
        points: [point('22222222-2222-4222-8222-222222222222')],
      },
    ]);
    const service = new WingTrackedProductService(repo, makeAttemptRepository());

    await expect(service.getBulkHistory(30, ORGANIZATION_ID)).resolves.toEqual({
      items: [
        {
          trackedProductId: '22222222-2222-4222-8222-222222222222',
          productName: '조직 상품',
          points: [point('22222222-2222-4222-8222-222222222222')],
        },
      ],
    });

    expect(repo.findBulkHistory).toHaveBeenCalledTimes(1);
    expect(repo.findBulkHistory).toHaveBeenCalledWith(ORGANIZATION_ID, 30);
    expect(repo.list).not.toHaveBeenCalled();
    expect(repo.findById).not.toHaveBeenCalled();
    expect(repo.findHistory).not.toHaveBeenCalled();
  });
});

describe('WingTrackedProductService source owner', () => {
  const plan: WingTrackedProductAttemptPlan = {
    attemptId: '22222222-2222-4222-8222-222222222222',
    attemptToken: '33333333-3333-4333-8333-333333333333',
    state: 'RUNNING',
    expiresAt: '2026-08-14T04:00:00.000Z',
    businessDate: '2026-08-14',
    sourceKeywordFallback: 'any_requested_keyword_for_unassigned_product',
    keywords: ['a pencil'],
    products: [{ productId: 'wing-1', sourceKeyword: 'a pencil' }],
  };
  const sourceView: WingTrackedProductSourceView = {
    latestAttempt: {
      attemptId: plan.attemptId,
      state: 'COMPLETE',
      startedAt: '2026-08-14T03:00:00.000Z',
      capturedAt: '2026-08-14T03:15:00.000Z',
      expiresAt: plan.expiresAt,
      errorCode: null,
      errorMessage: null,
    },
    latestComplete: {
      sourceImportRunId: plan.attemptId,
      businessDate: plan.businessDate,
      capturedAt: '2026-08-14T03:15:00.000Z',
      expectedProductCount: 1,
      capturedProductCount: 1,
      failedProductCount: 0,
    },
    ready: true,
  };

  it('starts an owner attempt with normalized keyword scope and idempotency', async () => {
    const repo = makeRepository();
    const attempts = makeAttemptRepository();
    attempts.beginAttempt.mockResolvedValue(plan);
    const service = new WingTrackedProductService(repo, attempts);

    await expect(service.beginAttempt({
      organizationId: ORGANIZATION_ID,
      idempotencyKey: '  retry-key ',
      keywords: ['  A   Pencil '],
    })).resolves.toEqual(plan);

    expect(attempts.beginAttempt).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      idempotencyKey: 'retry-key',
      keywords: ['A Pencil'],
    });
  });

  it('registers the tracker and its initial snapshot through one atomic owner operation', async () => {
    const repo = makeRepository();
    const tracker = {
      id: '22222222-2222-4222-8222-222222222222',
      organizationId: ORGANIZATION_ID,
      productId: 'wing-1',
      itemId: null,
      vendorItemId: null,
      productName: 'Wing product',
      imagePath: null,
      brandName: null,
      categoryHierarchy: null,
      sourceKeyword: 'A Pencil',
      enabled: true,
      lastCapturedAt: new Date('2026-08-14T03:00:00.000Z'),
      createdAt: new Date('2026-08-14T03:00:00.000Z'),
      updatedAt: new Date('2026-08-14T03:00:00.000Z'),
    };
    repo.registerWithInitialSnapshot.mockResolvedValue(tracker);
    repo.list.mockResolvedValue([{ ...tracker, latestSnapshot: point(tracker.id) }]);
    const service = new WingTrackedProductService(repo, makeAttemptRepository());

    await expect(service.addTracker({
      productId: 'wing-1',
      productName: 'Wing product',
      sourceKeyword: 'A Pencil',
      salePriceKrw: 12_000,
      ratingCount: 8,
      ratingAverage: 4.5,
      pvLast28Day: 200,
      salesLast28d: 12,
      estimatedRevenue28d: 144_000,
      conversionRate28d: 0.06,
    }, ORGANIZATION_ID)).resolves.toMatchObject({
      id: tracker.id,
      latestSnapshot: { salePriceKrw: 12_000 },
    });

    expect(repo.registerWithInitialSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      productId: 'wing-1',
      sourceKeyword: 'A Pencil',
      salePriceKrw: 12_000,
    }), ORGANIZATION_ID);
  });

  it('submits a complete frozen owner snapshot through one fenced call', async () => {
    const repo = makeRepository();
    const attempts = makeAttemptRepository();
    attempts.submitAttempt.mockResolvedValue(sourceView);
    const service = new WingTrackedProductService(repo, attempts);

    await expect(service.submitAttempt({
      organizationId: ORGANIZATION_ID,
      attemptId: plan.attemptId,
      attemptToken: plan.attemptToken,
      items: [{
        productId: 'wing-1',
        sourceKeyword: 'a pencil',
        salePriceKrw: 12_000,
        ratingCount: 3,
        ratingAverage: 4.5,
        pvLast28Day: 20,
        salesLast28d: 4,
        estimatedRevenue28d: 48_000,
        conversionRate28d: 0.2,
      }],
    })).resolves.toEqual(sourceView);

    expect(attempts.submitAttempt).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      attemptId: plan.attemptId,
      attemptToken: plan.attemptToken,
      items: [expect.objectContaining({ productId: 'wing-1' })],
    });
  });

  it('keeps exact attempt control and failure commands organization-scoped', async () => {
    const repo = makeRepository();
    const attempts = makeAttemptRepository();
    attempts.readAttemptControl.mockResolvedValue(plan);
    attempts.failAttempt.mockResolvedValue(sourceView);
    const service = new WingTrackedProductService(repo, attempts);

    await expect(service.readAttemptControl({
      organizationId: ORGANIZATION_ID,
      attemptId: plan.attemptId,
    })).resolves.toEqual(plan);
    await expect(service.failAttempt({
      organizationId: ORGANIZATION_ID,
      attemptId: plan.attemptId,
      attemptToken: plan.attemptToken,
      code: ' LOGIN_REQUIRED ',
      message: ' Sign in to Coupang ',
    })).resolves.toEqual(sourceView);

    expect(attempts.readAttemptControl).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      attemptId: plan.attemptId,
    });
    expect(attempts.failAttempt).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      attemptId: plan.attemptId,
      attemptToken: plan.attemptToken,
      code: 'LOGIN_REQUIRED',
      message: 'Sign in to Coupang',
    });
  });
});
