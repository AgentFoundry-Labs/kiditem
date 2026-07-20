import { Inject, Injectable } from '@nestjs/common';
import {
  SELLPIA_INVENTORY_SKU_READ_PORT,
  type SellpiaInventorySkuReadPort,
} from '../../../../inventory/application/port/in/stock/sellpia-inventory-sku-read.port';
import { sellpiaNameJoinKey } from '../../../domain/sellpia-name-key';
import type {
  SellpiaSalePriceMatch,
  SellpiaSalePricePort,
} from '../../../application/port/out/cross-domain/sellpia-sale-price.port';

@Injectable()
export class SellpiaSalePriceAdapter implements SellpiaSalePricePort {
  constructor(
    @Inject(SELLPIA_INVENTORY_SKU_READ_PORT)
    private readonly inventory: SellpiaInventorySkuReadPort,
  ) {}

  async findSalePricesByNormalizedNames(
    organizationId: string,
    normalizedNames: string[],
  ): Promise<SellpiaSalePriceMatch[]> {
    const keys = [
      ...new Set(
        normalizedNames.filter(
          (name): name is string => typeof name === 'string' && name.length > 0,
        ),
      ),
    ];
    if (keys.length === 0) return [];

    const skus = await this.inventory.findByNormalizedNames(organizationId, keys);

    // `SellpiaInventorySku` 는 `@@unique([organizationId, code])` 라서 이름은
    // 유일하지 않다. 같은 정규화 이름에 옵션별 행이 여러 개 걸릴 수 있다.
    const pricesByName = new Map<string, Array<number | null>>();
    for (const sku of skus) {
      const key = sellpiaNameJoinKey(sku.name);
      if (key === null) continue;
      const price =
        typeof sku.salePrice === 'number' && Number.isFinite(sku.salePrice) && sku.salePrice > 0
          ? sku.salePrice
          : null;
      const bucket = pricesByName.get(key);
      if (bucket) bucket.push(price);
      else pricesByName.set(key, [price]);
    }

    const matches: SellpiaSalePriceMatch[] = [];
    for (const [normalizedName, prices] of pricesByName) {
      // 답이 하나로 확정될 때만 내보낸다. 가격이 비어 있는 행이 섞여 있거나
      // 서로 다른 가격이 걸려 있으면 어느 쪽이 맞는지 알 수 없으므로 포기한다.
      // 최저가/첫 행 같은 임의 선택은 조용히 틀린 가격을 만든다.
      if (prices.some((price) => price === null)) continue;
      const distinct = new Set(prices as number[]);
      if (distinct.size !== 1) continue;
      matches.push({ normalizedName, salePrice: prices[0] as number });
    }
    return matches;
  }
}
