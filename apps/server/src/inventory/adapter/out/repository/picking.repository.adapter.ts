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

const INVENTORY_SKU_INCLUDE = { sellpiaInventorySku: true } as const;
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
      const sellpiaInventorySkuIds = [...new Set(
        items.map((item) => item.sellpiaInventorySkuId),
      )];
      const inventorySkus = await tx.sellpiaInventorySku.findMany({
        where: {
          id: { in: sellpiaInventorySkuIds },
          organizationId,
          isActive: true,
        },
        select: { id: true },
      });
      if (inventorySkus.length !== sellpiaInventorySkuIds.length) {
        throw new NotFoundException('Sellpia inventory SKU not found');
      }
      const rows = items.map((item) => ({
        orderId: item.orderId,
        sellpiaInventorySkuId: item.sellpiaInventorySkuId,
        productName: item.productName,
        sku: item.sku ?? undefined,
        quantity: item.quantity,
        location: undefined,
      }));
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
