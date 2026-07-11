import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
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
    const cappedLimit = Math.min(100, Math.max(1, Math.trunc(limit)));
    const results: InventorySkuReadModel[] = [];
    const seenIds = new Set<string>();
    const collect = async (matchWhere: Prisma.InventorySkuWhereInput) => {
      const remaining = cappedLimit - results.length;
      if (remaining <= 0) return;
      const rows = await this.prisma.inventorySku.findMany({
        where: {
          organizationId,
          ...matchWhere,
          ...(seenIds.size > 0 ? { id: { notIn: [...seenIds] } } : {}),
        },
        select: INVENTORY_SKU_READ_SELECT,
        orderBy: [{ sellpiaProductCode: 'asc' }, { id: 'asc' }],
        take: remaining,
      });
      for (const row of rows) {
        if (seenIds.has(row.id)) continue;
        seenIds.add(row.id);
        results.push(row);
        if (results.length === cappedLimit) break;
      }
    };

    await collect({
      sellpiaProductCode: { equals: query, mode: 'insensitive' },
    });
    await collect({
      sellpiaProductCode: { startsWith: query, mode: 'insensitive' },
    });
    await collect({ name: { contains: query, mode: 'insensitive' } });
    await collect({ optionName: { contains: query, mode: 'insensitive' } });
    await collect({ barcode: { contains: query, mode: 'insensitive' } });

    return results;
  }
}
