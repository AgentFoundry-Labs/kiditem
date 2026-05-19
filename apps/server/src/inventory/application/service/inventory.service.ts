import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  AdjustStockInput,
  Inventory,
  InventoryListResponse,
  IssueStockInput,
  ReceiveStockInput,
  StockOperationResult,
  StockTransactionType,
  TransactionListResponse,
  TransactionSummary,
  UpdateInventoryMetadataInput,
} from '@kiditem/shared/inventory';
import {
  INVENTORY_PORT,
  type InventoryPort,
  type ListInventoryInput,
  type ListTransactionsInput,
  type TransactionSummaryInput,
} from '../port/in/inventory.port';
import {
  INVENTORY_QUERY_REPOSITORY_PORT,
  type InventoryQueryRepositoryPort,
} from '../port/out/repository/inventory-query.repository.port';
import {
  INVENTORY_REPOSITORY_PORT,
  type InventoryMetadataUpdateData,
  type InventoryRepositoryPort,
} from '../port/out/repository/inventory.repository.port';
import {
  BUNDLE_STOCK_PORT,
  type BundleStockPort,
} from '../port/out/cross-domain/bundle-stock.port';
import {
  assertSufficientStock,
  computeStoredQuantity,
  deriveStockDelta,
  InsufficientStockError,
} from '../../domain/policy/stock-mutation';
import {
  toInventory,
  toInventoryListItem,
  toInventoryAssetItem,
  summarizeInventory,
  summarizeInventoryAssets,
} from '../../mapper/inventory.mapper';
import { toTransactionListItem } from '../../mapper/stock-transaction.mapper';

// `INVENTORY_PORT` re-export so adapter modules can import the token from a
// service-adjacent path without reaching into `application/port/in/**` directly.
export { INVENTORY_PORT } from '../port/in/inventory.port';

@Injectable()
export class InventoryService implements InventoryPort {
  constructor(
    @Inject(INVENTORY_QUERY_REPOSITORY_PORT)
    private readonly query: InventoryQueryRepositoryPort,
    @Inject(INVENTORY_REPOSITORY_PORT)
    private readonly repository: InventoryRepositoryPort,
    @Inject(BUNDLE_STOCK_PORT)
    private readonly bundleStock: BundleStockPort,
  ) {}

  // ===== Reads =====
  async list(input: ListInventoryInput, organizationId: string): Promise<InventoryListResponse> {
    const page = input.page ?? 1;
    const limit = input.limit ?? 50;
    const skip = (page - 1) * limit;

    const { rows, dbCount } = await this.query.listInventoryWithOption(organizationId, {
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

  async getAssetReport(organizationId: string) {
    const { rows } = await this.query.listInventoryWithOption(organizationId, {
      optionId: undefined,
      masterId: undefined,
    });
    const items = rows
      .map(toInventoryAssetItem)
      .sort((a, b) => b.stockValue - a.stockValue);

    return {
      summary: summarizeInventoryAssets(items),
      items,
    };
  }

  async findById(id: string, organizationId: string): Promise<Inventory> {
    const row = await this.query.findInventoryById(id, organizationId);
    if (!row) throw new NotFoundException('Inventory not found');
    return toInventory(row);
  }

  async findByOptionId(optionId: string, organizationId: string): Promise<Inventory> {
    const row = await this.query.findInventoryByOptionId(optionId, organizationId);
    if (!row) throw new NotFoundException('Inventory not found');
    return toInventory(row);
  }

  // ===== Metadata =====
  async updateMetadata(
    id: string,
    dto: UpdateInventoryMetadataInput,
    organizationId: string,
  ): Promise<Inventory> {
    const data: InventoryMetadataUpdateData = {};
    if (dto.safetyStock !== undefined) data.safetyStock = dto.safetyStock;
    if (dto.reorderPoint !== undefined) data.reorderPoint = dto.reorderPoint;
    if (dto.reorderQuantity !== undefined) data.reorderQuantity = dto.reorderQuantity;
    if (dto.leadTimeDays !== undefined) data.leadTimeDays = dto.leadTimeDays;
    if (dto.warehouseLocation !== undefined) data.warehouseLocation = dto.warehouseLocation;

    const updated = await this.repository.updateInventoryMetadata(id, organizationId, data);
    return toInventory(updated);
  }

  // ===== Mutations =====
  receive(
    id: string,
    dto: ReceiveStockInput,
    organizationId: string,
    userId: string,
  ): Promise<StockOperationResult> {
    return this.applyDelta(id, organizationId, {
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
    organizationId: string,
    userId: string,
  ): Promise<StockOperationResult> {
    return this.applyDelta(id, organizationId, {
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
    organizationId: string,
    userId: string,
  ): Promise<StockOperationResult> {
    return this.applyDelta(id, organizationId, {
      type: 'ADJUST',
      delta: dto.delta,
      unitCost: 0,
      note: dto.reason,
      userId,
    });
  }

  // The application service owns the use case; the repository adapter owns the
  // transaction + row lock. Domain policy decides whether the delta is legal.
  // Bundle fan-out is composed inside the same tx via the products port.
  private async applyDelta(
    id: string,
    organizationId: string,
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
    return this.repository.runInventoryStockMutation(id, organizationId, async (tx, locked) => {
      try {
        assertSufficientStock(locked.currentStock, params.delta);
      } catch (err) {
        if (err instanceof InsufficientStockError) {
          throw new BadRequestException(err.message);
        }
        throw err;
      }

      const updated = await this.repository.applyStockDelta(
        tx,
        id,
        params.delta,
        params.type === 'RECEIVE',
        locked.lastRestockedAt,
      );

      const optionName = await this.repository.findOptionNameForLedger(
        tx,
        updated.optionId,
        organizationId,
      );

      const storedQuantity = computeStoredQuantity(params.type, params.delta);

      const transaction = await this.repository.appendStockLedger(tx, {
        organizationId,
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
        organizationId,
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
    organizationId: string,
  ): Promise<TransactionListResponse> {
    const page = input.page ?? 1;
    const limit = input.limit ?? 50;
    const skip = (page - 1) * limit;

    const { rows, total } = await this.query.listStockTransactions(
      organizationId,
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
    organizationId: string,
  ): Promise<TransactionSummary> {
    const days = input.days ?? 30;
    const fromDate = new Date(Date.now() - days * 86400000);
    const grouped = await this.query.groupTransactionsByType(organizationId, fromDate);

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
