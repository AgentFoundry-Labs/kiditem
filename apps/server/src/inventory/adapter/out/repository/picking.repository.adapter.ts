import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type { PickableItem } from '../../../domain/policy/picking-rules';
import type {
  PickingItemRow,
  PickingItemUpdateData,
  PickingListRow,
  PickingRepositoryPort,
} from '../../../application/port/out/picking.repository.port';

const LIST_WITH_ITEMS_INCLUDE = { items: true } as const;

@Injectable()
export class PickingRepositoryAdapter implements PickingRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  listPickingLists(companyId: string): Promise<PickingListRow[]> {
    return this.prisma.pickingList.findMany({
      where: { companyId },
      include: LIST_WITH_ITEMS_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  createPickingList(
    companyId: string,
    listNumber: string,
    items: PickableItem[],
  ): Promise<PickingListRow> {
    return this.prisma.pickingList.create({
      data: {
        companyId,
        listNumber,
        totalItems: items.length,
        items: {
          create: items.map((it) => ({
            orderId: it.orderId,
            optionId: it.optionId,
            productName: it.productName,
            sku: it.sku ?? undefined,
            quantity: it.quantity,
            location: undefined,
          })),
        },
      },
      include: LIST_WITH_ITEMS_INCLUDE,
    });
  }

  findPickingListOwnerId(id: string, companyId: string): Promise<{ id: string } | null> {
    return this.prisma.pickingList.findFirst({
      where: { id, companyId },
      select: { id: true },
    });
  }

  findPickingItemInList(
    itemId: string,
    listId: string,
  ): Promise<PickingItemRow | null> {
    return this.prisma.pickingItem.findFirst({
      where: { id: itemId, pickingListId: listId },
    });
  }

  updatePickingItem(
    itemId: string,
    data: PickingItemUpdateData,
  ): Promise<PickingItemRow> {
    const prismaData: Prisma.PickingItemUpdateInput = data;
    return this.prisma.pickingItem.update({ where: { id: itemId }, data: prismaData });
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

  async completePickingList(id: string, companyId: string): Promise<PickingListRow> {
    // Tenant guard + write live in the same function so check:tenant-scope sees
    // the scoped read before the bare-id update.
    const list = await this.prisma.pickingList.findFirst({
      where: { id, companyId },
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
