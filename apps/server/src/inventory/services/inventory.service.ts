import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BundleStockService } from '../../products/services/bundle-stock.service';
import { toSerializable } from '../../products/util/serialize';
import type {
  Inventory,
  InventoryListItem,
  InventorySummary,
  InventoryListResponse,
  InventoryStatus,
  UpdateInventoryMetadataInput,
  ReceiveStockInput,
  IssueStockInput,
  AdjustStockInput,
  StockOperationResult,
  StockTransactionType,
  TransactionListItem,
  TransactionListResponse,
  TransactionSummary,
} from '@kiditem/shared';
import type { Prisma } from '@prisma/client';
import type {
  ListInventoryQueryDto,
  ListTransactionsQueryDto,
  TransactionSummaryQueryDto,
} from '../dto';

function deriveStatus(currentStock: number, reorderPoint: number): InventoryStatus {
  if (currentStock <= 0) return 'out';
  if (currentStock <= reorderPoint) return 'low';
  return 'healthy';
}

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bundleStock: BundleStockService,
  ) {}

  // ===== Reads =====
  async list(query: ListInventoryQueryDto, companyId: string): Promise<InventoryListResponse> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const skip = (page - 1) * limit;

    const where: Prisma.InventoryWhereInput = { companyId };
    if (query.optionId) where.optionId = query.optionId;
    if (query.masterId) where.option = { masterId: query.masterId };

    const [rows, dbCount] = await Promise.all([
      this.prisma.inventory.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          option: {
            include: { master: { select: { name: true } } },
          },
        },
      }),
      this.prisma.inventory.count({ where }),
    ]);

    const mapped = rows.map((r) => {
      const availableStock = r.option.isBundle ? (r.option.availableStock ?? 0) : r.currentStock;
      const status = deriveStatus(r.currentStock, r.reorderPoint);
      return {
        id: r.id,
        optionId: r.optionId,
        masterId: r.option.masterId,
        sku: r.option.sku,
        masterName: r.option.master.name,
        optionName: r.option.optionName,
        kind: r.option.isBundle ? 'BUNDLE' : 'SIMPLE',
        currentStock: r.currentStock,
        availableStock,
        safetyStock: r.safetyStock,
        reorderPoint: r.reorderPoint,
        leadTimeDays: r.leadTimeDays,
        warehouseLocation: r.warehouseLocation,
        status,
      } satisfies InventoryListItem;
    });

    const filtered = query.status ? mapped.filter((i) => i.status === query.status) : mapped;
    const items = filtered.slice(skip, skip + limit);
    const total = query.status ? filtered.length : dbCount;

    const summary: InventorySummary = {
      total: mapped.length,
      healthy: mapped.filter((i) => i.status === 'healthy').length,
      low: mapped.filter((i) => i.status === 'low').length,
      out: mapped.filter((i) => i.status === 'out').length,
    };

    return {
      items,
      total,
      page,
      limit,
      summary,
    } satisfies InventoryListResponse;
  }

  async findById(id: string, companyId: string): Promise<Inventory> {
    const inv = await this.prisma.inventory.findFirst({ where: { id, companyId } });
    if (!inv) throw new NotFoundException('Inventory not found');
    return toSerializable(inv) as Inventory;
  }

  async findByOptionId(optionId: string, companyId: string): Promise<Inventory> {
    const inv = await this.prisma.inventory.findFirst({ where: { optionId, companyId } });
    if (!inv) throw new NotFoundException('Inventory not found');
    return toSerializable(inv) as Inventory;
  }

  // ===== Metadata =====
  async updateMetadata(
    id: string,
    dto: UpdateInventoryMetadataInput,
    companyId: string,
  ): Promise<Inventory> {
    const existing = await this.prisma.inventory.findFirst({ where: { id, companyId } });
    if (!existing) throw new NotFoundException('Inventory not found');

    const data: Prisma.InventoryUpdateInput = {};
    if (dto.safetyStock !== undefined) data.safetyStock = dto.safetyStock;
    if (dto.reorderPoint !== undefined) data.reorderPoint = dto.reorderPoint;
    if (dto.reorderQuantity !== undefined) data.reorderQuantity = dto.reorderQuantity;
    if (dto.leadTimeDays !== undefined) data.leadTimeDays = dto.leadTimeDays;
    if (dto.warehouseLocation !== undefined) data.warehouseLocation = dto.warehouseLocation;

    const updated = await this.prisma.inventory.update({
      where: { id },
      data,
    });
    return toSerializable(updated) as Inventory;
  }

  // ===== Mutations =====
  async receive(
    id: string,
    dto: ReceiveStockInput,
    companyId: string,
    userId: string,
  ) {
    return this.applyDelta(id, dto.quantity, {
      type: 'RECEIVE',
      unitCost: dto.unitCost ?? 0,
      warehouseId: dto.warehouseId,
      note: dto.note,
      userId,
    }, companyId);
  }

  async issue(
    id: string,
    dto: IssueStockInput,
    companyId: string,
    userId: string,
  ) {
    return this.applyDelta(id, -dto.quantity, {
      type: 'ISSUE',
      unitCost: 0,
      warehouseId: dto.warehouseId,
      relatedId: dto.relatedId,
      relatedType: dto.relatedType,
      note: dto.note,
      userId,
    }, companyId);
  }

  async adjust(
    id: string,
    dto: AdjustStockInput,
    companyId: string,
    userId: string,
  ) {
    return this.applyDelta(id, dto.delta, {
      type: 'ADJUST',
      unitCost: 0,
      note: dto.reason,
      userId,
    }, companyId);
  }

  private async applyDelta(
    id: string,
    delta: number,
    txParams: {
      type: 'RECEIVE' | 'ISSUE' | 'ADJUST';
      unitCost: number;
      warehouseId?: string;
      relatedId?: string;
      relatedType?: string;
      note?: string;
      userId: string;
    },
    companyId: string,
  ): Promise<StockOperationResult> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM inventory WHERE id = ${id}::uuid FOR UPDATE`;

      const inv = await tx.inventory.findFirst({ where: { id, companyId } });
      if (!inv) throw new NotFoundException('Inventory not found');

      const nextStock = inv.currentStock + delta;
      if (nextStock < 0) {
        throw new BadRequestException(
          `insufficient stock (current=${inv.currentStock}, delta=${delta})`,
        );
      }

      const updated = await tx.inventory.update({
        where: { id },
        data: {
          currentStock: { increment: delta },
          lastRestockedAt: txParams.type === 'RECEIVE' ? new Date() : inv.lastRestockedAt,
        },
      });

      const option = await tx.productOption.findUnique({
        where: { id: updated.optionId },
        select: { optionName: true },
      });

      const transaction = await tx.stockTransaction.create({
        data: {
          companyId,
          optionId: updated.optionId,
          optionName: option?.optionName ?? null,
          type: txParams.type,
          quantity: Math.abs(delta),
          unitCost: txParams.unitCost,
          totalCost: txParams.unitCost * Math.abs(delta),
          warehouseId: txParams.warehouseId,
          relatedId: txParams.relatedId,
          relatedType: txParams.relatedType,
          note: txParams.note,
          createdBy: txParams.userId,
        },
      });

      const recomputedBundleOptionIds = await this.bundleStock.recomputeForComponent(
        updated.optionId,
        tx,
      );

      return {
        inventory: toSerializable(updated) as Inventory,
        transaction: {
          id: transaction.id,
          optionId: transaction.optionId,
          type: transaction.type as StockTransactionType,
          quantity: transaction.quantity,
          unitCost: transaction.unitCost,
          createdAt: transaction.createdAt.toISOString(),
        },
        recomputedBundleOptionIds,
      } satisfies StockOperationResult;
    }, { timeout: 15_000 });
  }

  // ===== Ledger =====
  async listTransactions(
    query: ListTransactionsQueryDto,
    companyId: string,
  ): Promise<TransactionListResponse> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const skip = (page - 1) * limit;

    const where: Prisma.StockTransactionWhereInput = { companyId };
    if (query.optionId) where.optionId = query.optionId;
    if (query.type) where.type = query.type;
    if (query.from || query.to) {
      const dateFilter: { gte?: Date; lte?: Date } = {};
      if (query.from) dateFilter.gte = new Date(query.from);
      if (query.to) dateFilter.lte = new Date(query.to);
      where.createdAt = dateFilter;
    }

    const [rows, total] = await Promise.all([
      this.prisma.stockTransaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.stockTransaction.count({ where }),
    ]);

    const items = rows.map((r) => ({
      id: r.id,
      optionId: r.optionId,
      optionName: r.optionName,
      type: r.type as StockTransactionType,
      quantity: r.quantity,
      unitCost: r.unitCost,
      totalCost: r.totalCost,
      warehouseId: r.warehouseId,
      relatedId: r.relatedId,
      relatedType: r.relatedType,
      note: r.note,
      createdBy: r.createdBy,
      createdAt: r.createdAt.toISOString(),
    } satisfies TransactionListItem));

    return { items, total, page, limit } satisfies TransactionListResponse;
  }

  async getTransactionSummary(
    query: TransactionSummaryQueryDto,
    companyId: string,
  ): Promise<TransactionSummary> {
    const days = query.days ?? 30;
    const from = new Date(Date.now() - days * 86400000);

    const grouped = await this.prisma.stockTransaction.groupBy({
      by: ['type'],
      where: { companyId, createdAt: { gte: from } },
      _sum: { quantity: true, totalCost: true },
    });

    const lookup = Object.fromEntries(
      grouped.map((g) => [g.type, { qty: g._sum.quantity ?? 0, amt: g._sum.totalCost ?? 0 }]),
    );

    return {
      inQty: lookup.RECEIVE?.qty ?? 0,
      outQty: lookup.ISSUE?.qty ?? 0,
      adjustQty: lookup.ADJUST?.qty ?? 0,
      inAmount: lookup.RECEIVE?.amt ?? 0,
      outAmount: lookup.ISSUE?.amt ?? 0,
    } satisfies TransactionSummary;
  }
}
