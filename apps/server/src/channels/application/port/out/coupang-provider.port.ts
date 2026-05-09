export const COUPANG_PROVIDER_PORT = Symbol('COUPANG_PROVIDER_PORT');

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

export interface DeliveryCompany {
  code: string;
  name: string;
}

export interface CoupangProviderPort {
  getDeliveryCompanies(): readonly DeliveryCompany[];
  getSellerProducts(organizationId: string, params: {
    nextToken?: string;
    maxPerPage?: number;
    status?: string;
  }): Promise<SellerProductListResponse>;
  getSellerProduct(organizationId: string, sellerProductId: string): Promise<SellerProductDetailResponse>;
  getOrderSheets(organizationId: string, params: {
    createdAtFrom: string;
    createdAtTo: string;
    status?: string;
    maxPerPage?: number;
    nextToken?: string;
  }): Promise<OrderSheetResponse>;
  confirmOrderSheets(organizationId: string, shipmentBoxIds: number[]): Promise<unknown>;
  uploadInvoice(
    organizationId: string,
    shipmentBoxId: number,
    params: {
      deliveryCompanyCode: string;
      invoiceNumber: string;
    },
  ): Promise<unknown>;
  approveReturn(organizationId: string, receiptId: number): Promise<unknown>;
}
