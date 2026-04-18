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

/** Coupang Wing API — seller product list (undocumented response shape) */
export interface SellerProductListResponse {
  code: string;
  message: string;
  data?: {
    nextToken?: string;
    content?: Array<{
      sellerProductId: number;
      sellerProductName: string;
      displayCategoryCode?: number;
      statusName?: string;
      brand?: string;
    }>;
  };
}

/** Coupang Wing API — seller product detail (undocumented response shape) */
export interface SellerProductDetailResponse {
  code: string;
  message: string;
  data?: {
    sellerProductId: number;
    sellerProductName: string;
    displayCategoryCode?: number;
    statusName?: string;
    brand?: string;
    deliveryChargeType?: string;
    freeShipOverAmount?: number;
    returnCharge?: number;
    deliveryInfo?: Record<string, unknown>;
    items?: Array<{
      vendorItemId: number;
      itemName: string;
      originalPrice: number;
      salePrice: number;
      supplyPrice?: number;
      maximumBuyCount?: number;
      maximumBuyForPerson?: number;
    }>;
    images?: Array<{
      imageOrder: number;
      imageType: string;
      cdnPath: string;
    }>;
  };
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

/** Coupang Wing API — order sheet list (undocumented response shape) */
export interface OrderSheetResponse {
  code: string;
  message: string;
  data?: Array<{
    shipmentBoxId: number;
    orderId: number;
    orderedAt: string;
    paidAt?: string;
    status: string;
    shippingPrice?: number;
    remotePrice?: number;
    remoteArea?: boolean;
    deliveryCompanyName?: string;
    invoiceNumber?: string;
    parcelPrintMessage?: string;
    orderer?: {
      name?: string;
      email?: string;
      phone?: string;
      safeNumber?: string;
    };
    receiver?: {
      name?: string;
      phone?: string;
      safeNumber?: string;
      addr1?: string;
      addr2?: string;
      postCode?: string;
    };
    orderItems?: Array<{
      vendorItemId: number;
      vendorItemName: string;
      sellerProductId?: number;
      sellerProductName?: string;
      shippingCount: number;
      salesPrice: number;
      orderPrice: number;
      instantCouponDiscount?: number;
    }>;
  }>;
}
