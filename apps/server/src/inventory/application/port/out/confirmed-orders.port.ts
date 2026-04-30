import type { PickingSourceOrder } from '../../../domain/policy/picking-rules';

export const CONFIRMED_ORDERS_PORT = Symbol('ConfirmedOrdersPort');

// Cross-owner-domain read port: confirmed orders are owned by the orders
// domain. Inventory consumes the read snapshot to seed picking lists.
export interface ConfirmedOrdersPort {
  findConfirmedOrdersForPicking(companyId: string): Promise<PickingSourceOrder[]>;
}
