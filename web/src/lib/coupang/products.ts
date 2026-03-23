import { coupangRequest, getVendorId } from "./client";

// 셀러 상품 목록 조회
export async function getSellerProducts(params?: {
  vendorId?: string;
  nextToken?: string;
  maxPerPage?: number;
  status?: string; // APPROVED, ON_SALE, etc.
}) {
  const vendorId = params?.vendorId || getVendorId();
  const query: Record<string, string> = {};

  if (params?.nextToken) query.nextToken = params.nextToken;
  if (params?.maxPerPage) query.maxPerPage = String(params.maxPerPage);
  if (params?.status) query.status = params.status;

  return coupangRequest({
    method: "GET",
    path: `/v2/providers/seller_api/apis/api/v1/marketplace/seller-products`,
    query: {
      vendorId,
      ...query,
    },
  });
}

// 특정 상품 상세 조회
export async function getSellerProduct(sellerProductId: string) {
  return coupangRequest({
    method: "GET",
    path: `/v2/providers/seller_api/apis/api/v1/marketplace/seller-products/${sellerProductId}`,
  });
}

// 상품 가격 변경
export async function updateProductPrice(
  vendorItemId: string,
  price: number
) {
  return coupangRequest({
    method: "PUT",
    path: `/v2/providers/seller_api/apis/api/v1/marketplace/vendor-items/${vendorItemId}/prices/${price}`,
  });
}

// 상품 판매 중지
export async function stopSellingProduct(vendorItemId: string) {
  return coupangRequest({
    method: "PUT",
    path: `/v2/providers/seller_api/apis/api/v1/marketplace/vendor-items/${vendorItemId}/sales/stop`,
  });
}

// 상품 판매 재개
export async function resumeSellingProduct(vendorItemId: string) {
  return coupangRequest({
    method: "PUT",
    path: `/v2/providers/seller_api/apis/api/v1/marketplace/vendor-items/${vendorItemId}/sales/resume`,
  });
}
