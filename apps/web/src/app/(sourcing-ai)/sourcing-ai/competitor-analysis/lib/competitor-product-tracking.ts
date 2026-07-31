import type { AddWingTrackedProductInput } from "../../lib/wing-tracking-api";
import type {
  CompetitorSeller,
  CompetitorSellerCatalogProduct,
  CompetitorTrackedProduct,
} from "./competitor-tracking-api";

export function buildCatalogTrackingInput(
  product: CompetitorSellerCatalogProduct,
  seller: CompetitorSeller,
): AddWingTrackedProductInput | null {
  if (!product.productId) return null;
  return {
    productId: product.productId,
    itemId: product.itemId,
    vendorItemId: product.vendorItemId,
    productName: bounded(product.name, 300),
    imagePath: nullableBounded(product.imageUrl, 500),
    brandName: nullableBounded(seller.brandName ?? seller.sellerName, 200),
    categoryHierarchy: null,
    sourceKeyword: trackingKeyword(product.name),
    salePriceKrw: product.priceKrw,
    ratingCount: product.reviewCount,
    ratingAverage: null,
    pvLast28Day: null,
    salesLast28d: null,
    estimatedRevenue28d: null,
    conversionRate28d: null,
  };
}

export function buildOverlapTrackingInput(
  product: CompetitorTrackedProduct,
  seller: CompetitorSeller,
): AddWingTrackedProductInput | null {
  if (!product.productId) return null;
  return {
    productId: product.productId,
    itemId: null,
    vendorItemId: product.vendorItemId,
    productName: bounded(product.name, 300),
    imagePath: nullableBounded(product.imageUrl, 500),
    brandName: nullableBounded(seller.brandName ?? seller.sellerName, 200),
    categoryHierarchy: null,
    sourceKeyword: trackingKeyword(product.keywords[0] ?? product.name),
    salePriceKrw: product.priceKrw,
    ratingCount: product.reviewCount,
    ratingAverage: product.ratingScore,
    pvLast28Day: null,
    salesLast28d: null,
    estimatedRevenue28d: null,
    conversionRate28d: null,
  };
}

function trackingKeyword(value: string): string | null {
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized ? bounded(normalized, 120) : null;
}

function nullableBounded(
  value: string | null | undefined,
  maxLength: number,
): string | null {
  return value ? bounded(value, maxLength) : null;
}

function bounded(value: string, maxLength: number): string {
  return value.slice(0, maxLength);
}
