import { describe, expect, it } from 'vitest';
import {
  StatisticsParetoResponseSchema,
  StatisticsRepurchaseResponseSchema,
} from './statistics.js';

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
    });

    expect(parsed.data[0].paretoBand).toBe('top70');
    expect(parsed.data[0]).not.toHaveProperty('currentGrade');
    expect(parsed.data[0]).not.toHaveProperty('suggestedGrade');
    expect(parsed).not.toHaveProperty('mismatchCount');
  });
});

describe('StatisticsRepurchaseResponseSchema', () => {
  it('accepts ISO string lastOrder values from JSON responses', () => {
    expect(
      StatisticsRepurchaseResponseSchema.safeParse({
        totalCustomers: 1,
        repeatCount: 1,
        repurchaseRate: 1,
        totalOrders: 2,
        repeatProducts: [],
        repeatCustomers: [
          {
            name: '홍길동',
            count: 2,
            totalAmount: 30000,
            lastOrder: '2026-04-15T00:00:00.000Z',
          },
        ],
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
        repeatCustomers: [
          {
            name: '홍길동',
            count: 2,
            totalAmount: 30000,
            lastOrder: new Date('2026-04-15T00:00:00.000Z'),
          },
        ],
      }).success,
    ).toBe(true);
  });
});
