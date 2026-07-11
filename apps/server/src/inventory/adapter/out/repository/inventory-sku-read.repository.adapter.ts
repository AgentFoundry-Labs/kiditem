import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  InventorySkuReadModel,
  InventorySkuReadRepositoryPort,
} from '../../../application/port/out/repository/inventory-sku-read.repository.port';

const INVENTORY_SKU_READ_SELECT = {
  id: true,
  sellpiaProductCode: true,
  name: true,
  optionName: true,
  barcode: true,
  reportedStock: true,
} as const;

@Injectable()
export class InventorySkuReadRepositoryAdapter
implements InventorySkuReadRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  findByIds(
    organizationId: string,
    ids: string[],
  ): Promise<InventorySkuReadModel[]> {
    return this.prisma.inventorySku.findMany({
      where: { organizationId, id: { in: ids } },
      select: INVENTORY_SKU_READ_SELECT,
    });
  }

  findBySellpiaCodes(
    organizationId: string,
    codes: string[],
  ): Promise<InventorySkuReadModel[]> {
    return this.prisma.inventorySku.findMany({
      where: { organizationId, sellpiaProductCode: { in: codes } },
      select: INVENTORY_SKU_READ_SELECT,
    });
  }

  findByBarcodes(
    organizationId: string,
    barcodes: string[],
  ): Promise<InventorySkuReadModel[]> {
    return this.prisma.inventorySku.findMany({
      where: { organizationId, barcode: { in: barcodes } },
      select: INVENTORY_SKU_READ_SELECT,
    });
  }

  async search(
    organizationId: string,
    query: string,
    limit: number,
  ): Promise<InventorySkuReadModel[]> {
    const rows = await this.prisma.inventorySku.findMany({
      where: {
        organizationId,
        OR: [
          { sellpiaProductCode: { contains: query, mode: 'insensitive' } },
          { name: { contains: query, mode: 'insensitive' } },
          { optionName: { contains: query, mode: 'insensitive' } },
          { barcode: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: INVENTORY_SKU_READ_SELECT,
      take: limit,
    });

    return rows.sort((left, right) => searchMatchRank(left, query) - searchMatchRank(right, query));
  }
}

function searchMatchRank(row: InventorySkuReadModel, query: string): number {
  const needle = query.toLocaleLowerCase();
  const code = row.sellpiaProductCode.toLocaleLowerCase();
  if (code === needle) return 0;
  if (code.startsWith(needle)) return 1;
  if (row.name.toLocaleLowerCase().includes(needle)) return 2;
  if (row.optionName?.toLocaleLowerCase().includes(needle)) return 3;
  if (row.barcode?.toLocaleLowerCase().includes(needle)) return 4;
  return 5;
}
