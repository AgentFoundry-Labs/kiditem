import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CompetitorSellerDetail } from "./CompetitorSellerDetail";
import type { CompetitorSeller } from "../lib/competitor-tracking-api";

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
  products: [
    {
      productKey: "overlap-vendor",
      productId: "overlap-product",
      vendorItemId: "overlap-vendor",
      name: "겹침 상품",
      link: "https://www.coupang.com/vp/products/overlap-product",
      imageUrl: null,
      keywords: ["말랑이"],
      rank: 2,
      isAd: false,
      priceKrw: 8900,
      reviewCount: 87,
      ratingScore: 4.7,
      rankChange: null,
      priceChange: null,
      reviewChange: null,
      capturedAt: "2026-07-29T00:00:00.000Z",
      matchedOwnProducts: [
        {
          vendorItemId: "own-vendor",
          skuId: "own-sku",
          productName: "내 상품",
          category: "문구",
          score: 90,
          sharedTerms: ["말랑이"],
        },
      ],
    },
  ],
  catalog: {
    sellerStoreUrl: "https://shop.coupang.com/seller-1",
    sort: "newest",
    totalProductCount: 1,
    collectedProductCount: 1,
    isTruncated: false,
    newProductCount: 1,
    lastCapturedAt: "2026-07-29T00:00:00.000Z",
    products: [
      {
        productKey: "catalog-vendor",
        productId: "catalog-product",
        itemId: "catalog-item",
        vendorItemId: "catalog-vendor",
        name: "카탈로그 상품",
        link: "https://www.coupang.com/vp/products/catalog-product",
        imageUrl: null,
        priceKrw: 12900,
        reviewCount: 240,
        sourceRank: 1,
        firstSeenAt: "2026-07-29T00:00:00.000Z",
        lastSeenAt: "2026-07-29T00:00:00.000Z",
        isNew: true,
      },
    ],
  },
};

describe("CompetitorSellerDetail product tracking", () => {
  it("adds a tracking action beside products in both seller product views", () => {
    const onTrackProduct = vi.fn();
    render(
      <CompetitorSellerDetail
        seller={seller}
        trackedProductIds={new Set()}
        trackingProductId={null}
        trackingPending={false}
        onTrackProduct={onTrackProduct}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "카탈로그 상품 추적" }),
    );
    expect(onTrackProduct).toHaveBeenCalledWith(
      expect.objectContaining({ productId: "catalog-product" }),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "내 상품과 겹침 1" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "겹침 상품 추적" }));
    expect(onTrackProduct).toHaveBeenLastCalledWith(
      expect.objectContaining({
        productId: "overlap-product",
        sourceKeyword: "말랑이",
      }),
    );
  });

  it("shows the persisted tracked state and prevents duplicate registration", () => {
    render(
      <CompetitorSellerDetail
        seller={seller}
        trackedProductIds={new Set(["catalog-product"])}
        trackingProductId={null}
        trackingPending={false}
        onTrackProduct={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "카탈로그 상품 추적 중" }),
    ).toBeDisabled();
  });
});
