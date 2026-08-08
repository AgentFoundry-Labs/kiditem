import { describe, expect, it } from 'vitest';
import {
  SourcingReadEnvelopeSchema,
  SourcingRecommendationItemSchema,
  SourcingReviewSelectionCommandSchema,
} from './workspace';

describe('sourcing workspace contracts', () => {
  it('keeps unavailable distinct from a successful empty result', () => {
    expect(() =>
      SourcingReadEnvelopeSchema.parse({
        status: 'unavailable',
        generatedAt: '2026-08-08T00:00:00.000Z',
        lastSuccessfulAt: null,
        freshUntil: null,
        operationId: null,
        data: [],
        warnings: [],
        error: {
          code: 'SOURCE_DISABLED',
          retryable: false,
          message: 'disabled',
        },
      }),
    ).toThrow();

    expect(
      SourcingReadEnvelopeSchema.parse({
        status: 'ready',
        generatedAt: '2026-08-08T00:00:00.000Z',
        lastSuccessfulAt: '2026-08-08T00:00:00.000Z',
        freshUntil: '2026-08-08T01:00:00.000Z',
        operationId: null,
        data: [],
        warnings: [],
        error: null,
      }).status,
    ).toBe('ready');
  });

  it('requires stable offer identity and optimistic selection version', () => {
    expect(() =>
      SourcingRecommendationItemSchema.parse({
        itemKey: 'array-index-0',
        sourcePlatform: '1688',
        externalOfferId: '',
        variantKey: '',
        rank: 1,
        score: 90,
        grade: 'A',
        baselineAction: 'order',
        reasonCodes: [],
        riskCodes: [],
      }),
    ).toThrow();

    expect(() =>
      SourcingReviewSelectionCommandSchema.parse({
        workspaceKey: 'entry',
        recommendationRunId: '11111111-1111-4111-8111-111111111111',
        itemKey: 'offer-key',
        state: 'selected',
      }),
    ).toThrow();
  });
});
