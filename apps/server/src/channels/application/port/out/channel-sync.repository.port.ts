import type { OrderSheetResponse } from './coupang-provider.port';

export const CHANNEL_SYNC_REPOSITORY_PORT = Symbol('CHANNEL_SYNC_REPOSITORY_PORT');

export interface SyncResult {
  synced: number;
  errors: number;
  details?: string[];
}

export interface HealthResult {
  connected: boolean;
  vendorId: string;
  error?: string;
}

export type CoupangSyncOrderPayload = NonNullable<OrderSheetResponse['data']>[number];

export interface CoupangSyncReturnPayload {
  receiptId: string | number;
  receiptType?: 'RETURN' | 'EXCHANGE' | string;
  receiptStatus?: string;
  orderId?: string | number | null;
  cancelReason?: string;
  cancelReasonCategory1?: string | null;
  cancelReasonCategory2?: string | null;
  faultByType?: string;
  requesterName?: string;
  enclosePrice?: number | null;
  requestedAt: string;
  completedAt?: string | null;
  reasonCode?: string | null;
  reasonCodeText?: string | null;
  returnDeliveryId?: string | null;
  items?: Array<{
    productName?: string;
    vendorItemName?: string;
    quantity?: number;
    [k: string]: unknown;
  }>;
}

export interface ProductListingSyncResult {
  synced: boolean;
  detail?: string;
}

export interface ChannelSyncRepositoryPort {
  getPrimaryCoupangAccountId(organizationId: string): Promise<string | null>;

  syncSingleProductListing(input: {
    organizationId: string;
    sellerProductId: string;
    channelAccountId: string | null;
  }): Promise<ProductListingSyncResult>;

  updateSingleProductListing(input: {
    organizationId: string;
    sellerProductId: string;
    channelAccountId: string | null;
    detail: {
      sellerProductName?: string | null;
      statusName?: string | null;
      deliveryChargeType?: string | null;
      freeShipOverAmount?: number | null;
      returnCharge?: number | null;
      deliveryInfo?: unknown;
      items?: Array<{
        vendorItemId?: string | number | null;
        itemName?: string | null;
        salePrice?: number | null;
      }> | null;
    };
  }): Promise<void>;

  syncSingleOrder(
    organizationId: string,
    payload: CoupangSyncOrderPayload,
  ): Promise<void>;

  syncSingleReturn(
    organizationId: string,
    payload: CoupangSyncReturnPayload,
  ): Promise<void>;
}
