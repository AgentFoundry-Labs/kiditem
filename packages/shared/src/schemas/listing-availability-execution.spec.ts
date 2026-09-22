import { describe, expect, it } from 'vitest';
import { ReportListingAvailabilityInputSchema } from './listing-availability-execution';

const report = {
  leaseToken: '11111111-1111-4111-8111-111111111111', payloadHash: 'frozen',
  outcome: 'confirmed', evidence: {
    channelAccountId: '22222222-2222-4222-8222-222222222222',
    externalListingId: '123', providerAccountId: 'vendor',
    observedOptionStocks: [{ externalOptionId: '456', stock: 0, registrationType: 'NORMAL' }],
  },
};

describe('listing availability observation evidence', () => {
  it('accepts actual option reread evidence without a common option identity', () => {
    expect(ReportListingAvailabilityInputSchema.parse(report).evidence.observedOptionStocks).toEqual(report.evidence.observedOptionStocks);
  });
  it.each([null, -1, 0.5])('rejects unknown or invalid observed stock %s', (stock) => {
    expect(ReportListingAvailabilityInputSchema.safeParse({ ...report, evidence: {
      ...report.evidence, observedOptionStocks: [{ ...report.evidence.observedOptionStocks[0], stock }],
    } }).success).toBe(false);
  });
  it('does not admit Rocket Growth as normal-option confirmation', () => {
    expect(ReportListingAvailabilityInputSchema.safeParse({ ...report, evidence: {
      ...report.evidence, observedOptionStocks: [{ ...report.evidence.observedOptionStocks[0], registrationType: 'RFM' }],
    } }).success).toBe(false);
  });
});
