import type {
  PickingItemRow,
  PickingListRow,
} from '../out/repository/picking.repository.port';

export const PICKING_PORT = Symbol('PickingPort');

export type UpdatePickingItemInput = {
  isPicked?: boolean;
  isVerified?: boolean;
};

export interface PickingPort {
  findAll(organizationId: string): Promise<PickingListRow[]>;
  generate(organizationId: string): Promise<PickingListRow>;
  updateItem(
    listId: string,
    itemId: string,
    organizationId: string,
    dto: UpdatePickingItemInput,
  ): Promise<PickingItemRow>;
  complete(id: string, organizationId: string): Promise<PickingListRow>;
}
