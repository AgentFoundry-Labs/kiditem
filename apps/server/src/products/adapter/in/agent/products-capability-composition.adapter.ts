import { Inject, Injectable } from '@nestjs/common';
import { defineCapabilityComposition } from '../../../../common/capability-composition';
import { PRODUCTS_CAPABILITIES } from '../../../domain/capability/products.capabilities';
import {
  PRODUCTS_LISTING_GENERATION_CAPABILITY_PORT,
  type ProductsListingGenerationCapabilityPort,
} from '../../../application/port/in/capability/listing-generation.port';
import type { ProductsCapabilityCompositionPort } from '../../../application/port/in/capability/products-capability-composition.port';

/** Products owns the definition-to-listing-generation-owner-port Adapter. */
@Injectable()
export class ProductsCapabilityCompositionAdapter
  implements ProductsCapabilityCompositionPort
{
  readonly compositions;

  constructor(
    @Inject(PRODUCTS_LISTING_GENERATION_CAPABILITY_PORT)
    private readonly listingGeneration: ProductsListingGenerationCapabilityPort,
  ) {
    this.compositions = [
      defineCapabilityComposition(PRODUCTS_CAPABILITIES[0], this.listingGeneration, {
        capabilityKey: 'products.create_listing_generation_package',
        ownerInputPort: 'products.createListingGenerationPackage',
        invoke: ({ context, input }) =>
          this.listingGeneration.createListingGenerationPackage({
            ...input,
            organizationId: context.organizationId,
            triggeredByUserId: context.initiatingUserId,
            idempotencyKey: requiredOwnerIdempotencyKey(context),
            inputHash: requiredOwnerInputHash(context),
          }),
        resourceRef: (output) => ({
          kind: 'sourcing_candidate',
          id: output.candidateId,
        }),
        operationRef: (output) => output.operationRunId,
      }),
    ];
  }
}

function requiredOwnerIdempotencyKey(context: {
  ownerIdempotencyKey?: string;
}): string {
  if (!context.ownerIdempotencyKey?.trim()) {
    throw new Error('owner_idempotency_key_required');
  }
  return context.ownerIdempotencyKey;
}

function requiredOwnerInputHash(context: {
  ownerInputHash?: string;
}): string {
  if (!context.ownerInputHash?.match(/^[a-f0-9]{64}$/)) {
    throw new Error('owner_input_hash_required');
  }
  return context.ownerInputHash;
}
