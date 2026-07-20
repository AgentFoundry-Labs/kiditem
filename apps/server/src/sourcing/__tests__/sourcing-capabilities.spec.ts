import { describe, expect, it } from 'vitest';
import { CAPABILITY_KINDS } from '../../common/capability-manifest';
import {
  SOURCING_DUPLICATE_CHECK_PORT,
  SOURCING_DISCOVERY_CAPABILITY_PORT,
  SOURCING_INGEST_CANDIDATE_PORT,
  SOURCING_LISTING_PREP_CAPABILITY_PORT,
  SOURCING_SCRAPE_PRODUCT_URL_PORT,
  SOURCING_SCRAPE_URL_WORKFLOW_PORT,
} from '../application/port/in/capability/sourcing-capability.ports';
import { MARKET_SHADOW_COLLECTION_CAPABILITY_PORT } from '../application/port/in/capability/market-shadow-capability.port';
import { SOURCING_CAPABILITIES } from '../domain/capability/sourcing.capabilities';

describe('sourcing capability manifest', () => {
  it('publishes the initial sourcing resource/tool/workflow/sink surface', () => {
    expect(SOURCING_CAPABILITIES.map((capability) => capability.key)).toEqual([
      'sourcing.duplicateCheck',
      'sourcing.scrapeProductUrl',
      'sourcing.ingestCandidate',
      'sourcing.scrapeUrlWorkflow',
      'market.collect_keyword_category_rankings',
      'market.collect_shadow_signals',
      'coupang.match_products',
      'coupang.collect_tracking_snapshot',
      'supplier1688.match_products',
      'sourcing.score_opportunities',
      'sourcing.create_recommendation_packet',
      'product_listing.create_generation_package',
    ]);
  });

  it('declares first-slice Agent OS sourcing discovery capabilities', () => {
    const keys = new Set(SOURCING_CAPABILITIES.map((capability) => capability.key));

    expect(keys.has('market.collect_keyword_category_rankings')).toBe(true);
    expect(keys.has('market.collect_shadow_signals')).toBe(true);
    expect(keys.has('coupang.match_products')).toBe(true);
    expect(keys.has('coupang.collect_tracking_snapshot')).toBe(true);
    expect(keys.has('supplier1688.match_products')).toBe(true);
    expect(keys.has('sourcing.score_opportunities')).toBe(true);
    expect(keys.has('sourcing.create_recommendation_packet')).toBe(true);
    expect(keys.has('product_listing.create_generation_package')).toBe(true);
  });

  it('publishes discovery as persisted replay with confidence and data gaps', () => {
    const discoveryCapabilities = SOURCING_CAPABILITIES.filter((capability) => [
      'market.collect_keyword_category_rankings',
      'coupang.match_products',
      'coupang.collect_tracking_snapshot',
      'supplier1688.match_products',
      'sourcing.score_opportunities',
      'sourcing.create_recommendation_packet',
    ].includes(capability.key));

    for (const capability of discoveryCapabilities) {
      expect(capability.inputSchema).toMatchObject({ mode: 'replay' });
      expect(capability.outputSchema).toMatchObject({
        confidence: 'number',
        dataGaps: 'string[]',
      });
      expect(JSON.stringify(capability)).not.toContain('stub');
    }
  });

  it('marks listing-prep generation as a write workflow that enqueues AI jobs', () => {
    expect(
      SOURCING_CAPABILITIES.find(
        (capability) => capability.key === 'product_listing.create_generation_package',
      ),
    ).toMatchObject({
      kind: 'workflow',
      effects: ['db_write', 'job_enqueue'],
      idempotency: 'required',
      visibility: 'agent',
    });
  });

  it('keeps external market signals in a disabled shadow workflow', () => {
    expect(
      SOURCING_CAPABILITIES.find(
        (capability) => capability.key === 'market.collect_shadow_signals',
      ),
    ).toMatchObject({
      kind: 'workflow',
      outputSchema: { decisionImpact: 'disabled' },
      effects: ['read', 'external_io', 'db_write'],
      approval: 'on_write',
      idempotency: 'required',
      visibility: 'agent',
    });
  });

  it('marks scrape URL workflow as browser work that enqueues a sourcing scrape job', () => {
    expect(
      SOURCING_CAPABILITIES.find(
        (capability) => capability.key === 'sourcing.scrapeUrlWorkflow',
      ),
    ).toMatchObject({
      kind: 'workflow',
      effects: ['read', 'browser', 'external_io', 'db_write', 'job_enqueue'],
      idempotency: 'required',
      visibility: 'both',
    });
  });

  it('marks 1688 supplier matching as a workflow when supplier URLs trigger scrape intake', () => {
    expect(
      SOURCING_CAPABILITIES.find(
        (capability) => capability.key === 'supplier1688.match_products',
      ),
    ).toMatchObject({
      kind: 'workflow',
      effects: ['read', 'browser', 'external_io', 'db_write', 'job_enqueue'],
      idempotency: 'required',
      visibility: 'agent',
    });
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
      'market.collect_shadow_signals': {
        type: 'incoming_port',
        token: MARKET_SHADOW_COLLECTION_CAPABILITY_PORT.description,
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
      'product_listing.create_generation_package': {
        type: 'incoming_port',
        token: SOURCING_LISTING_PREP_CAPABILITY_PORT.description,
      },
    });
  });
});
