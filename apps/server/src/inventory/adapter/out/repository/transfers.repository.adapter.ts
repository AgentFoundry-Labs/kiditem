import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  CreateStockTransferData,
  StockTransferBareRow,
  StockTransferRow,
  TransfersRepositoryPort,
} from '../../../application/port/out/repository/transfers.repository.port';
import { readInventorySkuIdentities } from '../../../read/inventory-availability';

const TRANSFER_INCLUDE = {
  fromWarehouse: true,
  toWarehouse: true,
} as const;
type TransferRow = Prisma.StockTransferGetPayload<{
  include: typeof TRANSFER_INCLUDE;
}>;

@Injectable()
export class TransfersRepositoryAdapter implements TransfersRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  listStockTransfers(
    organizationId: string,
    status?: string,
  ): Promise<StockTransferRow[]> {
    const where: Prisma.StockTransferWhereInput = { organizationId };
    if (status) where.status = status;
    return this.prisma.$transaction(async (tx) =>
      hydrateInventorySkus(
        tx,
        await tx.stockTransfer.findMany({
          where,
          include: TRANSFER_INCLUDE,
          orderBy: { createdAt: 'desc' },
        }),
      ),
    );
  }

  async findInventorySkuForTransfer(
    sellpiaInventorySkuId: string,
    organizationId: string,
  ): Promise<{ optionName: string | null } | null> {
    return this.prisma.$transaction(async (tx) => {
      const [sku] = await readInventorySkuIdentities(tx, {
        organizationId,
        selector: { kind: 'ids', values: [sellpiaInventorySkuId] },
      });
      return sku?.isActive === true ? { optionName: sku.optionName } : null;
    });
  }

  async findWarehouseIdsForTransfer(
    warehouseIds: string[],
    organizationId: string,
  ): Promise<string[]> {
    const rows = await this.prisma.warehouse.findMany({
      where: {
        id: { in: warehouseIds },
        organizationId,
      },
      select: { id: true },
    });
    return rows.map(({ id }) => id);
  }

  async createStockTransfer(
    organizationId: string,
    data: CreateStockTransferData,
  ): Promise<StockTransferRow> {
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.stockTransfer.create({
        data: { organizationId, ...data },
        include: TRANSFER_INCLUDE,
      });
      return (await hydrateInventorySkus(tx, [created]))[0]!;
    });
  }

  findStockTransferById(
    id: string,
    organizationId: string,
  ): Promise<StockTransferBareRow | null> {
    return this.prisma.stockTransfer.findFirst({
      where: { id, organizationId },
    });
  }

  async updateStockTransferStatus(
    id: string,
    status: string,
    completed: boolean,
    organizationId: string,
  ): Promise<StockTransferRow> {
    const data: Prisma.StockTransferUpdateInput = { status };
    if (completed) data.completedAt = new Date();
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.stockTransfer.update({
        where: { id, organizationId },
        data,
        include: TRANSFER_INCLUDE,
      });
      return (await hydrateInventorySkus(tx, [updated]))[0]!;
    });
  }
}

async function hydrateInventorySkus(
  tx: Prisma.TransactionClient,
  rows: TransferRow[],
): Promise<StockTransferRow[]> {
  if (rows.length === 0) return [];
  const organizationIds = new Set(
    rows.map(({ organizationId }) => organizationId),
  );
  if (organizationIds.size !== 1)
    throw new Error('Stock transfers span organizations');
  const [organizationId] = organizationIds;
  const identities = await readInventorySkuIdentities(tx, {
    organizationId: organizationId!,
    selector: {
      kind: 'ids',
      values: [
        ...new Set(
          rows.map(({ sellpiaInventorySkuId }) => sellpiaInventorySkuId),
        ),
      ],
    },
  });
  const byId = new Map(
    identities.map((identity) => [identity.sellpiaInventorySkuId, identity]),
  );
  return rows.map((row) => {
    const identity = byId.get(row.sellpiaInventorySkuId);
    if (!identity)
      throw new Error('Stock transfer inventory SKU is unavailable');
    return {
      ...row,
      sellpiaInventorySku: {
        id: identity.sellpiaInventorySkuId,
        code: identity.code,
        name: identity.name,
        optionName: identity.optionName,
        barcode: identity.barcode,
      },
    };
  });
}
