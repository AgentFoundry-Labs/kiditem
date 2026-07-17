import { Inject, Injectable } from '@nestjs/common';
import {
  SELLPIA_INVENTORY_SKU_READ_PORT,
  type SellpiaInventorySkuReadPort,
} from '../../../../inventory/application/port/in/stock/sellpia-inventory-sku-read.port';
import type {
  SellpiaRecipeEvidencePort,
  SellpiaRecipeEvidenceSku,
} from '../../../application/port/out/cross-domain/sellpia-recipe-evidence.port';

@Injectable()
export class SellpiaRecipeEvidenceAdapter implements SellpiaRecipeEvidencePort {
  constructor(
    @Inject(SELLPIA_INVENTORY_SKU_READ_PORT)
    private readonly inventory: SellpiaInventorySkuReadPort,
  ) {}

  async findByCodes(organizationId: string, codes: string[]): Promise<SellpiaRecipeEvidenceSku[]> {
    return (await this.inventory.findByCodes(organizationId, codes)).map(toEvidenceSku);
  }

  async findByNormalizedNames(
    organizationId: string,
    normalizedNames: string[],
  ): Promise<SellpiaRecipeEvidenceSku[]> {
    return (await this.inventory.findByNormalizedNames(organizationId, normalizedNames)).map(toEvidenceSku);
  }
}

function toEvidenceSku(sku: {
  sellpiaInventorySkuId: string;
  code: string;
  name: string;
  optionName: string | null;
  currentStock: number;
}): SellpiaRecipeEvidenceSku {
  return {
    sellpiaInventorySkuId: sku.sellpiaInventorySkuId,
    code: sku.code,
    name: sku.name,
    optionName: sku.optionName,
    currentStock: sku.currentStock,
  };
}
