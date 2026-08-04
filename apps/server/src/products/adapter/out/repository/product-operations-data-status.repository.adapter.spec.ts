import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductOperationsDataStatusRepositoryAdapter } from './product-operations-data-status.repository.adapter';

describe('ProductOperationsDataStatusRepositoryAdapter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-02T00:00:00.000Z'));
  });

  afterEach(() => vi.useRealTimers());

  it('returns one conservative display date and groups only unclassified ABC blockers', async () => {
    const prisma = {
      channelListingDailySnapshot: {
        aggregate: vi.fn()
          .mockResolvedValueOnce({
            _min: { businessDate: new Date('2026-07-01T00:00:00.000Z') },
            _max: {
              businessDate: new Date('2026-07-30T00:00:00.000Z'),
              trafficObservedAt: new Date('2026-07-31T00:00:00.000Z'),
              lastObservedAt: new Date('2026-07-31T00:00:00.000Z'),
            },
          })
          .mockResolvedValueOnce({
            _min: { businessDate: new Date('2026-07-01T00:00:00.000Z') },
            _max: {
              businessDate: new Date('2026-08-01T00:00:00.000Z'),
              adObservedAt: new Date('2026-08-02T00:00:00.000Z'),
              lastObservedAt: new Date('2026-08-02T00:00:00.000Z'),
            },
          }),
      },
      sellpiaProductMonthlySales: {
        aggregate: vi.fn().mockResolvedValue({
          _max: {
            coverageEndDate: new Date('2026-08-01T00:00:00.000Z'),
            capturedAt: new Date('2026-08-02T00:00:00.000Z'),
          },
        }),
      },
      masterProduct: {
        findMany: vi.fn().mockResolvedValue([
          product('A', 'READY', '2026-08-01'),
          product(null, 'SOURCE_UNMAPPED', '2026-07-30'),
          product(null, 'ORDERS_SOURCE_STALE', '2026-08-01'),
          product('B', 'ORDERS_SOURCE_STALE', '2026-08-01'),
        ]),
      },
    };
    const Adapter = ProductOperationsDataStatusRepositoryAdapter as unknown as new (
      prisma: unknown,
    ) => ProductOperationsDataStatusRepositoryAdapter;
    const adapter = new Adapter(prisma);

    await expect(adapter.read('00000000-0000-4000-8000-000000000001', 30))
      .resolves.toMatchObject({
        displayDataAsOf: '2026-07-30',
        sources: {
          traffic: { status: 'OUTDATED', coverageEndDate: '2026-07-30' },
          advertising: { status: 'CURRENT', coverageEndDate: '2026-08-01' },
          sellpiaProfit: { status: 'CURRENT', coverageEndDate: '2026-08-01' },
          abc: { status: 'OUTDATED', coverageEndDate: '2026-07-30' },
        },
        abcSummary: {
          classifiedProductCount: 2,
          unclassifiedProductCount: 2,
          mappingRequiredProductCount: 1,
          orderEvidenceRequiredProductCount: 0,
          otherPendingProductCount: 1,
        },
      });
  });
});

function product(
  abcGrade: 'A' | 'B' | null,
  calculationStatus: string,
  cutoff: string,
) {
  return {
    abcGrade,
    abcEvaluation: {
      calculationStatus,
      evaluationCutoffDate: new Date(`${cutoff}T00:00:00.000Z`),
      sourceCoverageEndDate: new Date(`${cutoff}T00:00:00.000Z`),
      calculatedAt: new Date('2026-08-02T00:00:00.000Z'),
    },
  };
}
