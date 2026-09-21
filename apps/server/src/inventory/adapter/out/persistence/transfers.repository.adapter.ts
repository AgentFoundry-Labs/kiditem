import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { PRODUCT_TRANSACTIONAL_READ_PORT, type ProductTransactionalReadPort } from '../../../../products/application/port/in/product-transactional-read.port';
import type { Prisma } from '@prisma/client';
import type {
  CreateStockTransferData,
  StockTransferRow,
  TransfersRepositoryPort,
} from '../../../application/port/out/persistence/transfers.repository.port';

const TRANSFER_INCLUDE = {
  fromWarehouse: true,
  toWarehouse: true,
} as const;
type TransferRow = Prisma.StockTransferGetPayload<{
  include: typeof TRANSFER_INCLUDE;
}>;

@Injectable()
export class TransfersRepositoryAdapter implements TransfersRepositoryPort {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PRODUCT_TRANSACTIONAL_READ_PORT)
    private readonly products: ProductTransactionalReadPort,
  ) {}

  listStockTransfers(
    organizationId: string,
    status?: string,
  ): Promise<StockTransferRow[]> {
    const where: Prisma.StockTransferWhereInput = { organizationId };
    if (status) where.status = status;
    return this.prisma.$transaction(async (tx) =>
      hydrateProducts(
        this.products, tx,
        await tx.stockTransfer.findMany({
          where,
          include: TRANSFER_INCLUDE,
          orderBy: { createdAt: 'desc' },
        }),
      ),
    );
  }

  async findProductForTransfer(
    masterProductId: string,
    organizationId: string,
  ): Promise<{ optionName: string | null } | null> {
    return this.prisma.$transaction(async (tx) => {
      const [sku] = await this.products.readSourceIdentities({ client: tx }, {
        organizationId,
        selector: { kind: 'ids', values: [masterProductId] },
      });
      return sku ? { optionName: sku.optionName } : null;
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
      return (await hydrateProducts(this.products, tx, [created]))[0]!;
    });
  }

}

async function hydrateProducts(
  products: ProductTransactionalReadPort,
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
  const identities = await products.readSourceIdentities({ client: tx }, {
    organizationId: organizationId!,
    selector: {
      kind: 'ids',
      values: [
        ...new Set(
          rows.flatMap(({ masterProductId }) => masterProductId ? [masterProductId] : []),
        ),
      ],
    },
  });
  const byId = new Map(
    identities.map((identity) => [identity.masterProductId, identity]),
  );
  return rows.map((row) => {
    const identity = row.masterProductId ? byId.get(row.masterProductId) : undefined;
    return {
      ...row,
      masterProduct: identity
        ? {
            id: identity.masterProductId,
            code: identity.code,
            name: identity.name,
            optionName: identity.optionName,
            barcode: identity.barcode,
          }
        : null,
    };
  });
}
