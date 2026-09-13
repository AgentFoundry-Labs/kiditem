import { describe, expect, it } from 'vitest';
import { buildPeriodBasis } from './dashboard-basis.js';
import {
  FinanceWindowBasisSchema,
  FinanceWindowTotalsSchema,
  PLDataSchema,
  ProfitLossResponseSchema,
  SalesPlanViewSchema,
  SalesAnalysisDataSchema,
} from '../finance.js';

const basis = buildPeriodBasis({
  from: '2026-04-01',
  to: '2026-04-30',
  includedDates: ['2026-04-01'],
  sources: ['orders'],
});
const requestedWindow = { from: '2026-04-01', to: '2026-04-30' };
const costInput = { lines: 1, notAppliedLines: 0, unmeasuredLines: 0 };
const windowBasis = {
  requestedWindow,
  revenue: basis,
  adCost: basis,
  profit: basis,
  costInputs: { unmappedLines: 0, purchaseCost: costInput, commission: costInput, otherCost: costInput, advertising: costInput },
};
const unavailableTotals = {
  revenue: null,
  orderCount: null,
  cost: null,
  adCost: null,
  netProfit: null,
  profitRate: null,
  adCostRate: null,
  unallocatedAdCost: null,
  adCostGrainDifference: null,
  unallocatedShipping: null,
};

const row = {
  listingId: '11111111-1111-4111-8111-111111111111',
  externalId: 'EXT-1',
  channelName: null,
  masterId: '22222222-2222-4222-8222-222222222222',
  masterCode: 'M-1',
  masterName: '상품',
  category: null,
  grade: null,
  thumbnailUrl: null,
  revenue: 10_000,
  cogs: null,
  commission: null,
  shippingCost: 0,
  adCost: null,
  otherCost: null,
  netProfit: null,
  profitRate: null,
  orderCount: 1,
  returnCount: 0,
};

describe('finance window contract', () => {
  it('carries an unrecorded cost as null rather than a number', () => {
    expect(PLDataSchema.parse(row)).toMatchObject({ cogs: null, commission: null, otherCost: null });
  });

  it('requires the evidence behind the month totals', () => {
    const response = { period: '2026-04', rows: [row], totals: unavailableTotals };

    expect(ProfitLossResponseSchema.safeParse(response).success).toBe(false);
    expect(ProfitLossResponseSchema.safeParse({ ...response, basis: windowBasis }).success).toBe(true);
  });

  it('rejects a derived status word on the basis', () => {
    expect(ProfitLossResponseSchema.safeParse({
      period: '2026-04',
      rows: [],
      totals: unavailableTotals,
      basis: { ...windowBasis, status: 'partial' },
    }).success).toBe(false);
  });

  it('lets a channel publish no profit, cost or ratio', () => {
    expect(SalesAnalysisDataSchema.safeParse({
      period: '2026-04',
      channels: [{
        channel: 'coupang',
        channelType: 'marketplace',
        totalOrders: 1,
        totalRevenue: 0,
        totalCost: null,
        totalProfit: null,
        profitRate: null,
        returnCount: 0,
        returnRate: null,
        avgOrderValue: null,
      }],
      totals: {
        totalRevenue: null,
        totalProfit: null,
        totalOrders: null,
        totalCost: null,
        profitRate: null,
        orphanReturnCount: 0,
      },
      basis: windowBasis,
    }).success).toBe(true);
  });

  it('lets returns publish no count, rate or orphan count while nothing collects them', () => {
    expect(PLDataSchema.parse({ ...row, returnCount: null }).returnCount).toBeNull();
    expect(SalesAnalysisDataSchema.safeParse({
      period: '2026-04',
      channels: [{
        channel: 'coupang',
        channelType: 'marketplace',
        totalOrders: 1,
        totalRevenue: 10_000,
        totalCost: null,
        totalProfit: null,
        profitRate: null,
        returnCount: null,
        returnRate: null,
        avgOrderValue: 10_000,
      }],
      totals: {
        totalRevenue: 10_000,
        totalProfit: null,
        totalOrders: 1,
        totalCost: null,
        profitRate: null,
        orphanReturnCount: null,
      },
      basis: windowBasis,
    }).success).toBe(true);
  });

  it('publishes plan actuals with an observation time instead of stored defaults', () => {
    const plan = {
      id: '33333333-3333-4333-8333-333333333333',
      period: '2026-04',
      targetRevenue: 1,
      targetOrders: 1,
      targetProfit: 1,
      notes: null,
      achievement: { revenue: null, orders: null, profit: null },
    };

    expect(SalesPlanViewSchema.safeParse({
      ...plan,
      actuals: { revenue: null, orderCount: null, netProfit: null, observedAt: null, basis: windowBasis },
    }).success).toBe(true);
    expect(SalesPlanViewSchema.safeParse({
      ...plan,
      actualRevenue: 0,
      actualOrders: 0,
      actualProfit: 0,
    }).success).toBe(false);
  });
});

