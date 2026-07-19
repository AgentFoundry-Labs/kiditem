import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  SellpiaInventorySkuReadModel,
  SellpiaInventorySkuReadRepositoryPort,
} from '../../../application/port/out/repository/sellpia-inventory-sku-read.repository.port';

const SELLPIA_INVENTORY_SKU_SELECT = {
  id: true,
  code: true,
  name: true,
  optionName: true,
  barcode: true,
  currentStock: true,
  purchasePrice: true,
  salePrice: true,
  isActive: true,
  lastImportRunId: true,
} as const;

type SelectedSellpiaInventorySku = Prisma.SellpiaInventorySkuGetPayload<{
  select: typeof SELLPIA_INVENTORY_SKU_SELECT;
}>;

@Injectable()
export class SellpiaInventorySkuReadRepositoryAdapter
implements SellpiaInventorySkuReadRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async listActiveForMatching(
    organizationId: string,
  ): Promise<SellpiaInventorySkuReadModel[]> {
    const rows = await this.prisma.sellpiaInventorySku.findMany({
      where: activeSellpiaWhere(organizationId),
      select: SELLPIA_INVENTORY_SKU_SELECT,
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toReadModel);
  }

  async findByIds(
    organizationId: string,
    ids: string[],
  ): Promise<SellpiaInventorySkuReadModel[]> {
    return this.find({ organizationId, id: { in: ids } });
  }

  async findByCodes(
    organizationId: string,
    codes: string[],
  ): Promise<SellpiaInventorySkuReadModel[]> {
    return this.findActive({ organizationId, code: { in: codes } });
  }

  async findByBarcodes(
    organizationId: string,
    barcodes: string[],
  ): Promise<SellpiaInventorySkuReadModel[]> {
    return this.findActive({ organizationId, barcode: { in: barcodes } });
  }

  async findByNormalizedBarcodes(
    organizationId: string,
    normalizedBarcodes: string[],
  ): Promise<SellpiaInventorySkuReadModel[]> {
    const rows = await this.prisma.$queryRaw<SelectedSellpiaInventorySku[]>(Prisma.sql`
      SELECT
        id,
        code,
        name,
        option_name AS "optionName",
        barcode,
        current_stock AS "currentStock",
        purchase_price AS "purchasePrice",
        sale_price AS "salePrice",
        is_active AS "isActive",
        last_import_run_id AS "lastImportRunId"
      FROM sellpia_inventory_skus
      WHERE organization_id = ${organizationId}::uuid
        AND is_active = true
        AND regexp_replace(coalesce(barcode, ''), '[^0-9]', '', 'g')
          IN (${Prisma.join(normalizedBarcodes)})
      ORDER BY code ASC, id ASC
    `);
    return rows.map(toReadModel);
  }

  async findByNormalizedNames(
    organizationId: string,
    normalizedNames: string[],
  ): Promise<SellpiaInventorySkuReadModel[]> {
    const rows = await this.prisma.$queryRaw<SelectedSellpiaInventorySku[]>(Prisma.sql`
      SELECT
        id,
        code,
        name,
        option_name AS "optionName",
        barcode,
        current_stock AS "currentStock",
        purchase_price AS "purchasePrice",
        sale_price AS "salePrice",
        is_active AS "isActive",
        last_import_run_id AS "lastImportRunId"
      FROM sellpia_inventory_skus
      WHERE organization_id = ${organizationId}::uuid
        AND is_active = true
        AND regexp_replace(
          lower(normalize(name, NFKC)),
          '[[:space:]]+',
          '',
          'g'
        ) IN (${Prisma.join(normalizedNames)})
      ORDER BY code ASC, id ASC
    `);
    return rows.map(toReadModel);
  }

  async search(
    organizationId: string,
    query: string,
    limit: number,
  ): Promise<SellpiaInventorySkuReadModel[]> {
    const rows = await this.prisma.sellpiaInventorySku.findMany({
      where: {
        ...activeSellpiaWhere(organizationId),
        OR: [
          { code: { contains: query, mode: 'insensitive' } },
          { name: { contains: query, mode: 'insensitive' } },
          { optionName: { contains: query, mode: 'insensitive' } },
          { barcode: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: SELLPIA_INVENTORY_SKU_SELECT,
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
      take: Math.min(100, Math.max(1, Math.trunc(limit))),
    });
    return rows.map(toReadModel);
  }

  private async find(
    where: Prisma.SellpiaInventorySkuWhereInput,
  ): Promise<SellpiaInventorySkuReadModel[]> {
    const rows = await this.prisma.sellpiaInventorySku.findMany({
      where,
      select: SELLPIA_INVENTORY_SKU_SELECT,
    });
    return rows.map(toReadModel);
  }

  private findActive(
    where: Prisma.SellpiaInventorySkuWhereInput,
  ): Promise<SellpiaInventorySkuReadModel[]> {
    return this.find({ ...where, isActive: true });
  }
}

function activeSellpiaWhere(
  organizationId: string,
): Prisma.SellpiaInventorySkuWhereInput {
  return {
    organizationId,
    isActive: true,
  };
}

function toReadModel(
  row: SelectedSellpiaInventorySku,
): SellpiaInventorySkuReadModel {
  return {
    sellpiaInventorySkuId: row.id,
    code: row.code,
    name: row.name,
    optionName: row.optionName,
    barcode: row.barcode,
    currentStock: row.currentStock,
    purchasePrice: row.purchasePrice,
    salePrice: row.salePrice,
    isActive: row.isActive,
    lastImportRunId: row.lastImportRunId,
  };
}
