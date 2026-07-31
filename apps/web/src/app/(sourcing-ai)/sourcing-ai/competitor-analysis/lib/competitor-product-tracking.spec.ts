import { describe, expect, it } from "vitest";
import {
  buildCatalogTrackingInput,
  buildOverlapTrackingInput,
} from "./competitor-product-tracking";
import type {
  CompetitorSeller,
  CompetitorSellerCatalogProduct,
  CompetitorTrackedProduct,
} from "./competitor-tracking-api";

const seller: CompetitorSeller = {
  sellerKey: "id:seller-1",
  sellerName: "리틀아이",
  brandName: "리틀아이",
  sellerId: "seller-1",
  sellerStoreUrl: "https://shop.coupang.com/seller-1",
  sellerResolved: true,
  watchlisted: true,
  discoverySource: "kiditem",
  priorityScore: 90,
  overlapProductCount: 1,
  matchedOwnProductCount: 1,
  trackedKeywordCount: 1,
  top10Count: 1,
  organicExposureCount: 1,
  averageRank: 2,
  totalReviewCount: 120,
  recentChangeCount: 1,
  lastCapturedAt: "2026-07-29T00:00:00.000Z",
  products: [],
  catalog: null,
};

describe("competitor product tracking input", () => {
  it("maps a seller catalog product to the existing Wing tracker contract", () => {
    const product: CompetitorSellerCatalogProduct = {
      productKey: "vendor-1",
      productId: "product-1",
      itemId: "item-1",
      vendorItemId: "vendor-1",
      name: "리틀아이 초등 문구 선물 세트",
      link: "https://www.coupang.com/vp/products/product-1",
      imageUrl: "https://image.example/product-1.jpg",
      priceKrw: 12900,
      reviewCount: 240,
      sourceRank: 1,
      firstSeenAt: "2026-07-28T00:00:00.000Z",
      lastSeenAt: "2026-07-29T00:00:00.000Z",
      isNew: true,
    };

    expect(buildCatalogTrackingInput(product, seller)).toEqual({
      productId: "product-1",
      itemId: "item-1",
      vendorItemId: "vendor-1",
      productName: "리틀아이 초등 문구 선물 세트",
      imagePath: "https://image.example/product-1.jpg",
      brandName: "리틀아이",
      categoryHierarchy: null,
      sourceKeyword: "리틀아이 초등 문구 선물 세트",
      salePriceKrw: 12900,
      ratingCount: 240,
      ratingAverage: null,
      pvLast28Day: null,
      salesLast28d: null,
      estimatedRevenue28d: null,
      conversionRate28d: null,
    });
  });

  it("uses the originating search keyword and rating for an overlapping product", () => {
    const product: CompetitorTrackedProduct = {
      productKey: "vendor-2",
      productId: "product-2",
      vendorItemId: "vendor-2",
      name: "말랑이 랜덤 세트",
      link: "https://www.coupang.com/vp/products/product-2",
      imageUrl: "https://image.example/product-2.jpg",
      keywords: ["말랑이", "스퀴시"],
      rank: 2,
      isAd: false,
      priceKrw: 8900,
      reviewCount: 87,
      ratingScore: 4.7,
      rankChange: 1,
      priceChange: 0,
      reviewChange: 3,
      capturedAt: "2026-07-29T00:00:00.000Z",
      matchedOwnProducts: [],
    };

    expect(buildOverlapTrackingInput(product, seller)).toMatchObject({
      productId: "product-2",
      vendorItemId: "vendor-2",
      productName: "말랑이 랜덤 세트",
      sourceKeyword: "말랑이",
      salePriceKrw: 8900,
      ratingCount: 87,
      ratingAverage: 4.7,
    });
  });

  it("does not create an unusable tracker when Coupang productId is missing", () => {
    const product: CompetitorSellerCatalogProduct = {
      productKey: "vendor-only",
      productId: null,
      itemId: null,
      vendorItemId: "vendor-only",
      name: "식별자 미수집 상품",
      link: null,
      imageUrl: null,
      priceKrw: null,
      reviewCount: null,
      sourceRank: 1,
      firstSeenAt: "2026-07-29T00:00:00.000Z",
      lastSeenAt: "2026-07-29T00:00:00.000Z",
      isNew: false,
    };

    expect(buildCatalogTrackingInput(product, seller)).toBeNull();
  });
});
