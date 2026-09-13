import { describe, expect, it } from 'vitest';
import { buildPeriodBasis } from './dashboard-basis.js';
import {
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
const windowBasis = { revenue: basis, adCost: basis, profit: basis };
const unavailableTotals = {
  revenue: null,
  orderCount: null,
  cost: null,
  adCost: null,
  netProfit: null,
  profitRate: null,
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

  it('publishes plan actuals with an observation time instead of stored defaults', () => {
    const plan = {
      id: '33333333-3333-4333-8333-333333333333',
      period: '2026-04',
      targetRevenue: 1,
      targetOrders: 1,
      targetProfit: 1,
      notes: null,
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
