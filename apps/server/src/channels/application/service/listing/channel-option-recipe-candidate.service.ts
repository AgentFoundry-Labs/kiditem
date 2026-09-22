import type { ChannelOptionRecipeCandidatePort } from "../../port/in/listing/channel-option-recipe-candidate.port";
import { ChannelInputError as BadRequestException } from '../../../domain/exception/channel-business-error';
import {
  ProductRecipeComponentCandidateListResponseSchema,
  ProductRecipeComponentCandidateQuerySchema,
  type ProductRecipeComponentCandidateListResponse,
} from '@kiditem/shared/product-operations';
import {
  PRODUCT_AVAILABILITY_PORT,
  type ProductAvailabilityPort,
} from '../../../../products/application/port/in/product-availability.port';

/**
 * Recipe candidates are a Channels matching concern. Product identity and
 * published stock still come from the public Products availability port.
 */

export class ChannelOptionRecipeCandidateService implements ChannelOptionRecipeCandidatePort {
  constructor(

    private readonly availability: ProductAvailabilityPort,
  ) {}

  async search(
    organizationId: string,
    rawQuery: unknown,
  ): Promise<ProductRecipeComponentCandidateListResponse> {
    const parsed = ProductRecipeComponentCandidateQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid recipe component candidate query',
        errors: parsed.error.flatten(),
      });
    }

    const rows = await this.availability.searchCandidates({
      organizationId,
      query: parsed.data.search,
      limit: parsed.data.limit,
      stockStatus: parsed.data.stockStatus,
    });
    return ProductRecipeComponentCandidateListResponseSchema.parse({
      items: rows,
    });
  }
}
