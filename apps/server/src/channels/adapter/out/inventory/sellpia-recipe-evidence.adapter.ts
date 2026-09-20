import { Inject, Injectable } from '@nestjs/common';
import {
  SELLPIA_INVENTORY_SKU_READ_PORT,
  type SellpiaInventorySkuReadModel,
  type SellpiaInventorySkuReadPort,
} from '../../../../inventory/application/port/in/stock/sellpia-inventory-sku-read.port';
import {
  INVENTORY_AVAILABILITY_PORT,
  type InventoryAvailabilityPort,
} from '../../../../inventory/application/port/in/stock/inventory-availability.port';
import type {
  SellpiaRecipeEvidencePort,
  SellpiaRecipeEvidenceSku,
} from '../../../application/port/out/cross-domain/sellpia-recipe-evidence.port';

@Injectable()
export class SellpiaRecipeEvidenceAdapter implements SellpiaRecipeEvidencePort {
  constructor(
    @Inject(SELLPIA_INVENTORY_SKU_READ_PORT)
    private readonly inventorySkus: SellpiaInventorySkuReadPort,
    @Inject(INVENTORY_AVAILABILITY_PORT)
    private readonly availability: InventoryAvailabilityPort,
  ) {}

  async listActiveForMatching(
    organizationId: string,
  ): Promise<SellpiaRecipeEvidenceSku[]> {
    return this.withAvailability(
      organizationId,
      await this.inventorySkus.listActiveForMatching(organizationId),
    );
  }

  async findByIds(
    organizationId: string,
    ids: string[],
  ): Promise<SellpiaRecipeEvidenceSku[]> {
    return this.withAvailability(
      organizationId,
      await this.inventorySkus.findByIds(organizationId, ids),
    );
  }

  async findByCodes(organizationId: string, codes: string[]): Promise<SellpiaRecipeEvidenceSku[]> {
    return this.withAvailability(
      organizationId,
      await this.inventorySkus.findByCodes(organizationId, codes),
    );
  }

  async findByNormalizedBarcodes(
    organizationId: string,
    normalizedBarcodes: string[],
  ): Promise<SellpiaRecipeEvidenceSku[]> {
    return this.withAvailability(
      organizationId,
      await this.inventorySkus.findByNormalizedBarcodes(
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
      await this.inventorySkus.findByNormalizedNames(organizationId, normalizedNames),
    );
  }

  private async withAvailability(
    organizationId: string,
    skus: SellpiaInventorySkuReadModel[],
  ): Promise<SellpiaRecipeEvidenceSku[]> {
    if (skus.length === 0) return [];
    const availability = await this.availability.findBySkuIds({
      organizationId,
      sellpiaInventorySkuIds: skus.map((sku) => sku.sellpiaInventorySkuId),
    });
    const availabilityBySkuId = new Map(availability.items.map((item) => [
      item.sellpiaInventorySkuId,
      item,
    ]));
    return skus.map((sku) => {
      const stock = availabilityBySkuId.get(sku.sellpiaInventorySkuId);
      return toEvidenceSku(sku, stock?.currentStock ?? null);
    });
  }
}

function toEvidenceSku(sku: {
  sellpiaInventorySkuId: string;
  code: string;
  name: string;
  optionName: string | null;
  barcode: string | null;
}, currentStock: number | null): SellpiaRecipeEvidenceSku {
  return {
    sellpiaInventorySkuId: sku.sellpiaInventorySkuId,
    code: sku.code,
    name: sku.name,
    optionName: sku.optionName,
    barcode: sku.barcode,
    currentStock,
  };
}
