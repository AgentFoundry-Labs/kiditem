import { Injectable } from '@nestjs/common';
import type {
  CoupangProviderPort,
  SellerProductListResponse,
  SellerProductDetailResponse,
  OrderSheetResponse,
} from '../../../application/port/out/coupang-provider.port';
import { ChannelAccountService } from '../../../application/service/channel-account.service';
import { getSellerProducts, getSellerProduct } from './products';
import {
  getOrderSheets,
  confirmOrderSheets,
  uploadInvoice,
  approveReturn,
  DELIVERY_COMPANIES,
} from './orders';

/**
 * Coupang provider outgoing adapter — implements CoupangProviderPort by
 * delegating to the functional helpers in the same folder. The functional
 * helpers stay exported as-is for the compat shim at adapters/coupang/orders.ts
 * to re-export (Wave H2 Lane C).
 */
@Injectable()
export class CoupangProviderAdapter implements CoupangProviderPort {
  constructor(private readonly channelAccounts: ChannelAccountService) {}

  getDeliveryCompanies() {
    return DELIVERY_COMPANIES;
  }

  async getSellerProducts(organizationId: string, params: {
    nextToken?: string;
    maxPerPage?: number;
    status?: string;
  }): Promise<SellerProductListResponse> {
    const credentials = await this.channelAccounts.resolveCoupangCredentials(organizationId);
    return getSellerProducts(credentials, params) as Promise<SellerProductListResponse>;
  }

  async getSellerProduct(
    organizationId: string,
    sellerProductId: string,
  ): Promise<SellerProductDetailResponse> {
    const credentials = await this.channelAccounts.resolveCoupangCredentials(organizationId);
    return getSellerProduct(credentials, sellerProductId) as Promise<SellerProductDetailResponse>;
  }

  async getOrderSheets(organizationId: string, params: {
    createdAtFrom: string;
    createdAtTo: string;
    status?: string;
    maxPerPage?: number;
    nextToken?: string;
  }): Promise<OrderSheetResponse> {
    const credentials = await this.channelAccounts.resolveCoupangCredentials(organizationId);
    return getOrderSheets(credentials, params) as Promise<OrderSheetResponse>;
  }

  async confirmOrderSheets(
    organizationId: string,
    shipmentBoxIds: number[],
  ): Promise<unknown> {
    const credentials = await this.channelAccounts.resolveCoupangCredentials(organizationId);
    return confirmOrderSheets(credentials, shipmentBoxIds);
  }

  async uploadInvoice(
    organizationId: string,
    shipmentBoxId: number,
    params: {
      deliveryCompanyCode: string;
      invoiceNumber: string;
    },
  ): Promise<unknown> {
    const credentials = await this.channelAccounts.resolveCoupangCredentials(organizationId);
    return uploadInvoice(credentials, shipmentBoxId, params);
  }

  async approveReturn(organizationId: string, receiptId: number): Promise<unknown> {
    const credentials = await this.channelAccounts.resolveCoupangCredentials(organizationId);
    return approveReturn(credentials, receiptId);
  }
}
