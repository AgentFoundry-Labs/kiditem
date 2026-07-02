import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  InventoryMetadataUpdateData,
  InventoryRepositoryPort,
  RocketLedgerEntry,
  RocketLedgerSourceRow,
  StockAndReservedDeltas,
  StockLedgerEntry,
} from '../../../application/port/out/repository/inventory.repository.port';
import type {
  InventoryRow,
  StockTransactionRow,
} from '../../../application/port/out/repository/inventory-query.repository.port';
import type { RepositoryTransaction } from '../../../application/port/out/transaction/repository-transaction';

// Sole site for Inventory write paths. Application code does not import
// PrismaService; it composes the use case via the methods here and owns the
// transaction boundary via `runInventoryStockMutation`.
@Injectable()
export class InventoryRepositoryAdapter implements InventoryRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  runTransaction<T>(
    op: (tx: RepositoryTransaction) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(
      (tx) => op(tx as RepositoryTransaction),
      { timeout: 15_000 },
    );
  }

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

  async ensureInventoryForOption(
    tx: RepositoryTransaction,
    organizationId: string,
    optionId: string,
  ): Promise<InventoryRow> {
    const prismaTx = tx as Prisma.TransactionClient;
    const option = await prismaTx.productOption.findFirst({
      where: { id: optionId, organizationId, isDeleted: false },
      select: { id: true, isBundle: true },
    });
    if (!option || option.isBundle) throw new NotFoundException('Product option not found');

    await prismaTx.$queryRaw`
      SELECT id FROM inventory
      WHERE option_id = ${optionId}::uuid
        AND organization_id = ${organizationId}::uuid
      FOR UPDATE
    `;

    const existing = await prismaTx.inventory.findFirst({
      where: { optionId, organizationId },
    });
    if (existing) return existing;

    return prismaTx.inventory.create({
      data: { organizationId, optionId, currentStock: 0 },
    });
  }

  async findRocketLedgerBySource(
    organizationId: string,
    sourceActionId: string,
    eventType: string,
  ): Promise<RocketLedgerSourceRow | null> {
    return this.prisma.rocketInventoryLedger.findFirst({
      where: { organizationId, sourceActionId, eventType },
      select: {
        id: true,
        inventoryId: true,
        optionId: true,
        quantity: true,
      },
    });
  }

  applyStockAndReservedDeltas(
    tx: RepositoryTransaction,
    inventoryId: string,
    deltas: StockAndReservedDeltas,
  ): Promise<InventoryRow> {
    const prismaTx = tx as Prisma.TransactionClient;
    return prismaTx.inventory.update({
      where: { id: inventoryId },
      data: {
        currentStock: { increment: deltas.stockDelta },
        reservedStock: { increment: deltas.reservedDelta },
        lastRestockedAt: deltas.stockDelta > 0 ? new Date() : undefined,
      },
    });
  }

  async appendRocketLedger(
    tx: RepositoryTransaction,
    entry: RocketLedgerEntry,
  ): Promise<{ id: string }> {
    const prismaTx = tx as Prisma.TransactionClient;
    return prismaTx.rocketInventoryLedger.create({
      data: entry,
      select: { id: true },
    });
  }
}
