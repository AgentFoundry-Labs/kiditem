import { describe, expect, it, vi } from 'vitest';
import { DashboardFindingsSchema } from '@kiditem/shared/dashboard';
import { buildDashboardContext } from '../../domain/context';
import { DashboardFindingsService } from './dashboard-findings.service';
import type { SellpiaProductSalesSummary } from '@kiditem/shared/dashboard';

// 2026-09-18 12:00 KST — the month that just closed is August.
const ctx = buildDashboardContext(undefined, undefined, undefined, new Date('2026-09-18T03:00:00.000Z'));

function emptySummary(overrides: Partial<SellpiaProductSalesSummary> = {}): SellpiaProductSalesSummary {
  return {
    range: { from: '2025-09', to: '2026-09' },
    months: [],
    completeMonths: [],
    products: [],
    productCount: 0,
    totalQty: 0,
    lastCapturedAt: null,
    hasData: false,
    hasStock: false,
    stockCapturedAt: null,
    stockGeneration: null,
    inventoryResolutionCounts: { matchedSalesRows: 0, mappingRequiredSalesRows: 0, matchedSkus: 0, unlinkedSkus: 0 },
    reorderCount: 0,
    deadStockCount: 0,
    anomalyCount: 0,
    abcCounts: { A: 0, B: 0, C: 0 },
    abcStatusCounts: { READY: 0, INSUFFICIENT_EVIDENCE: 0, SOURCE_UNMAPPED: 0, SELLPIA_SOURCE_STALE: 0, AD_SOURCE_STALE: 0 },
    abcContributionProfitByGrade: { A: 0, B: 0, C: 0 },
    classifiedProductCount: 0,
    unclassifiedProductCount: 0,
    leadTimeMonths: 1,
    ...overrides,
  };
}

function service(
  summary: SellpiaProductSalesSummary,
  rejected = [{ channel: 'coupang', mallName: '쿠팡(마켓플레이스)', count: 12 }],
) {
  const productSales = { getSummary: vi.fn().mockResolvedValue(summary) };
  const repository = { readRejectedListings: vi.fn().mockResolvedValue(rejected) };
  return { findings: new DashboardFindingsService(productSales, repository), productSales, repository };
}

describe('DashboardFindingsService', () => {
  it('reads both owners for the organization and publishes a payload the shared schema accepts', async () => {
    const { findings, productSales, repository } = service(emptySummary());

    const result = await findings.getFindings(ctx, 'org-1');

    expect(productSales.getSummary).toHaveBeenCalledWith('org-1');
    expect(repository.readRejectedListings).toHaveBeenCalledWith('org-1');
    expect(DashboardFindingsSchema.parse(result)).toEqual(result);
  });

  it('keeps depletion findings unknown when Sellpia product sales were never collected', async () => {
    const { findings } = service(emptySummary());

    const result = await findings.getFindings(ctx, 'org-1');

    expect(result.productSalesCapturedAt).toBeNull();
    expect(result.salesDecline.count).toBeNull();
    expect(result.reorderSuggestions).toBeNull();
  });

  it('says the decline verdict is stale when the last complete month is not the one that just closed', async () => {
    const { findings } = service(emptySummary({
      hasData: true,
      lastCapturedAt: '2026-09-17T14:00:00.000Z',
      completeMonths: ['2026-06', '2026-07'],
      months: ['2026-06', '2026-07', '2026-08'],
    }));

    const result = await findings.getFindings(ctx, 'org-1');

    expect(result.salesDecline.month).toBe('2026-07');
    expect(result.metricBasis?.['salesDecline.count']).toMatchObject({
      kind: 'snapshot',
      measured: true,
      asOf: '2026-07-31',
      requiredAsOf: '2026-08-31',
      sources: ['sellpia_product_sales'],
    });
    expect(result.metricBasis?.reorderSuggestions).toMatchObject({ measured: false });
  });

  it('counts rejected listings across channels', async () => {
    const { findings } = service(emptySummary(), [
      { channel: 'coupang', mallName: '쿠팡(마켓플레이스)', count: 12 },
      { channel: 'kidkids', mallName: '키드키즈', count: 3 },
    ]);

    const result = await findings.getFindings(ctx, 'org-1');

    expect(result.registrationFailures).toEqual({
      count: 15,
      byChannel: [
        { channel: 'coupang', mallName: '쿠팡(마켓플레이스)', count: 12 },
        { channel: 'kidkids', mallName: '키드키즈', count: 3 },
      ],
    });
  });
});
