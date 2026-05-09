import { coupangRequest, type CoupangCredentials } from './coupang-client';

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
    path: `/v2/providers/seller_api/apis/api/v1/marketplace/seller-products`,
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
    path: `/v2/providers/seller_api/apis/api/v1/marketplace/seller-products/${sellerProductId}`,
  });
}
