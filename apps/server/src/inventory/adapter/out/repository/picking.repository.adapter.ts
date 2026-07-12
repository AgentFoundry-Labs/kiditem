import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type { PickableItem } from '../../../domain/policy/picking-rules';
import type {
  PickingItemRow,
  PickingItemUpdateData,
  PickingListRow,
  PickingRepositoryPort,
} from '../../../application/port/out/repository/picking.repository.port';

const INVENTORY_SKU_INCLUDE = { inventorySku: true } as const;
const LIST_WITH_ITEMS_INCLUDE = {
  items: { include: INVENTORY_SKU_INCLUDE },
} as const;

@Injectable()
export class PickingRepositoryAdapter implements PickingRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  listPickingLists(organizationId: string): Promise<PickingListRow[]> {
    return this.prisma.pickingList.findMany({
      where: { organizationId },
      include: LIST_WITH_ITEMS_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async createPickingList(
    organizationId: string,
    listNumber: string,
    items: PickableItem[],
  ): Promise<PickingListRow> {
    return this.prisma.$transaction(async (tx) => {
      const inventoryIds = [...new Set(items.map((item) => item.inventorySkuId))];
      const inventorySkus = await tx.inventorySku.findMany({
        where: { id: { in: inventoryIds }, organizationId },
        select: { id: true, sellpiaProductCode: true },
      });
      if (inventorySkus.length !== inventoryIds.length) {
        throw new NotFoundException('InventorySku not found');
      }
      const codes = [...new Set(inventorySkus.map((row) => row.sellpiaProductCode))];
      const legacyOptions = await tx.productOption.findMany({
        where: {
          organizationId,
          isDeleted: false,
          legacyCode: { in: codes },
        },
        select: { id: true, legacyCode: true, sku: true },
      });
      const optionByCode = new Map<string, string>();
      for (const option of legacyOptions) {
        if (option.legacyCode) {
          optionByCode.set(option.legacyCode, option.id);
        }
      }
      const fallbackCodes = codes.filter((code) => !optionByCode.has(code));
      if (fallbackCodes.length > 0) {
        const skuOptions = await tx.productOption.findMany({
          where: {
            organizationId,
            isDeleted: false,
            sku: { in: fallbackCodes },
          },
          select: { id: true, sku: true },
        });
        for (const option of skuOptions) {
          optionByCode.set(option.sku, option.id);
        }
      }
      const inventoryById = new Map(inventorySkus.map((row) => [row.id, row]));
      const rows = items.map((item) => {
        const inventory = inventoryById.get(item.inventorySkuId)!;
        const optionId = optionByCode.get(inventory.sellpiaProductCode);
        if (!optionId) {
          throw new NotFoundException(
            `Legacy ProductOption mapping not found for ${inventory.sellpiaProductCode}`,
          );
        }
        return {
          organizationId,
          orderId: item.orderId,
          optionId,
          inventorySkuId: item.inventorySkuId,
          productName: item.productName,
          sku: item.sku ?? undefined,
          quantity: item.quantity,
          location: undefined,
        };
      });
      return tx.pickingList.create({
        data: {
          organizationId,
          listNumber,
          totalItems: items.length,
          items: { create: rows },
        },
        include: LIST_WITH_ITEMS_INCLUDE,
      });
    });
  }

  findPickingListOwnerId(id: string, organizationId: string): Promise<{ id: string } | null> {
    return this.prisma.pickingList.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });
  }

  findPickingItemInList(
    itemId: string,
    listId: string,
  ): Promise<PickingItemRow | null> {
    return this.prisma.pickingItem.findFirst({
      where: { id: itemId, pickingListId: listId },
      include: INVENTORY_SKU_INCLUDE,
    });
  }

  updatePickingItem(
    itemId: string,
    data: PickingItemUpdateData,
  ): Promise<PickingItemRow> {
    const prismaData: Prisma.PickingItemUpdateInput = data;
    return this.prisma.pickingItem.update({
      where: { id: itemId },
      data: prismaData,
      include: INVENTORY_SKU_INCLUDE,
    });
  }

  countPickedItems(listId: string): Promise<number> {
    return this.prisma.pickingItem.count({
      where: { pickingListId: listId, isPicked: true },
    });
  }

  async writePickedCount(listId: string, count: number): Promise<void> {
    await this.prisma.pickingList.update({
      where: { id: listId },
      data: { pickedItems: count },
    });
  }

  async completePickingList(id: string, organizationId: string): Promise<PickingListRow> {
    // Tenant guard + write live in the same function so check:tenant-scope sees
    // the scoped read before the bare-id update.
    const list = await this.prisma.pickingList.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });
    if (!list) throw new NotFoundException('피킹 리스트를 찾을 수 없습니다');
    return this.prisma.pickingList.update({
      where: { id },
      data: { status: 'completed', completedAt: new Date() },
      include: LIST_WITH_ITEMS_INCLUDE,
    });
  }
}
