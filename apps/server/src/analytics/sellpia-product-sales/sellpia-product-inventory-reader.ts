import { Inject, Injectable } from '@nestjs/common';
import {
  INVENTORY_AVAILABILITY_PORT,
  type InventoryAvailabilityPort,
} from '../../inventory/application/port/in/stock/inventory-availability.port';
import { PrismaService } from '../../prisma/prisma.service';
import {
  projectSellpiaProductInventory,
  resolveSellpiaProductInventoryRows,
  type SellpiaProductInventoryProjectionInput,
} from './sellpia-product-inventory-projection';

@Injectable()
export class SellpiaProductInventoryReader {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(INVENTORY_AVAILABILITY_PORT)
    private readonly inventory: InventoryAvailabilityPort,
  ) {}

  async project(
    organizationId: string,
    products: readonly SellpiaProductInventoryProjectionInput[],
  ) {
    const candidates = await this.prisma.sellpiaInventorySku.findMany({
      where: { organizationId },
      select: { id: true, code: true, barcode: true, isActive: true },
    });
    const resolved = resolveSellpiaProductInventoryRows(products, candidates);
    const availability = await this.inventory.findBySkuIds({
      organizationId,
      sellpiaInventorySkuIds: resolved.matchedSkuIds,
    });
    const destinationRows = resolved.matchedSkuIds.length > 0
      ? await this.prisma.productVariantComponent.findMany({
        where: {
          organizationId,
          sellpiaInventorySkuId: { in: resolved.matchedSkuIds },
        },
        select: {
          sellpiaInventorySkuId: true,
          quantity: true,
          productVariant: {
            select: {
              id: true,
              code: true,
              name: true,
              masterProduct: {
                select: { id: true, code: true, name: true },
              },
            },
          },
        },
      })
      : [];
    const projection = projectSellpiaProductInventory({
      products,
      resolutions: resolved.resolutions,
      availability,
      destinations: destinationRows.map((row) => ({
        sellpiaInventorySkuId: row.sellpiaInventorySkuId,
        unitsPerVariant: row.quantity,
        masterProductId: row.productVariant.masterProduct.id,
        masterProductCode: row.productVariant.masterProduct.code,
        masterProductName: row.productVariant.masterProduct.name,
        productVariantId: row.productVariant.id,
        productVariantCode: row.productVariant.code,
        productVariantName: row.productVariant.name,
      })),
    });
    return { availability, projection };
  }
}
