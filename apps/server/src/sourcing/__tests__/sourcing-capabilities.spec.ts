import { describe, expect, it } from 'vitest';
import { SOURCING_CAPABILITIES } from '../domain/capability/sourcing.capabilities';

describe('sourcing final capability definitions', () => {
  it('publishes all ten Agent-facing Sourcing capabilities', () => {
    expect(SOURCING_CAPABILITIES.map((capability) => capability.key)).toEqual([
      'sourcing.duplicateCheck',
      'sourcing.scrapeProductUrl',
      'sourcing.ingestCandidate',
      'sourcing.scrapeUrlWorkflow',
      'sourcing.retrieveWorkspaceEvidence',
      'sourcing.inspectRecommendationRun',
      'sourcing.refreshCollection',
      'sourcing.refreshValidation',
      'sourcing.createReviewBatch',
      'sourcing.collect_shadow_signals',
    ]);
    expect(SOURCING_CAPABILITIES.map((capability) => capability.key)).not.toEqual(
      expect.arrayContaining([
        'market.collect_keyword_category_rankings',
        'coupang.match_products',
      ]),
    );
  });

  it('owns real strict business schemas and requires idempotency for every mutation', () => {
    for (const capability of SOURCING_CAPABILITIES) {
      expect(capability.ownerDomain).toBe('sourcing');
      expect(capability.inputSchema.safeParse({ organizationId: 'forged' }).success).toBe(false);
      expect(capability.outputSchema.safeParse({}).success).toBe(false);
      if (capability.effects.some((effect) => ['db_write', 'external_write', 'job_enqueue'].includes(effect))) {
        expect(capability.idempotency).toBe('required');
      }
    }
  });

  it('accepts only canonical supplier URLs for public supplier capability inputs', () => {
    for (const key of ['sourcing.duplicateCheck', 'sourcing.scrapeProductUrl', 'sourcing.scrapeUrlWorkflow'] as const) {
      const definition = SOURCING_CAPABILITIES.find((item) => item.key === key)!;
      expect(definition.inputSchema.safeParse({ sourceUrl: 'https://detail.1688.com/offer/123.html#fragment' }).success).toBe(true);
      expect(definition.inputSchema.safeParse({ sourceUrl: 'https://1688.com.evil.test/offer/123.html' }).success).toBe(false);
      expect(definition.inputSchema.safeParse({ sourceUrl: 'http://detail.1688.com/offer/123.html' }).success).toBe(false);
      expect(definition.inputSchema.safeParse({ sourceUrl: 'https://user:pass@detail.1688.com/offer/123.html' }).success).toBe(false);
    }
  });
});
