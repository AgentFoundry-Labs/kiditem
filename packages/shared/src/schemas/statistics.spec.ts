import { describe, expect, it } from 'vitest';
import { buildPeriodBasis } from './dashboard-basis.js';
import {
  StatisticsOverviewSchema,
  StatisticsParetoResponseSchema,
  StatisticsProductsResponseSchema,
  StatisticsRepurchaseResponseSchema,
} from './statistics.js';

const ordersBasis = buildPeriodBasis({
  from: '2026-04-01',
  to: '2026-04-30',
  includedDates: ['2026-04-01'],
  sources: ['orders'],
});
const windowBasis = { revenue: ordersBasis, adCost: ordersBasis, profit: ordersBasis };

describe('StatisticsParetoResponseSchema', () => {
  it('models revenue bands without a second product ABC comparison', () => {
    const parsed = StatisticsParetoResponseSchema.parse({
      totalRevenue: 1_000,
      bandDistribution: { top70: 1, next20: 1, tail10: 1 },
      data: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          rank: 1,
          name: '상품 A',
          paretoBand: 'top70',
          revenue: 700,
          revenuePercent: 70,
          cumulativePercent: 70,
        },
      ],
      basis: windowBasis,
    });

    expect(parsed.data[0].paretoBand).toBe('top70');
    expect(parsed.data[0]).not.toHaveProperty('currentGrade');
    expect(parsed.data[0]).not.toHaveProperty('suggestedGrade');
    expect(parsed).not.toHaveProperty('mismatchCount');
  });

  it('carries shares of an unavailable or zero total as null, never as 0', () => {
    const parsed = StatisticsParetoResponseSchema.parse({
      totalRevenue: null,
      bandDistribution: null,
      data: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          rank: 1,
          name: '상품 A',
          paretoBand: null,
          revenue: 700,
          revenuePercent: null,
          cumulativePercent: null,
        },
      ],
      basis: windowBasis,
    });

    expect(parsed.data[0]).toMatchObject({ revenuePercent: null, cumulativePercent: null, paretoBand: null });
  });
});

describe('StatisticsOverviewSchema', () => {
  it('publishes unmeasured window totals as null beside the basis they rest on', () => {
    expect(StatisticsOverviewSchema.parse({
      totalRevenue: null,
      totalOrders: null,
      totalProfit: null,
      avgMargin: null,
      totalProducts: 2,
      basis: windowBasis,
    })).toMatchObject({ totalRevenue: null, totalOrders: null });
  });

  it('rejects a derived status word travelling beside the basis facts', () => {
    expect(StatisticsOverviewSchema.safeParse({
      totalRevenue: 1,
      totalOrders: 1,
      totalProfit: 1,
      avgMargin: 1,
      totalProducts: 1,
      basis: { ...windowBasis, revenue: { ...ordersBasis, status: 'partial' } },
    }).success).toBe(false);
  });
});

describe('StatisticsProductsResponseSchema', () => {
  it('wraps product rows with their basis', () => {
    expect(StatisticsProductsResponseSchema.safeParse({ rows: [], basis: null }).success).toBe(true);
    expect(StatisticsProductsResponseSchema.safeParse([]).success).toBe(false);
  });
});

describe('StatisticsRepurchaseResponseSchema', () => {
  const customer = {
    name: '홍길동',
    count: 2,
    totalAmount: 30000,
    lastOrder: '2026-04-15T00:00:00.000Z',
  };

  it('accepts ISO string lastOrder values from JSON responses', () => {
    expect(
      StatisticsRepurchaseResponseSchema.safeParse({
        totalCustomers: 1,
        repeatCount: 1,
        repurchaseRate: 1,
        totalOrders: 2,
        repeatProducts: [],
        repeatCustomers: [customer],
        basis: { orders: ordersBasis },
      }).success,
    ).toBe(true);
  });

  it('still accepts Date objects on the server side', () => {
    expect(
      StatisticsRepurchaseResponseSchema.safeParse({
        totalCustomers: 1,
        repeatCount: 1,
        repurchaseRate: 1,
        totalOrders: 2,
        repeatProducts: [],
        repeatCustomers: [{ ...customer, lastOrder: new Date('2026-04-15T00:00:00.000Z') }],
        basis: { orders: ordersBasis },
      }).success,
    ).toBe(true);
  });

  it('carries a rate over no customers as null', () => {
    expect(StatisticsRepurchaseResponseSchema.parse({
      totalCustomers: 0,
      repeatCount: 0,
      repurchaseRate: null,
      totalOrders: 0,
      repeatProducts: [],
      repeatCustomers: [],
      basis: { orders: ordersBasis },
    }).repurchaseRate).toBeNull();
  });
});
