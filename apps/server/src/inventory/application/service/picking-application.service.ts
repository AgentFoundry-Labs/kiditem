import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PickingPersistence } from '../../adapter/out/prisma/picking.persistence';
import type { PickingItemRow, PickingListRow } from '../../adapter/out/prisma/picking.persistence';
import { extractPickableItems } from '../../domain/policy/picking-rules';

export type UpdatePickingItemInput = {
  isPicked?: boolean;
  isVerified?: boolean;
};

@Injectable()
export class PickingApplicationService {
  constructor(private readonly persistence: PickingPersistence) {}

  findAll(companyId: string): Promise<PickingListRow[]> {
    return this.persistence.listPickingLists(companyId);
  }

  async generate(companyId: string): Promise<PickingListRow> {
    const orders = await this.persistence.findConfirmedOrdersForPicking(companyId);
    if (orders.length === 0) {
      throw new BadRequestException('피킹 대상 주문이 없습니다 (status=confirmed)');
    }

    const { items, skippedCount } = extractPickableItems(orders);
    if (items.length === 0) {
      throw new BadRequestException(
        `매칭된 SKU 가 없습니다 (skipped: ${skippedCount}). vendorItemId ChannelListingOption 매핑 확인.`,
      );
    }

    const listNumber = `PK-${Date.now()}`;
    return this.persistence.createPickingList(companyId, listNumber, items);
  }

  async updateItem(
    listId: string,
    itemId: string,
    companyId: string,
    dto: UpdatePickingItemInput,
  ): Promise<PickingItemRow> {
    // PickingItem has no companyId column — verify ownership via PickingList (IDOR guard).
    const list = await this.persistence.findPickingListOwnerId(listId, companyId);
    if (!list) {
      throw new NotFoundException('피킹 리스트를 찾을 수 없습니다');
    }

    const item = await this.persistence.findPickingItemInList(itemId, listId);
    if (!item) {
      throw new BadRequestException('피킹 아이템을 찾을 수 없습니다');
    }

    const data: Record<string, unknown> = {};
    if (dto.isPicked !== undefined) {
      data.isPicked = dto.isPicked;
      if (dto.isPicked) data.pickedAt = new Date();
    }
    if (dto.isVerified !== undefined) {
      data.isVerified = dto.isVerified;
      if (dto.isVerified) data.verifiedAt = new Date();
    }

    const updated = await this.persistence.updatePickingItem(itemId, data);

    const pickedCount = await this.persistence.countPickedItems(listId);
    await this.persistence.writePickedCount(listId, pickedCount);

    return updated;
  }

  async complete(id: string, companyId: string): Promise<PickingListRow> {
    // Tenant guard lives inside persistence (so the scoped read + bare-id
    // update sit in the same function for check:tenant-scope).
    return this.persistence.completePickingList(id, companyId);
  }
}
