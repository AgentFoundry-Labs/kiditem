import type {
  PickingItemRow,
  PickingListRow,
} from '../out/picking.repository.port';

export const PICKING_PORT = Symbol('PickingPort');

export type UpdatePickingItemInput = {
  isPicked?: boolean;
  isVerified?: boolean;
};

export interface PickingPort {
  findAll(companyId: string): Promise<PickingListRow[]>;
  generate(companyId: string): Promise<PickingListRow>;
  updateItem(
    listId: string,
    itemId: string,
    companyId: string,
    dto: UpdatePickingItemInput,
  ): Promise<PickingItemRow>;
  complete(id: string, companyId: string): Promise<PickingListRow>;
}
