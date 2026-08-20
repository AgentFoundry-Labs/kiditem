import { describe, expect, it } from 'vitest';
import { CAPABILITY_KINDS } from '../../common/capability-manifest';
import { SOURCING_CAPABILITIES } from '../domain/capability/sourcing.capabilities';

describe('sourcing capability manifest', () => {
  it('publishes the bounded workspace capability surface without repeated discovery tools', () => {
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
      'market.collect_shadow_signals',
      'product_listing.create_generation_package',
    ]);
    expect(SOURCING_CAPABILITIES.map((capability) => capability.key)).not.toEqual(
      expect.arrayContaining([
        'market.collect_keyword_category_rankings',
        'coupang.match_products',
        'coupang.collect_tracking_snapshot',
        'supplier1688.match_products',
        'sourcing.score_opportunities',
        'sourcing.create_recommendation_packet',
      ]),
    );
  });

  it('keeps workspace writes idempotent and owned by the bounded incoming port', () => {
    const workspace = SOURCING_CAPABILITIES.filter((capability) =>
      capability.key.startsWith('sourcing.') &&
      capability.entrypoint.token === 'SOURCING_AGENT_WORKSPACE_CAPABILITY_PORT',
    );
    expect(workspace.map((capability) => capability.key)).toEqual([
      'sourcing.retrieveWorkspaceEvidence',
      'sourcing.inspectRecommendationRun',
      'sourcing.refreshCollection',
      'sourcing.refreshValidation',
      'sourcing.createReviewBatch',
    ]);
    for (const capability of workspace.filter((item) => item.effects.includes('db_write'))) {
      expect(capability.kind).toBe('workflow');
      expect(capability.idempotency).toBe('required');
    }
  });

  it('exposes only the two registered Sourcing reads to the Operator foundation profile', () => {
    const operatorReadKeys = SOURCING_CAPABILITIES.filter(
      (capability) =>
        capability.entrypoint.token === 'SOURCING_AGENT_WORKSPACE_CAPABILITY_PORT' &&
        !capability.effects.includes('db_write'),
    ).map((capability) => capability.key);

    expect(operatorReadKeys).toEqual([
      'sourcing.retrieveWorkspaceEvidence',
      'sourcing.inspectRecommendationRun',
    ]);
  });

  it('starts external market signals through an OperationRun workflow', () => {
    expect(
      SOURCING_CAPABILITIES.find(
        (capability) => capability.key === 'market.collect_shadow_signals',
      ),
    ).toMatchObject({
      outputSchema: { operationRunId: 'string', status: 'string' },
      effects: ['db_write', 'external_io', 'job_enqueue'],
      approval: 'on_write',
    });
  });

  it('keeps ownership, kinds, and write effects explicit', () => {
    const allowedKinds = new Set(CAPABILITY_KINDS);
    const keys = new Set<string>();
    for (const capability of SOURCING_CAPABILITIES) {
      expect(capability.ownerDomain).toBe('sourcing');
      expect(allowedKinds.has(capability.kind)).toBe(true);
      expect(keys.has(capability.key)).toBe(false);
      keys.add(capability.key);
      if (capability.effects.includes('db_write')) {
        expect(['sink', 'workflow']).toContain(capability.kind);
        expect(capability.idempotency).toBe('required');
      }
    }
  });
});
