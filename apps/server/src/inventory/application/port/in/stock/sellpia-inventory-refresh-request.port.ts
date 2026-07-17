export interface SellpiaInventoryRefreshRequestPort {
  requestRefresh(input: {
    organizationId: string;
    reason: 'order_transmission_requested' | 'purchase_preflight';
  }): Promise<void>;
}

export const SELLPIA_INVENTORY_REFRESH_REQUEST_PORT = Symbol(
  'SELLPIA_INVENTORY_REFRESH_REQUEST_PORT',
);
