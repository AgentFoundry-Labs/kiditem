import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  SellpiaMasterProductReadModel,
  SellpiaMasterProductReadRepositoryPort,
} from '../../../application/port/out/repository/sellpia-master-product-read.repository.port';

const SELLPIA_MASTER_SELECT = {
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

type SelectedSellpiaMaster = Prisma.MasterProductGetPayload<{
  select: typeof SELLPIA_MASTER_SELECT;
}>;

@Injectable()
export class SellpiaMasterProductReadRepositoryAdapter
implements SellpiaMasterProductReadRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findByIds(
    organizationId: string,
    ids: string[],
  ): Promise<SellpiaMasterProductReadModel[]> {
    return this.find({ organizationId, id: { in: ids } });
  }

  async findByCodes(
    organizationId: string,
    codes: string[],
  ): Promise<SellpiaMasterProductReadModel[]> {
    return this.findActive({ organizationId, code: { in: codes } });
  }

  async findByBarcodes(
    organizationId: string,
    barcodes: string[],
  ): Promise<SellpiaMasterProductReadModel[]> {
    return this.findActive({ organizationId, barcode: { in: barcodes } });
  }

  async findByNormalizedNames(
    organizationId: string,
    normalizedNames: string[],
  ): Promise<SellpiaMasterProductReadModel[]> {
    const rows = await this.prisma.$queryRaw<SelectedSellpiaMaster[]>(Prisma.sql`
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
      FROM master_products
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
  ): Promise<SellpiaMasterProductReadModel[]> {
    const rows = await this.prisma.masterProduct.findMany({
      where: {
        ...activeSellpiaWhere(organizationId),
        OR: [
          { code: { contains: query, mode: 'insensitive' } },
          { name: { contains: query, mode: 'insensitive' } },
          { optionName: { contains: query, mode: 'insensitive' } },
          { barcode: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: SELLPIA_MASTER_SELECT,
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
      take: Math.min(100, Math.max(1, Math.trunc(limit))),
    });
    return rows.map(toReadModel);
  }

  private async find(
    where: Prisma.MasterProductWhereInput,
  ): Promise<SellpiaMasterProductReadModel[]> {
    const rows = await this.prisma.masterProduct.findMany({
      where,
      select: SELLPIA_MASTER_SELECT,
    });
    return rows.map(toReadModel);
  }

  private findActive(
    where: Prisma.MasterProductWhereInput,
  ): Promise<SellpiaMasterProductReadModel[]> {
    return this.find({ ...where, isActive: true });
  }
}

function activeSellpiaWhere(organizationId: string): Prisma.MasterProductWhereInput {
  return {
    organizationId,
    isActive: true,
  };
}

function toReadModel(row: SelectedSellpiaMaster): SellpiaMasterProductReadModel {
  if (
    !row.code || !row.name
  ) {
    throw new Error(`Physical Sellpia Master ${row.id} is missing required fields`);
  }
  return {
    id: row.id,
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
