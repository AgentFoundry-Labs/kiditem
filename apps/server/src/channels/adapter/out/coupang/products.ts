import { coupangRequest, type CoupangCredentials } from './coupang-client';
import type { CoupangSellerProductPayload } from '../../../application/port/out/provider/coupang-provider.port';

const SELLER_PRODUCTS_PATH =
  '/v2/providers/seller_api/apis/api/v1/marketplace/seller-products';

export async function createSellerProduct(
  credentials: CoupangCredentials,
  payload: CoupangSellerProductPayload,
) {
  return coupangRequest({
    method: 'POST',
    credentials,
    path: SELLER_PRODUCTS_PATH,
    body: {
      ...payload,
      vendorId: credentials.vendorId,
    },
  });
}

export async function getSellerProducts(credentials: CoupangCredentials, params?: {
  nextToken?: string;
  maxPerPage?: number;
  status?: string;
}) {
  const query: Record<string, string> = {};

  if (params?.nextToken) query.nextToken = params.nextToken;
  if (params?.maxPerPage) query.maxPerPage = String(params.maxPerPage);
  if (params?.status) query.status = params.status;

  return coupangRequest({
    method: 'GET',
    path: SELLER_PRODUCTS_PATH,
    credentials,
    query: {
      vendorId: credentials.vendorId,
      ...query,
    },
  });
}

export async function getSellerProduct(credentials: CoupangCredentials, sellerProductId: string) {
  return coupangRequest({
    method: 'GET',
    credentials,
    path: `${SELLER_PRODUCTS_PATH}/${sellerProductId}`,
  });
}

export async function getSellerProductsByExternalVendorSku(
  credentials: CoupangCredentials,
  externalVendorSkuCode: string,
) {
  return coupangRequest({
    method: 'GET',
    credentials,
    path: `${SELLER_PRODUCTS_PATH}/external-vendor-sku-codes/${encodeURIComponent(externalVendorSkuCode)}`,
  });
}
