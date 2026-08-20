import { describe, expect, it, vi } from 'vitest';
import type {
  WingTrackedProductRepositoryPort,
  WingTrackedSnapshotRow,
} from '../../port/out/repository/wing-tracked-product.repository.port';
import { WingTrackedProductService } from '../wing-tracked-product.service';
import type { OperationAttemptVerifierPort } from '../../../../operations/application/port/in/operation-attempt-verifier.port';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const RUN_ID = '22222222-2222-4222-8222-222222222222';
const ATTEMPT_TOKEN = '33333333-3333-4333-8333-333333333333';

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
    upsertByProductId: vi.fn(),
    delete: vi.fn(),
    findById: vi.fn(),
    upsertSnapshotsByProductId: vi.fn(),
    upsertSnapshotsByProductIdInAttempt: vi.fn(),
    findHistory: vi.fn(),
    findBulkHistory: vi.fn(),
  } satisfies Record<keyof WingTrackedProductRepositoryPort, ReturnType<typeof vi.fn>>;
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
    const service = new WingTrackedProductService(repo);

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

describe('WingTrackedProductService.ingestBrowserSnapshots', () => {
  it('validates exact operation input and publishes enabled tracked rows inside the atomic attempt fence', async () => {
    const transaction = {};
    const repo = makeRepository();
    repo.upsertSnapshotsByProductIdInAttempt.mockResolvedValue({ captured: 1, ignored: 1 });
    const attempt = {
      runId: RUN_ID,
      organizationId: ORGANIZATION_ID,
      operationKey: 'advertising.refresh_tracked_wing_products',
      input: {
        keywords: ['A Pencil'],
        maxPages: 2,
        purpose: 'tracked_metrics',
        trackedProductIds: ['wing-1', 'wing-disabled'],
      },
      requestedByUserId: null,
      startedAt: new Date('2026-08-14T00:00:00.000Z'),
      leaseExpiresAt: new Date('2026-08-14T00:01:00.000Z'),
      deadlineAt: new Date('2026-08-14T00:15:00.000Z'),
    };
    const attemptVerifier = {
      verifyActiveBrowserAttempt: vi.fn(),
      withActiveBrowserAttemptFence: vi.fn(async (_input, operation) =>
        operation(attempt, transaction)),
    } as unknown as OperationAttemptVerifierPort;
    const service = new WingTrackedProductService(repo, attemptVerifier);

    await expect(service.ingestBrowserSnapshots({
      organizationId: ORGANIZATION_ID,
      operationRunId: RUN_ID,
      attemptToken: ATTEMPT_TOKEN,
      items: [
        {
          productId: 'wing-1',
          sourceKeyword: 'a pencil',
          salePriceKrw: 12_000,
          ratingCount: 3,
          ratingAverage: 4.5,
          pvLast28Day: 20,
          salesLast28d: 4,
          estimatedRevenue28d: 48_000,
          conversionRate28d: 0.2,
        },
        {
          productId: 'wing-disabled',
          sourceKeyword: 'A Pencil',
          salePriceKrw: null,
          ratingCount: null,
          ratingAverage: null,
          pvLast28Day: null,
          salesLast28d: null,
          estimatedRevenue28d: null,
          conversionRate28d: null,
        },
      ],
    })).resolves.toEqual({ captured: 1, ignored: 1 });

    expect(attemptVerifier.withActiveBrowserAttemptFence).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      runId: RUN_ID,
      expectedOperationKey: 'advertising.refresh_tracked_wing_products',
      attemptToken: ATTEMPT_TOKEN,
    }, expect.any(Function));
    expect(repo.upsertSnapshotsByProductIdInAttempt).toHaveBeenCalledWith(
      transaction,
      expect.arrayContaining([
        expect.objectContaining({ productId: 'wing-1', sourceKeyword: 'a pencil' }),
      ]),
      ORGANIZATION_ID,
    );
    expect(repo.upsertSnapshotsByProductId).not.toHaveBeenCalled();
  });

  it.each([
    ['wrong purpose', { purpose: 'catalog_search' }],
    ['unapproved product', { trackedProductIds: ['other-product'] }],
    ['unapproved keyword', { keywords: ['other keyword'] }],
  ])('rejects %s before owner publication', async (_label, override) => {
    const repo = makeRepository();
    const attempt = {
      runId: RUN_ID,
      organizationId: ORGANIZATION_ID,
      operationKey: 'advertising.refresh_tracked_wing_products',
      input: {
        keywords: ['A Pencil'],
        maxPages: 2,
        purpose: 'tracked_metrics',
        trackedProductIds: ['wing-1'],
        ...override,
      },
      requestedByUserId: null,
      startedAt: new Date(),
      leaseExpiresAt: new Date(Date.now() + 60_000),
      deadlineAt: new Date(Date.now() + 900_000),
    };
    const attemptVerifier = {
      verifyActiveBrowserAttempt: vi.fn(),
      withActiveBrowserAttemptFence: vi.fn(async (_input, operation) =>
        operation(attempt, {})),
    } as unknown as OperationAttemptVerifierPort;
    const service = new WingTrackedProductService(repo, attemptVerifier);

    await expect(service.ingestBrowserSnapshots({
      organizationId: ORGANIZATION_ID,
      operationRunId: RUN_ID,
      attemptToken: ATTEMPT_TOKEN,
      items: [{
        productId: 'wing-1', sourceKeyword: 'A Pencil', salePriceKrw: null,
        ratingCount: null, ratingAverage: null, pvLast28Day: null,
        salesLast28d: null, estimatedRevenue28d: null, conversionRate28d: null,
      }],
    })).rejects.toThrow();
    expect(repo.upsertSnapshotsByProductIdInAttempt).not.toHaveBeenCalled();
  });
});
