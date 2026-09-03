import { describe, expect, it, vi } from 'vitest';
import { MasterProductContributionRepositoryAdapter } from './master-product-contribution.repository.adapter';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const PRODUCT_A = '00000000-0000-4000-8000-00000000000a';
const SELLPIA_RUN_ID = '10000000-0000-4000-8000-000000000001';
const ADVERTISING_RUN_ID = '20000000-0000-4000-8000-000000000001';

function makeAdapter(rows: readonly Record<string, unknown>[] = []) {
  const queryRaw = vi.fn().mockResolvedValue(rows);
  const Adapter = MasterProductContributionRepositoryAdapter as unknown as new (
    prisma: unknown,
  ) => MasterProductContributionRepositoryAdapter;
  return {
    adapter: new Adapter({ $queryRaw: queryRaw }),
    queryRaw,
  };
}

function rawRow(overrides: Record<string, unknown> = {}) {
  return {
    masterProductId: PRODUCT_A,
    basisFromDate: new Date('2026-07-01T00:00:00.000Z'),
    basisCutoffDate: new Date('2026-07-31T00:00:00.000Z'),
    sourceCutoffDate: new Date('2026-07-31T00:00:00.000Z'),
    sellpiaSourceImportRunId: SELLPIA_RUN_ID,
    advertisingSourceImportRunId: ADVERTISING_RUN_ID,
    sellpiaStatus: 'READY',
    advertisingStatus: 'READY',
    mappingStatus: 'READY',
    revenueTotal: '500',
    positiveOperatingProfitTotal: '180',
    lossMagnitudeTotal: '20',
    netOperatingProfitTotal: '160',
    salesMetricStatus: 'READY',
    salesIncludedProductCount: 2,
    salesExcludedProductCount: 0,
    salesDenominator: '500',
    positiveProfitMetricStatus: 'READY',
    profitIncludedProductCount: 2,
    profitExcludedProductCount: 0,
    positiveProfitDenominator: '180',
    lossMetricStatus: 'READY',
    lossIncludedProductCount: 2,
    lossExcludedProductCount: 0,
    lossDenominator: '20',
    revenue: '100',
    operatingProfit: '80',
    salesContribution: 0.2,
    positiveOperatingProfitContribution: 80 / 180,
    lossImpact: 0,
    salesRank: 2,
    positiveOperatingProfitRank: 2,
    lossRank: null,
    cumulativeSalesContribution: 0.2,
    cumulativePositiveOperatingProfitContribution: 80 / 180,
    cumulativeLossImpact: null,
    salesComplete: true,
    operatingProfitComplete: true,
    ...overrides,
  };
}

const input = {
  organizationId: ORGANIZATION_ID,
  basisFromDate: '2026-07-01',
  basisCutoffDate: '2026-07-31',
  sellpiaSourceImportRunId: SELLPIA_RUN_ID,
  advertisingSourceImportRunId: ADVERTISING_RUN_ID,
} as const;

describe('MasterProductContributionRepositoryAdapter', () => {
  it('maps actual contribution without exposing an ABC dependency', async () => {
    const { adapter, queryRaw } = makeAdapter([rawRow()]);

    const result = await adapter.readContribution({
      ...input,
      masterProductIds: [PRODUCT_A],
    });

    expect(queryRaw).toHaveBeenCalledTimes(1);
    const sql = (queryRaw.mock.calls[0]?.[0] as { strings: readonly string[] }).strings.join(' ');
    expect(sql).not.toMatch(/master_product_abc_(formula|evaluation|grade)/i);
    expect(result).toMatchObject({
      basis: {
        fromDate: '2026-07-01',
        cutoffDate: '2026-07-31',
        sourceStatusSummary: { sellpia: 'READY', advertising: 'READY', mapping: 'READY' },
      },
      totals: {
        revenue: 500,
        positiveOperatingProfit: 180,
        lossMagnitude: 20,
        netOperatingProfit: 160,
      },
      metrics: {
        sales: { status: 'READY', denominator: 500 },
        positiveOperatingProfit: { status: 'READY', denominator: 180 },
        loss: { status: 'READY', denominator: 20 },
      },
      products: [{
        masterProductId: PRODUCT_A,
        revenue: 100,
        operatingProfit: 80,
        salesContribution: 0.2,
      }],
    });
  });

  it('represents a proven zero population without inventing shares or ranks', async () => {
    const { adapter } = makeAdapter([rawRow({
      masterProductId: null,
      revenueTotal: '0',
      positiveOperatingProfitTotal: '0',
      lossMagnitudeTotal: '0',
      netOperatingProfitTotal: '0',
      salesMetricStatus: 'NO_DENOMINATOR',
      salesIncludedProductCount: 0,
      salesDenominator: null,
      positiveProfitMetricStatus: 'NO_DENOMINATOR',
      profitIncludedProductCount: 0,
      positiveProfitDenominator: null,
      lossMetricStatus: 'NO_DENOMINATOR',
      lossIncludedProductCount: 0,
      lossDenominator: null,
    })]);

    const result = await adapter.readContribution(input);

    expect(result.products).toEqual([]);
    expect(result.totals).toEqual({
      revenue: 0,
      positiveOperatingProfit: 0,
      lossMagnitude: 0,
      netOperatingProfit: 0,
    });
    expect(result.metrics.sales).toMatchObject({
      status: 'NO_DENOMINATOR',
      denominator: null,
    });
  });

  it('rejects a monetary aggregate that cannot be represented safely in JSON', async () => {
    const { adapter } = makeAdapter([rawRow({ revenueTotal: '9007199254740992' })]);

    await expect(adapter.readContribution(input)).rejects.toThrow(
      'CONTRIBUTION_AMOUNT_OUT_OF_RANGE',
    );
  });
});
