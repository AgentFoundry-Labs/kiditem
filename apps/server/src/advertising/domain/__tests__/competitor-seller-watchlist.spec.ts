import { describe, expect, it } from "vitest";
import {
  findCompetitorSellerWatchlistEntry,
  findCompetitorSellerWatchlistEntryForProduct,
  listCompetitorSellerWatchlist,
  listCompetitorWatchKeywords,
} from "../competitor-seller-watchlist";

describe("competitor seller watchlist", () => {
  it("tracks the Noru brand and its actual Coupang seller identity", () => {
    expect(listCompetitorSellerWatchlist()).toContainEqual({
      sellerId: "A00219251",
      sellerName: "도그블랑",
      sellerStoreUrl: "https://shop.coupang.com/A00219251",
      brandName: "노루잡화점",
      discoverySource: "user",
      discoveryKeyword: "노루잡화점 크런치 슬랑이",
      knownProductIds: ["9528872416", "9528926707", "9542387593"],
      knownVendorItemIds: ["95365902585", "95366081854", "95415385747"],
    });
    expect(listCompetitorWatchKeywords()).toContain("노루잡화점 크런치 슬랑이");
    expect(
      findCompetitorSellerWatchlistEntry({
        sellerId: "a00219251",
        sellerName: "도그블랑",
      }),
    ).toMatchObject({ brandName: "노루잡화점" });
    expect(
      findCompetitorSellerWatchlistEntryForProduct({
        productId: "9528872416",
        vendorItemId: null,
      }),
    ).toMatchObject({ sellerId: "A00219251" });
  });

  it("distinguishes user-added shops from KidItem-discovered sellers", () => {
    expect(listCompetitorSellerWatchlist()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sellerId: "littlei",
          sellerName: "리틀아이",
          discoverySource: "user",
        }),
        expect.objectContaining({
          sellerId: "bridgepeople",
          sellerName: "브릿지피플",
          brandName: "페이버",
          discoverySource: "user",
        }),
        expect.objectContaining({
          sellerId: "A00082956",
          sellerName: "쿨스타일",
          brandName: "토이즈데이",
          discoverySource: "user",
        }),
        expect.objectContaining({
          sellerId: "A00051176",
          sellerName: "세진toy",
          brandName: "세진토이",
          discoverySource: "user",
        }),
        expect.objectContaining({
          sellerId: "A00077638",
          sellerName: "퓨전엔터",
          brandName: "키드패밀리",
          discoverySource: "user",
        }),
        expect.objectContaining({
          sellerId: "A01179280",
          brandName: "하루연구소",
          discoverySource: "kiditem",
        }),
        expect.objectContaining({
          sellerId: "A01139488",
          sellerStoreUrl: "https://shop.coupang.com/huevogue/140678",
          brandName: "휴보그",
          discoverySource: "kiditem",
          knownVendorItemIds: ["95572659744", "95575140155"],
        }),
      ]),
    );

    expect(
      findCompetitorSellerWatchlistEntryForProduct({
        productId: "9638886141",
        vendorItemId: "95734178794",
      }),
    ).toMatchObject({
      sellerId: "A00077638",
      sellerName: "퓨전엔터",
      brandName: "키드패밀리",
    });

    expect(
      findCompetitorSellerWatchlistEntryForProduct({
        productId: "9590673929",
        vendorItemId: "95575140155",
      }),
    ).toMatchObject({
      sellerId: "A01139488",
      sellerStoreUrl: "https://shop.coupang.com/huevogue/140678",
      brandName: "휴보그",
    });
  });
});
