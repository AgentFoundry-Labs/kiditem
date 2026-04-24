import { describe, expect, it } from 'vitest';
import { StatisticsRepurchaseResponseSchema } from './statistics.js';

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
