import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type { InventoryRow, StockTransactionRow } from './inventory.query';

// All Inventory write paths flow through this adapter. Application code does
// not import PrismaService; it composes the use case via the methods here and
// owns the transaction boundary via `runInventoryStockMutation`.
@Injectable()
export class InventoryPersistence {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Update tenant-safe inventory metadata fields. The bound check prevents
   * cross-tenant updates by reading via `findFirst({ id, companyId })` first.
   */
  async updateInventoryMetadata(
    id: string,
    companyId: string,
    data: Prisma.InventoryUpdateInput,
  ): Promise<InventoryRow> {
    const existing = await this.prisma.inventory.findFirst({ where: { id, companyId } });
    if (!existing) throw new NotFoundException('Inventory not found');
    return this.prisma.inventory.update({ where: { id }, data });
  }

  /**
   * Open a $transaction, take a Postgres row lock on the inventory row scoped
   * by tenant, fetch the row again to assert ownership, and hand both `tx` and
   * the locked row to the caller. Caller does the policy check + writes.
   *
   * Owning the lock + read in this adapter (not the application service)
   * keeps PrismaService imports and raw SQL inside `adapter/out/prisma/**`.
   */
  async runInventoryStockMutation<T>(
    inventoryId: string,
    companyId: string,
    op: (
      tx: Prisma.TransactionClient,
      lockedRow: InventoryRow,
    ) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`
          SELECT id FROM inventory
          WHERE id = ${inventoryId}::uuid
            AND company_id = ${companyId}::uuid
          FOR UPDATE
        `;

        const inv = await tx.inventory.findFirst({
          where: { id: inventoryId, companyId },
        });
        if (!inv) throw new NotFoundException('Inventory not found');

        return op(tx, inv);
      },
      { timeout: 15_000 },
    );
  }

  applyStockDelta(
    tx: Prisma.TransactionClient,
    id: string,
    delta: number,
    bumpLastRestockedAt: boolean,
    previousLastRestockedAt: Date | null,
  ): Promise<InventoryRow> {
    return tx.inventory.update({
      where: { id },
      data: {
        currentStock: { increment: delta },
        lastRestockedAt: bumpLastRestockedAt ? new Date() : previousLastRestockedAt,
      },
    });
  }

  async findOptionNameForLedger(
    tx: Prisma.TransactionClient,
    optionId: string,
    companyId: string,
  ): Promise<string | null> {
    const opt = await tx.productOption.findFirst({
      where: { id: optionId, companyId },
      select: { optionName: true },
    });
    return opt?.optionName ?? null;
  }

  appendStockLedger(
    tx: Prisma.TransactionClient,
    entry: {
      companyId: string;
      optionId: string;
      optionName: string | null;
      type: string;
      quantity: number;
      unitCost: number;
      totalCost: number;
      warehouseId?: string;
      relatedId?: string;
      relatedType?: string;
      note?: string;
      createdBy: string;
    },
  ): Promise<StockTransactionRow> {
    return tx.stockTransaction.create({ data: entry });
  }
}
