import { describe, expect, it } from 'vitest';
import type { OrderLineWindowFacts } from '../../orders/application/port/in/facts/order-facts.port';
import { FactConflictError } from '../errors/fact-errors';
import { buildPerListingProfit } from '../per-listing-profit';

/** Order facts Orders answered for the KST business dates 2026-04-01..2026-04-02. */
const aprilFirstTwoDays: OrderLineWindowFacts = {
  window: {
    revenue: 0,
    orderCount: 0,
    quantity: 0,
    observedAt: null,
    observedTotals: null,
    requestedDates: ['2026-04-01', '2026-04-02'],
    includedDates: ['2026-04-01', '2026-04-02'],
    missingDates: [],
    sourceCoverage: [],
  },
  orders: [],
};

const noReads = new Proxy({}, {
  get: () => { throw new Error('a mismatched window must be refused before any owner read'); },
});

describe('per-listing profit order facts', () => {
  it('refuses order facts read over a different window than the one it computes', async () => {
    await expect(buildPerListingProfit(
      {} as never,
      'organization-1',
      new Date('2026-03-31T15:00:00.000Z'),
      new Date('2026-04-03T15:00:00.000Z'),
      { hasAdAccount: false, publishedDates: 0, accountSpend: 0, accountBilledSpend: 0, accountAdjustment: 0, coversWindow: false },
      aprilFirstTwoDays,
      noReads as never,
      noReads as never,
    )).rejects.toBeInstanceOf(FactConflictError);
  });
});
