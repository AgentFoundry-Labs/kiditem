import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  Inventory,
  InventoryListResponse,
  StockOperationResult,
  StockTransactionType,
  TransactionListResponse,
  TransactionSummary,
  UpdateInventoryMetadataInput,
  ReceiveStockInput,
  IssueStockInput,
  AdjustStockInput,
} from '@kiditem/shared/inventory';
import { BundleStockService } from '../../../products/application/service/bundle-stock.service';
import { InventoryQuery } from '../../adapter/out/prisma/inventory.query';
import { InventoryPersistence } from '../../adapter/out/prisma/inventory.persistence';
import {
  assertSufficientStock,
  computeStoredQuantity,
  deriveStockDelta,
  InsufficientStockError,
} from '../../domain/policy/stock-mutation';
import {
  toInventory,
  toInventoryListItem,
  summarizeInventory,
} from '../../mapper/inventory.mapper';
import { toTransactionListItem } from '../../mapper/stock-transaction.mapper';
import { BadRequestException } from '@nestjs/common';

export type ListInventoryInput = {
  page?: number;
  limit?: number;
  status?: 'healthy' | 'low' | 'out';
  optionId?: string;
  masterId?: string;
};

export type ListTransactionsInput = {
  page?: number;
  limit?: number;
  optionId?: string;
  type?: StockTransactionType;
  from?: string;
  to?: string;
};

export type TransactionSummaryInput = {
  days?: number;
};

@Injectable()
export class InventoryApplicationService {
  constructor(
    private readonly query: InventoryQuery,
    private readonly persistence: InventoryPersistence,
    private readonly bundleStock: BundleStockService,
  ) {}

  // ===== Reads =====
  async list(input: ListInventoryInput, companyId: string): Promise<InventoryListResponse> {
    const page = input.page ?? 1;
    const limit = input.limit ?? 50;
    const skip = (page - 1) * limit;

    const { rows, dbCount } = await this.query.listInventoryWithOption(companyId, {
      optionId: input.optionId,
      masterId: input.masterId,
    });

    const mapped = rows.map(toInventoryListItem);
    const filtered = input.status
      ? mapped.filter((i) => i.status === input.status)
      : mapped;
    const items = filtered.slice(skip, skip + limit);
    const total = input.status ? filtered.length : dbCount;

    return {
      items,
      total,
      page,
      limit,
      summary: summarizeInventory(mapped),
    };
  }

  async findById(id: string, companyId: string): Promise<Inventory> {
    const row = await this.query.findInventoryById(id, companyId);
    if (!row) throw new NotFoundException('Inventory not found');
    return toInventory(row);
  }

  async findByOptionId(optionId: string, companyId: string): Promise<Inventory> {
    const row = await this.query.findInventoryByOptionId(optionId, companyId);
    if (!row) throw new NotFoundException('Inventory not found');
    return toInventory(row);
  }

  // ===== Metadata =====
  async updateMetadata(
    id: string,
    dto: UpdateInventoryMetadataInput,
    companyId: string,
  ): Promise<Inventory> {
    const data: Record<string, unknown> = {};
    if (dto.safetyStock !== undefined) data.safetyStock = dto.safetyStock;
    if (dto.reorderPoint !== undefined) data.reorderPoint = dto.reorderPoint;
    if (dto.reorderQuantity !== undefined) data.reorderQuantity = dto.reorderQuantity;
    if (dto.leadTimeDays !== undefined) data.leadTimeDays = dto.leadTimeDays;
    if (dto.warehouseLocation !== undefined) data.warehouseLocation = dto.warehouseLocation;

    const updated = await this.persistence.updateInventoryMetadata(id, companyId, data);
    return toInventory(updated);
  }

  // ===== Mutations =====
  receive(
    id: string,
    dto: ReceiveStockInput,
    companyId: string,
    userId: string,
  ): Promise<StockOperationResult> {
    return this.applyDelta(id, companyId, {
      type: 'RECEIVE',
      delta: dto.quantity,
      unitCost: dto.unitCost ?? 0,
      warehouseId: dto.warehouseId,
      note: dto.note,
      userId,
    });
  }

