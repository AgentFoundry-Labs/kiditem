import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  PICKING_PORT,
  type PickingPort,
  type UpdatePickingItemInput,
} from '../port/in/picking.port';
import {
  PICKING_REPOSITORY_PORT,
  type PickingItemRow,
  type PickingItemUpdateData,
  type PickingListRow,
  type PickingRepositoryPort,
} from '../port/out/picking.repository.port';
import {
  CONFIRMED_ORDERS_PORT,
  type ConfirmedOrdersPort,
} from '../port/out/confirmed-orders.port';
import { extractPickableItems } from '../../domain/policy/picking-rules';

export { PICKING_PORT } from '../port/in/picking.port';

@Injectable()
export class PickingService implements PickingPort {
  constructor(
    @Inject(PICKING_REPOSITORY_PORT)
    private readonly repository: PickingRepositoryPort,
    @Inject(CONFIRMED_ORDERS_PORT)
    private readonly confirmedOrders: ConfirmedOrdersPort,
  ) {}

  findAll(companyId: string): Promise<PickingListRow[]> {
    return this.repository.listPickingLists(companyId);
  }

  async generate(companyId: string): Promise<PickingListRow> {
    const orders = await this.confirmedOrders.findConfirmedOrdersForPicking(companyId);
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
    return this.repository.createPickingList(companyId, listNumber, items);
  }

  async updateItem(
    listId: string,
    itemId: string,
    companyId: string,
    dto: UpdatePickingItemInput,
  ): Promise<PickingItemRow> {
    // PickingItem has no companyId column — verify ownership via PickingList (IDOR guard).
    const list = await this.repository.findPickingListOwnerId(listId, companyId);
    if (!list) {
      throw new NotFoundException('피킹 리스트를 찾을 수 없습니다');
    }

    const item = await this.repository.findPickingItemInList(itemId, listId);
    if (!item) {
      throw new BadRequestException('피킹 아이템을 찾을 수 없습니다');
    }

    const data: PickingItemUpdateData = {};
    if (dto.isPicked !== undefined) {
      data.isPicked = dto.isPicked;
      if (dto.isPicked) data.pickedAt = new Date();
    }
    if (dto.isVerified !== undefined) {
      data.isVerified = dto.isVerified;
      if (dto.isVerified) data.verifiedAt = new Date();
    }

    const updated = await this.repository.updatePickingItem(itemId, data);

    const pickedCount = await this.repository.countPickedItems(listId);
    await this.repository.writePickedCount(listId, pickedCount);

    return updated;
  }

  async complete(id: string, companyId: string): Promise<PickingListRow> {
    // Tenant guard lives inside the repository adapter (so the scoped read
    // and bare-id update sit in the same function for check:tenant-scope).
    return this.repository.completePickingList(id, companyId);
  }
}