describe('FinanceWindowBasisSchema cost inputs (KID-114)', () => {
  const component = (lines: number, notAppliedLines: number, unmeasuredLines: number) =>
    ({ lines, notAppliedLines, unmeasuredLines });

  it('carries, per cost component, the lines it does not apply to and the lines nobody measured', () => {
    const basis = FinanceWindowBasisSchema.parse({
      ...windowBasis,
      costInputs: {
        unmappedLines: 1,
        purchaseCost: component(3, 0, 1),
        commission: component(3, 2, 1),
        otherCost: component(3, 2, 1),
        advertising: component(3, 3, 0),
      },
    });
    expect(basis.costInputs.commission).toEqual({ lines: 3, notAppliedLines: 2, unmeasuredLines: 1 });
  });

  it('counts the lines sold under no listing option apart from the components, which count lines with a product row', () => {
    const costInputs = {
      purchaseCost: component(2, 0, 1),
      commission: component(2, 0, 0),
      otherCost: component(2, 0, 0),
      advertising: component(2, 0, 0),
    };
    expect(FinanceWindowBasisSchema.parse({ ...windowBasis, costInputs: { ...costInputs, unmappedLines: 1 } })
      .costInputs.unmappedLines).toBe(1);
    expect(FinanceWindowBasisSchema.safeParse({ ...windowBasis, costInputs }).success).toBe(false);
  });

  it('rejects a negative line count', () => {
    expect(FinanceWindowBasisSchema.safeParse({
      ...windowBasis,
      costInputs: {
        unmappedLines: 0,
        purchaseCost: component(1, 0, -1),
        commission: component(1, 0, 0),
        otherCost: component(1, 0, 0),
        advertising: component(1, 0, 0),
      },
    }).success).toBe(false);
  });
});

describe('values the server publishes so the browser does no finance arithmetic (P3-2, P3-13)', () => {
  it('carries the ad cost share and the totals no product row carries', () => {
    expect(FinanceWindowTotalsSchema.parse({
      revenue: 20_000,
      orderCount: 1,
      cost: 11_500,
      adCost: 3_000,
      netProfit: 8_500,
      profitRate: 42.5,
      adCostRate: 15,
      unallocatedAdCost: 1_000,
      adCostGrainDifference: -200,
      unallocatedShipping: 500,
    })).toMatchObject({ adCostRate: 15, unallocatedAdCost: 1_000, adCostGrainDifference: -200, unallocatedShipping: 500 });
  });

  it('requires the advertising grain difference beside the parts no product row carries', () => {
    const { adCostGrainDifference: _omitted, ...withoutGrain } = unavailableTotals;
    expect(FinanceWindowTotalsSchema.safeParse(withoutGrain).success).toBe(false);
  });

  it('carries each plan target achievement as a published rate', () => {
    const parsed = SalesPlanViewSchema.parse({
      id: '11111111-1111-4111-8111-111111111111',
      period: '2026-04',
      targetRevenue: 100_000,
      targetOrders: 0,
      targetProfit: 10_000,
      notes: null,
      actuals: null,
      achievement: { revenue: null, orders: null, profit: null },
    });
    expect(parsed.achievement).toEqual({ revenue: null, orders: null, profit: null });
  });
});
