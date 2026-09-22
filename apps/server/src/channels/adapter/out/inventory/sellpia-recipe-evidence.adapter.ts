import { Inject, Injectable } from '@nestjs/common';
import {
  PRODUCT_AVAILABILITY_PORT,
  type ProductAvailabilityPort,
} from '../../../../products/application/port/in/product-availability.port';
import {
  PRODUCT_SOURCE_READ_PORT,
  type ProductSourceReadModel,
  type ProductSourceReadPort,
} from '../../../../products/application/port/in/product-source-read.port';
import type {
  SellpiaRecipeEvidencePort,
  SellpiaRecipeEvidenceSku,
} from '../../../application/port/out/cross-domain/sellpia-recipe-evidence.port';

@Injectable()
export class SellpiaRecipeEvidenceAdapter implements SellpiaRecipeEvidencePort {
  constructor(
    @Inject(PRODUCT_SOURCE_READ_PORT)
    private readonly products: ProductSourceReadPort,
    @Inject(PRODUCT_AVAILABILITY_PORT)
    private readonly availability: ProductAvailabilityPort,
  ) {}

  async listActiveForMatching(
    organizationId: string,
  ): Promise<SellpiaRecipeEvidenceSku[]> {
    return this.withAvailability(
      organizationId,
      await this.products.listActiveForMatching(organizationId),
    );
  }

  async findByIds(
    organizationId: string,
    ids: string[],
  ): Promise<SellpiaRecipeEvidenceSku[]> {
    return this.withAvailability(
      organizationId,
      await this.products.findByIds(organizationId, ids),
    );
  }

  async findByCodes(organizationId: string, codes: string[]): Promise<SellpiaRecipeEvidenceSku[]> {
    return this.withAvailability(
      organizationId,
      await this.products.findByCodes(organizationId, codes),
    );
  }

  async findByNormalizedBarcodes(
    organizationId: string,
    normalizedBarcodes: string[],
  ): Promise<SellpiaRecipeEvidenceSku[]> {
    return this.withAvailability(
      organizationId,
      await this.products.findByNormalizedBarcodes(
        organizationId,
        normalizedBarcodes,
      ),
    );
  }

  async findByNormalizedNames(
    organizationId: string,
    normalizedNames: string[],
  ): Promise<SellpiaRecipeEvidenceSku[]> {
    return this.withAvailability(
      organizationId,
      await this.products.findByNormalizedNames(organizationId, normalizedNames),
    );
  }

  private async withAvailability(
    organizationId: string,
    products: ProductSourceReadModel[],
  ): Promise<SellpiaRecipeEvidenceSku[]> {
    if (products.length === 0) return [];
    const availability = await this.availability.findByMasterProductIds({
      organizationId,
      masterProductIds: products.map((product) => product.masterProductId),
    });
    const availabilityByMasterProductId = new Map(availability.items.map((item) => [
      item.masterProductId,
      item,
    ]));
    return products.map((product) => {
      const stock = availabilityByMasterProductId.get(product.masterProductId);
      return toEvidenceSku(product, stock?.currentStock ?? null);
    });
  }
}

function toEvidenceSku(sku: {
  masterProductId: string;
  code: string;
  name: string;
  optionName: string | null;
  barcode: string | null;
}, currentStock: number | null): SellpiaRecipeEvidenceSku {
  return {
    masterProductId: sku.masterProductId,
    code: sku.code,
    name: sku.name,
    optionName: sku.optionName,
    barcode: sku.barcode,
    currentStock,
  };
}
