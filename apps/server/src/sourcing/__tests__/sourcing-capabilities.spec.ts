import { describe, expect, it } from 'vitest';
import { CAPABILITY_KINDS } from '../../common/capability-manifest';
import {
  SOURCING_DUPLICATE_CHECK_PORT,
  SOURCING_DISCOVERY_CAPABILITY_PORT,
  SOURCING_INGEST_CANDIDATE_PORT,
  SOURCING_SCRAPE_PRODUCT_URL_PORT,
  SOURCING_SCRAPE_URL_WORKFLOW_PORT,
} from '../application/port/in/capability/sourcing-capability.ports';
import { SOURCING_CAPABILITIES } from '../domain/capability/sourcing.capabilities';

describe('sourcing capability manifest', () => {
  it('publishes the initial sourcing resource/tool/workflow/sink surface', () => {
    expect(SOURCING_CAPABILITIES.map((capability) => capability.key)).toEqual([
      'sourcing.duplicateCheck',
      'sourcing.scrapeProductUrl',
      'sourcing.ingestCandidate',
      'sourcing.scrapeUrlWorkflow',
      'market.collect_keyword_category_rankings',
      'coupang.match_products',
      'coupang.collect_tracking_snapshot',
      'supplier1688.match_products',
      'sourcing.score_opportunities',
      'sourcing.create_recommendation_packet',
    ]);
  });

  it('declares first-slice Agent OS sourcing discovery capabilities', () => {
    const keys = new Set(SOURCING_CAPABILITIES.map((capability) => capability.key));

    expect(keys.has('market.collect_keyword_category_rankings')).toBe(true);
    expect(keys.has('coupang.match_products')).toBe(true);
    expect(keys.has('coupang.collect_tracking_snapshot')).toBe(true);
    expect(keys.has('supplier1688.match_products')).toBe(true);
    expect(keys.has('sourcing.score_opportunities')).toBe(true);
    expect(keys.has('sourcing.create_recommendation_packet')).toBe(true);
  });

  it('keeps capability ownership, kind, and write effects explicit', () => {
    const allowedKinds = new Set(CAPABILITY_KINDS);
    const keys = new Set<string>();

    for (const capability of SOURCING_CAPABILITIES) {
      expect(capability.ownerDomain).toBe('sourcing');
      expect(capability.key).toContain('.');
      expect(keys.has(capability.key)).toBe(false);
      expect(allowedKinds.has(capability.kind)).toBe(true);
      keys.add(capability.key);

      if (capability.effects.includes('db_write')) {
        expect(['sink', 'workflow']).toContain(capability.kind);
        expect(capability.idempotency).toBe('required');
      }
    }
  });

  it('maps every manifest entry to a sourcing-owned incoming use-case interface', () => {
    expect(
      Object.fromEntries(
        SOURCING_CAPABILITIES.map((capability) => [
          capability.key,
          capability.entrypoint,
        ]),
      ),
    ).toEqual({
      'sourcing.duplicateCheck': {
        type: 'incoming_port',
        token: SOURCING_DUPLICATE_CHECK_PORT.description,
      },
      'sourcing.scrapeProductUrl': {
        type: 'incoming_port',
        token: SOURCING_SCRAPE_PRODUCT_URL_PORT.description,
      },
      'sourcing.ingestCandidate': {
        type: 'incoming_port',
        token: SOURCING_INGEST_CANDIDATE_PORT.description,
      },
      'sourcing.scrapeUrlWorkflow': {
        type: 'incoming_port',
        token: SOURCING_SCRAPE_URL_WORKFLOW_PORT.description,
      },
      'market.collect_keyword_category_rankings': {
        type: 'incoming_port',
        token: SOURCING_DISCOVERY_CAPABILITY_PORT.description,
      },
      'coupang.match_products': {
        type: 'incoming_port',
        token: SOURCING_DISCOVERY_CAPABILITY_PORT.description,
      },
      'coupang.collect_tracking_snapshot': {
        type: 'incoming_port',
        token: SOURCING_DISCOVERY_CAPABILITY_PORT.description,
      },
      'supplier1688.match_products': {
        type: 'incoming_port',
        token: SOURCING_DISCOVERY_CAPABILITY_PORT.description,
      },
      'sourcing.score_opportunities': {
        type: 'incoming_port',
        token: SOURCING_DISCOVERY_CAPABILITY_PORT.description,
      },
      'sourcing.create_recommendation_packet': {
        type: 'incoming_port',
        token: SOURCING_DISCOVERY_CAPABILITY_PORT.description,
      },
    });
  });
});
