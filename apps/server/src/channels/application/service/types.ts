import type { OrderSheetResponse } from '../port/out/coupang-provider.port';

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

/** Sync 입력 payload — single order sheet element (channel-sync.service 내부 타입). */
export type CoupangSyncOrderPayload = NonNullable<OrderSheetResponse['data']>[number];

/** Sync 입력 payload — single return request element (Coupang returnRequests endpoint 응답 한 건). */
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
