import { Inject, Injectable } from '@nestjs/common';
import {
  SOURCING_LISTING_PREP_CAPABILITY_PORT,
  type SourcingListingPrepCapabilityPort,
} from '../../../../sourcing/application/port/in/capability/sourcing-capability.ports';
import type {
  ProductsListingGenerationCapabilityPort,
  ProductsListingGenerationInput,
  ProductsListingGenerationResult,
} from '../../../application/port/in/capability/listing-generation.port';

/** Products owns the public generation-package capability and its idempotency. */
@Injectable()
export class ProductsListingGenerationCapabilityAdapter
  implements ProductsListingGenerationCapabilityPort
{
  constructor(
    @Inject(SOURCING_LISTING_PREP_CAPABILITY_PORT)
    private readonly preparation: SourcingListingPrepCapabilityPort,
  ) {}

  async createListingGenerationPackage(
    input: ProductsListingGenerationInput,
  ): Promise<ProductsListingGenerationResult> {
    const result = await this.preparation.createGenerationPackage({
      ...input,
      idempotencyKey: input.idempotencyKey,
    });
    return {
      candidateId: result.candidateId,
      operation_ref: result.parentOperationKey,
      href: result.href,
    };
  }
}
