import {
  defineCapabilities,
  type CapabilityManifest,
} from '../../../common/capability-manifest';

export const SOURCING_CAPABILITIES = defineCapabilities([
  {
    key: 'sourcing.duplicateCheck',
    ownerDomain: 'sourcing',
    kind: 'resource',
    description: 'Check whether a source product URL already has a sourcing candidate.',
    inputSchema: { sourceUrl: 'string' },
    outputSchema: { duplicate: 'boolean', candidateId: 'string|null' },
    effects: ['read'],
    approval: 'none',
    idempotency: 'required',
    visibility: 'both',
    entrypoint: {
      type: 'incoming_port',
      token: 'SOURCING_DUPLICATE_CHECK_PORT',
    },
  },
  {
    key: 'sourcing.scrapeProductUrl',
    ownerDomain: 'sourcing',
    kind: 'tool',
    description: 'Scrape a product URL with the sourcing browser runtime.',
    inputSchema: { sourceUrl: 'string', platform: 'string|undefined' },
    outputSchema: { snapshot: 'SourcingProductSnapshot' },
    effects: ['browser', 'external_io'],
    approval: 'none',
    idempotency: 'recommended',
    visibility: 'both',
    entrypoint: {
      type: 'incoming_port',
      token: 'SOURCING_SCRAPE_PRODUCT_URL_PORT',
    },
  },
  {
    key: 'sourcing.ingestCandidate',
    ownerDomain: 'sourcing',
    kind: 'sink',
    description: 'Persist a validated scraped product snapshot as a sourcing candidate.',
    inputSchema: { snapshot: 'SourcingProductSnapshot' },
    outputSchema: { candidateId: 'string' },
    effects: ['db_write'],
    approval: 'on_write',
    idempotency: 'required',
    visibility: 'both',
    entrypoint: {
      type: 'incoming_port',
      token: 'SOURCING_INGEST_CANDIDATE_PORT',
    },
  },
  {
    key: 'sourcing.scrapeUrlWorkflow',
    ownerDomain: 'sourcing',
    kind: 'workflow',
    description: 'Duplicate-check, scrape, ingest, and return the candidate detail link.',
    inputSchema: { sourceUrl: 'string' },
    outputSchema: { skipped: 'boolean', candidateId: 'string', href: 'string' },
    effects: ['read', 'browser', 'external_io', 'db_write'],
    approval: 'none',
    idempotency: 'required',
    visibility: 'both',
    entrypoint: {
      type: 'incoming_port',
      token: 'SOURCING_SCRAPE_URL_WORKFLOW_PORT',
    },
  },
] as const satisfies readonly CapabilityManifest[]);

export type SourcingCapabilityKey = (typeof SOURCING_CAPABILITIES)[number]['key'];
