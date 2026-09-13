import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  ProductRecipeComponentCandidateListResponseSchema,
  ProductRecipeComponentCandidateQuerySchema,
  type ProductRecipeComponentCandidateListResponse,
} from '@kiditem/shared/product-operations';
import {
  INVENTORY_AVAILABILITY_PORT,
  type InventoryAvailabilityPort,
} from '../../../inventory/application/port/in/stock/inventory-availability.port';

@Injectable()
export class ProductRecipeComponentCandidateService {
  constructor(
    @Inject(INVENTORY_AVAILABILITY_PORT)
    private readonly availability: InventoryAvailabilityPort,
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
