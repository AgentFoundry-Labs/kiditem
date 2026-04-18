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
} from '@kiditem/shared';
import type { Prisma } from '@prisma/client';
import type {
  ListInventoryQueryDto,
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

  // ===== Mutations placeholder — 다음 task =====
  // ===== Ledger placeholder — 다음 task =====
}