  issue(
    id: string,
    dto: IssueStockInput,
    companyId: string,
    userId: string,
  ): Promise<StockOperationResult> {
    return this.applyDelta(id, companyId, {
      type: 'ISSUE',
      delta: -dto.quantity,
      unitCost: 0,
      warehouseId: dto.warehouseId,
      relatedId: dto.relatedId,
      relatedType: dto.relatedType,
      note: dto.note,
      userId,
    });
  }

  adjust(
    id: string,
    dto: AdjustStockInput,
    companyId: string,
    userId: string,
  ): Promise<StockOperationResult> {
    return this.applyDelta(id, companyId, {
      type: 'ADJUST',
      delta: dto.delta,
      unitCost: 0,
      note: dto.reason,
      userId,
    });
  }

  // The application service owns the use case; the persistence adapter owns
  // the transaction + row lock. Domain policy decides whether the delta is
  // legal. Bundle fan-out is composed inside the same tx via the products port.
  private async applyDelta(
    id: string,
    companyId: string,
    params: {
      type: StockTransactionType;
      delta: number;
      unitCost: number;
      warehouseId?: string;
      relatedId?: string;
      relatedType?: string;
      note?: string;
      userId: string;
    },
  ): Promise<StockOperationResult> {
    return this.persistence.runInventoryStockMutation(id, companyId, async (tx, locked) => {
      try {
        assertSufficientStock(locked.currentStock, params.delta);
      } catch (err) {
        if (err instanceof InsufficientStockError) {
          throw new BadRequestException(err.message);
        }
        throw err;
      }

      const updated = await this.persistence.applyStockDelta(
        tx,
        id,
        params.delta,
        params.type === 'RECEIVE',
        locked.lastRestockedAt,
      );

      const optionName = await this.persistence.findOptionNameForLedger(
        tx,
        updated.optionId,
        companyId,
      );

      const storedQuantity = computeStoredQuantity(params.type, params.delta);

      const transaction = await this.persistence.appendStockLedger(tx, {
        companyId,
        optionId: updated.optionId,
        optionName,
        type: params.type,
        quantity: storedQuantity,
        unitCost: params.unitCost,
        totalCost: params.unitCost * Math.abs(params.delta),
        warehouseId: params.warehouseId,
        relatedId: params.relatedId,
        relatedType: params.relatedType,
        note: params.note,
        createdBy: params.userId,
      });

      const recomputedBundleOptionIds = await this.bundleStock.recomputeForComponent(
        companyId,
        updated.optionId,
        tx,
      );

      return {
        inventory: toInventory(updated),
        transaction: {
          id: transaction.id,
          optionId: transaction.optionId,
          type: transaction.type as StockTransactionType,
          quantity: transaction.quantity,
          stockDelta: deriveStockDelta(transaction.type as StockTransactionType, transaction.quantity),
          unitCost: transaction.unitCost,
          createdAt: transaction.createdAt.toISOString(),
        },
        recomputedBundleOptionIds,
      };
    });
  }

  // ===== Ledger =====
  async listTransactions(
    input: ListTransactionsInput,
    companyId: string,
  ): Promise<TransactionListResponse> {
    const page = input.page ?? 1;
    const limit = input.limit ?? 50;
    const skip = (page - 1) * limit;

    const { rows, total } = await this.query.listStockTransactions(
      companyId,
      {
        optionId: input.optionId,
        type: input.type,
        from: input.from,
        to: input.to,
      },
      skip,
      limit,
    );

    return {
      items: rows.map(toTransactionListItem),
      total,
      page,
      limit,
    };
  }

  async getTransactionSummary(
    input: TransactionSummaryInput,
    companyId: string,
  ): Promise<TransactionSummary> {
    const days = input.days ?? 30;
    const fromDate = new Date(Date.now() - days * 86400000);
    const grouped = await this.query.groupTransactionsByType(companyId, fromDate);

    const lookup = Object.fromEntries(
      grouped.map((g) => [g.type, { qty: g._sum.quantity ?? 0, amt: g._sum.totalCost ?? 0 }]),
    );

    return {
      inQty: lookup.RECEIVE?.qty ?? 0,
      outQty: lookup.ISSUE?.qty ?? 0,
      adjustQty: lookup.ADJUST?.qty ?? 0,
      inAmount: lookup.RECEIVE?.amt ?? 0,
      outAmount: lookup.ISSUE?.amt ?? 0,
    };
  }
}
