import { defineCapabilities, type CapabilityManifest } from '../../../common/capability-manifest';

export const PRODUCTS_CAPABILITIES = defineCapabilities([
  {
    key: 'products.create_listing_generation_package',
    ownerDomain: 'products',
    ownerInputPort: 'products.createListingGenerationPackage',
    kind: 'workflow',
    description: 'Create the owner-scoped listing generation package and enqueue its deterministic work.',
    inputSchema: { productName: 'string', imageUrls: 'string[]' },
    outputSchema: { candidateId: 'string', operation_ref: 'string' },
    effects: ['db_write', 'job_enqueue'],
    approval: 'on_write',
    approvalRisk: 'low',
    idempotency: 'required',
    visibility: 'agent',
    entrypoint: { type: 'incoming_port', token: 'PRODUCTS_LISTING_GENERATION_CAPABILITY_PORT' },
  },
] as const satisfies readonly CapabilityManifest[]);
