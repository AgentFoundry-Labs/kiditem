import type { PickableItem } from '../../../../domain/policy/picking-rules';

export const PICKING_REPOSITORY_PORT = Symbol('PickingRepositoryPort');

export type PickingItemRow = {
  id: string;
  pickingListId: string;
  orderId: string | null;
  masterProductId: string | null;
  productName: string;
  sku: string | null;
  quantity: number;
  location: string | null;
  isPicked: boolean;
  isVerified: boolean;
  pickedAt: Date | null;
  verifiedAt: Date | null;
  createdAt: Date;
  masterProduct: {
    id: string;
    code: string;
    name: string;
    optionName: string | null;
    barcode: string | null;
  } | null;
};

export type PickingListRow = {
  id: string;
  organizationId: string;
  listNumber: string;
  status: string;
  totalItems: number;
  pickedItems: number;
  assignedTo: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  items: PickingItemRow[];
};

export type PickingItemUpdateData = {
  isPicked?: boolean;
  isVerified?: boolean;
  pickedAt?: Date | null;
  verifiedAt?: Date | null;
};

export interface PickingRepositoryPort {
  listPickingLists(organizationId: string): Promise<PickingListRow[]>;

  createPickingList(
    organizationId: string,
    listNumber: string,
    items: PickableItem[],
  ): Promise<PickingListRow>;

  findPickingListOwnerId(id: string, organizationId: string): Promise<{ id: string } | null>;

  findPickingItemInList(itemId: string, listId: string): Promise<PickingItemRow | null>;

  updatePickingItem(
    itemId: string,
    data: PickingItemUpdateData,
  ): Promise<PickingItemRow>;

  countPickedItems(listId: string): Promise<number>;

  writePickedCount(listId: string, count: number): Promise<void>;

  completePickingList(id: string, organizationId: string): Promise<PickingListRow>;
}
