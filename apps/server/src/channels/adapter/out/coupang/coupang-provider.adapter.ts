import { Inject, Injectable } from '@nestjs/common';
import type {
  CoupangProviderPort,
  CoupangCreateSellerProductResponse,
  CoupangSellerProductPayload,
  SellerProductListResponse,
  SellerProductDetailResponse,
  SellerProductExternalSkuResponse,
  OrderSheetResponse,
} from '../../../application/port/out/provider/coupang-provider.port';
import {
  COUPANG_CREDENTIALS_PORT,
  type CoupangCredentialsPort,
} from '../../../application/port/out/repository/channel-account.repository.port';
import {
  createSellerProduct,
  getSellerProducts,
  getSellerProduct,
  getSellerProductsByExternalVendorSku,
} from './products';
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
  constructor(
    @Inject(COUPANG_CREDENTIALS_PORT)
    private readonly credentials: CoupangCredentialsPort,
  ) {}

  getDeliveryCompanies() {
    return DELIVERY_COMPANIES;
  }

  async createSellerProduct(
    organizationId: string,
    payload: CoupangSellerProductPayload,
    channelAccountId?: string,
    beforeDispatch?: () => Promise<void>,
  ): Promise<CoupangCreateSellerProductResponse> {
    const credentials = channelAccountId
      ? await this.credentials.resolveCoupangCredentials(organizationId, channelAccountId)
      : await this.credentials.resolveCoupangCredentials(organizationId);
    return createSellerProduct(
      credentials,
      payload,
      beforeDispatch,
    ) as Promise<CoupangCreateSellerProductResponse>;
  }

  async getSellerProducts(organizationId: string, params: {
    nextToken?: string;
    maxPerPage?: number;
    status?: string;
  }): Promise<SellerProductListResponse> {
    const credentials = await this.credentials.resolveCoupangCredentials(organizationId);
    return getSellerProducts(credentials, params) as Promise<SellerProductListResponse>;
  }

  async getSellerProduct(
    organizationId: string,
    sellerProductId: string,
    channelAccountId?: string,
  ): Promise<SellerProductDetailResponse> {
    const credentials = channelAccountId
      ? await this.credentials.resolveCoupangCredentials(organizationId, channelAccountId)
      : await this.credentials.resolveCoupangCredentials(organizationId);
    return getSellerProduct(credentials, sellerProductId) as Promise<SellerProductDetailResponse>;
  }

  async getSellerProductsByExternalVendorSku(
    organizationId: string,
    externalVendorSkuCode: string,
    channelAccountId?: string,
  ): Promise<SellerProductExternalSkuResponse> {
    const credentials = channelAccountId
      ? await this.credentials.resolveCoupangCredentials(organizationId, channelAccountId)
      : await this.credentials.resolveCoupangCredentials(organizationId);
    return getSellerProductsByExternalVendorSku(
      credentials,
      externalVendorSkuCode,
    ) as Promise<SellerProductExternalSkuResponse>;
  }

  async getOrderSheets(organizationId: string, channelAccountId: string, params: {
    createdAtFrom: string;
    createdAtTo: string;
    status?: string;
    maxPerPage?: number;
    nextToken?: string;
  }): Promise<OrderSheetResponse> {
    const credentials = await this.credentials.resolveCoupangCredentials(
      organizationId,
      channelAccountId,
    );
    return getOrderSheets(credentials, params) as Promise<OrderSheetResponse>;
  }

  async confirmOrderSheets(
    organizationId: string,
    channelAccountId: string,
    shipmentBoxIds: number[],
  ): Promise<unknown> {
    const credentials = await this.credentials.resolveCoupangCredentials(
      organizationId,
      channelAccountId,
    );
    return confirmOrderSheets(credentials, shipmentBoxIds);
  }

  async uploadInvoice(
    organizationId: string,
    channelAccountId: string,
    shipmentBoxId: number,
    params: {
      deliveryCompanyCode: string;
      invoiceNumber: string;
    },
  ): Promise<unknown> {
    const credentials = await this.credentials.resolveCoupangCredentials(
      organizationId,
      channelAccountId,
    );
    return uploadInvoice(credentials, shipmentBoxId, params);
  }

  async approveReturn(
    organizationId: string,
    channelAccountId: string,
    receiptId: number,
  ): Promise<unknown> {
    const credentials = await this.credentials.resolveCoupangCredentials(
      organizationId,
      channelAccountId,
    );
    return approveReturn(credentials, receiptId);
  }
}
