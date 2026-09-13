import { describe, expect, it } from 'vitest';
import { SettlementListResponseSchema } from './settlements.js';

describe('SettlementListResponseSchema (P3-13)', () => {
  it('carries the settlement card totals the server summed, beside the rows', () => {
    const parsed = SettlementListResponseSchema.parse({
      items: [],
      summary: {
        totalExpected: 3_000,
        totalConfirmedActual: 1_500,
        totalConfirmedDifference: -500,
        pendingCount: 1,
      },
    });
    expect(parsed.summary).toEqual({
      totalExpected: 3_000,
      totalConfirmedActual: 1_500,
      totalConfirmedDifference: -500,
      pendingCount: 1,
    });
  });

  it('rejects the bare array the list used to return', () => {
    expect(SettlementListResponseSchema.safeParse([]).success).toBe(false);
  });
});
