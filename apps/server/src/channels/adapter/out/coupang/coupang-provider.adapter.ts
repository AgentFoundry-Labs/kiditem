import { Injectable } from '@nestjs/common';
import type {
  CoupangProviderPort,
  SellerProductListResponse,
  SellerProductDetailResponse,
  OrderSheetResponse,
} from '../../../application/port/out/coupang-provider.port';
import { getVendorId } from './coupang-client';
import { getSellerProducts, getSellerProduct } from './products';
import { getOrderSheets } from './orders';

/**
 * Coupang provider outgoing adapter — implements CoupangProviderPort by
 * delegating to the functional helpers in the same folder. The functional
 * helpers stay exported as-is for the compat shim at adapters/coupang/orders.ts
 * to re-export (Wave H2 Lane C).
 */
@Injectable()
export class CoupangProviderAdapter implements CoupangProviderPort {
  getVendorId(): string {
    return getVendorId();
  }

  async getSellerProducts(params: {
    nextToken?: string;
    maxPerPage?: number;
    status?: string;
    vendorId?: string;
  }): Promise<SellerProductListResponse> {
    return getSellerProducts(params) as Promise<SellerProductListResponse>;
  }

  async getSellerProduct(sellerProductId: string): Promise<SellerProductDetailResponse> {
    return getSellerProduct(sellerProductId) as Promise<SellerProductDetailResponse>;
  }

  async getOrderSheets(params: {
    createdAtFrom: string;
    createdAtTo: string;
    status?: string;
    maxPerPage?: number;
    nextToken?: string;
  }): Promise<OrderSheetResponse> {
    return getOrderSheets(params) as Promise<OrderSheetResponse>;
  }
}
