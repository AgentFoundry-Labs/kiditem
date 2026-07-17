import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  ProductRecipeComponentCandidateListResponseSchema,
  ProductRecipeComponentCandidateQuerySchema,
  type ProductRecipeComponentCandidateListResponse,
} from '@kiditem/shared/product-operations';
import {
  SELLPIA_INVENTORY_SKU_READ_PORT,
  type SellpiaInventorySkuReadPort,
} from '../../../inventory/application/port/in/stock/sellpia-inventory-sku-read.port';

@Injectable()
export class ProductRecipeComponentCandidateService {
  constructor(
    @Inject(SELLPIA_INVENTORY_SKU_READ_PORT)
    private readonly inventory: SellpiaInventorySkuReadPort,
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

    const rows = await this.inventory.search(
      organizationId,
      parsed.data.search,
      parsed.data.limit,
    );
    return ProductRecipeComponentCandidateListResponseSchema.parse({
      items: rows
        .filter((row) => row.isActive)
        .slice(0, parsed.data.limit)
        .map((row) => ({
          sellpiaInventorySkuId: row.sellpiaInventorySkuId,
          code: row.code,
          name: row.name,
          optionName: row.optionName,
          barcode: row.barcode,
          currentStock: row.currentStock,
        })),
    });
  }
}
