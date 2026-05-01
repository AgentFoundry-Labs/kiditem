import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  InventoryMetadataUpdateData,
  InventoryRepositoryPort,
  StockLedgerEntry,
} from '../../../application/port/out/inventory.repository.port';
import type {
  InventoryRow,
  StockTransactionRow,
} from '../../../application/port/out/inventory-query.repository.port';
import type { RepositoryTransaction } from '../../../application/port/out/repository-transaction';

// Sole site for Inventory write paths. Application code does not import
// PrismaService; it composes the use case via the methods here and owns the
// transaction boundary via `runInventoryStockMutation`.
@Injectable()
export class InventoryRepositoryAdapter implements InventoryRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async updateInventoryMetadata(
    id: string,
    organizationId: string,
    data: InventoryMetadataUpdateData,
  ): Promise<InventoryRow> {
    const existing = await this.prisma.inventory.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException('Inventory not found');
    return this.prisma.inventory.update({ where: { id }, data });
  }

  // Open a $transaction, take a Postgres row lock on the inventory row scoped
  // by tenant, fetch the row again to assert ownership, and hand both `tx` and
  // the locked row to the caller. Caller does the policy check + writes.
  async runInventoryStockMutation<T>(
    inventoryId: string,
    organizationId: string,
    op: (tx: RepositoryTransaction, lockedRow: InventoryRow) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`
          SELECT id FROM inventory
          WHERE id = ${inventoryId}::uuid
            AND organization_id = ${organizationId}::uuid
          FOR UPDATE
        `;

        const inv = await tx.inventory.findFirst({
          where: { id: inventoryId, organizationId },
        });
        if (!inv) throw new NotFoundException('Inventory not found');

        return op(tx as RepositoryTransaction, inv);
      },
      { timeout: 15_000 },
    );
  }

  applyStockDelta(
    tx: RepositoryTransaction,
    id: string,
    delta: number,
    bumpLastRestockedAt: boolean,
    previousLastRestockedAt: Date | null,
  ): Promise<InventoryRow> {
    const prismaTx = tx as Prisma.TransactionClient;
    return prismaTx.inventory.update({
      where: { id },
      data: {
        currentStock: { increment: delta },
        lastRestockedAt: bumpLastRestockedAt ? new Date() : previousLastRestockedAt,
      },
    });
  }

  async findOptionNameForLedger(
    tx: RepositoryTransaction,
    optionId: string,
    organizationId: string,
  ): Promise<string | null> {
    const prismaTx = tx as Prisma.TransactionClient;
    const opt = await prismaTx.productOption.findFirst({
      where: { id: optionId, organizationId },
      select: { optionName: true },
    });
    return opt?.optionName ?? null;
  }

  appendStockLedger(
    tx: RepositoryTransaction,
    entry: StockLedgerEntry,
  ): Promise<StockTransactionRow> {
    const prismaTx = tx as Prisma.TransactionClient;
    return prismaTx.stockTransaction.create({ data: entry });
  }
}
