import { coupangRequest, getVendorId } from './client';

export async function getSellerProducts(params?: {
  vendorId?: string;
  nextToken?: string;
  maxPerPage?: number;
  status?: string;
}) {
  const vendorId = params?.vendorId || getVendorId();
  const query: Record<string, string> = {};

  if (params?.nextToken) query.nextToken = params.nextToken;
  if (params?.maxPerPage) query.maxPerPage = String(params.maxPerPage);
  if (params?.status) query.status = params.status;

  return coupangRequest({
    method: 'GET',
    path: `/v2/providers/seller_api/apis/api/v1/marketplace/seller-products`,
    query: {
      vendorId,
      ...query,
    },
  });
}

export async function getSellerProduct(sellerProductId: string) {
  return coupangRequest({
    method: 'GET',
    path: `/v2/providers/seller_api/apis/api/v1/marketplace/seller-products/${sellerProductId}`,
  });
}

export async function updateProductPrice(
  vendorItemId: string,
  price: number,
) {
  return coupangRequest({
    method: 'PUT',
    path: `/v2/providers/seller_api/apis/api/v1/marketplace/vendor-items/${vendorItemId}/prices/${price}`,
  });
}

export async function stopSellingProduct(vendorItemId: string) {
  return coupangRequest({
    method: 'PUT',
    path: `/v2/providers/seller_api/apis/api/v1/marketplace/vendor-items/${vendorItemId}/sales/stop`,
  });
}

export async function resumeSellingProduct(vendorItemId: string) {
  return coupangRequest({
    method: 'PUT',
    path: `/v2/providers/seller_api/apis/api/v1/marketplace/vendor-items/${vendorItemId}/sales/resume`,
  });
}
