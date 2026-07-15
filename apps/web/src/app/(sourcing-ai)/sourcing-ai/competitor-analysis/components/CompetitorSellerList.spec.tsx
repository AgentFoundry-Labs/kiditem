import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CompetitorSellerList } from "./CompetitorSellerList";
import type { CompetitorSeller } from "../lib/competitor-tracking-api";

function makeSeller(
  overrides: Partial<CompetitorSeller> = {},
): CompetitorSeller {
  return {
    sellerKey: "seller:littlei",
    sellerName: "리틀아이",
    brandName: "리틀아이",
    sellerId: "littlei",
    sellerStoreUrl: "https://shop.coupang.com/littlei",
    sellerResolved: true,
    watchlisted: true,
    discoverySource: "user",
    priorityScore: 61,
    overlapProductCount: 1,
    matchedOwnProductCount: 1,
    trackedKeywordCount: 1,
    top10Count: 10,
    organicExposureCount: 1,
    averageRank: 1,
    totalReviewCount: 0,
    recentChangeCount: 0,
    lastCapturedAt: null,
    products: [],
    catalog: null,
    ...overrides,
  };
}

describe("CompetitorSellerList", () => {
  it("renders sellers as aligned dense rows with dedicated collection actions", () => {
    const onSelect = vi.fn();
    const onCollectSeller = vi.fn();
    const sellers = [
      makeSeller(),
      makeSeller({
        sellerKey: "seller:bridge",
        sellerName: "브릿지피플",
        brandName: "브릿지피플",
        sellerId: "bridgepeople",
        sellerStoreUrl: "https://shop.coupang.com/bridgepeople",
        watchlisted: false,
        discoverySource: null,
        overlapProductCount: 0,
        top10Count: 3,
        averageRank: 35,
      }),
      makeSeller({
        sellerKey: "seller:pending",
        sellerName: "키디플레이",
        brandName: "키디플레이",
        sellerId: null,
        sellerStoreUrl: null,
        sellerResolved: false,
        watchlisted: false,
        discoverySource: null,
        overlapProductCount: 0,
        top10Count: 2,
        averageRank: null,
      }),
    ];

    render(
      <CompetitorSellerList
        sellers={sellers}
        selectedSellerKey={sellers[0].sellerKey}
        search=""
        onSearchChange={vi.fn()}
        onSelect={onSelect}
        onCollectSeller={onCollectSeller}
        collectingSellerKey={null}
        collectionDisabled={false}
      />,
    );

    expect(screen.getAllByRole("row")).toHaveLength(4);
    expect(
      screen.getAllByRole("columnheader").map((header) => header.textContent),
    ).toEqual(["판매자", "겹침", "TOP10", "평균", "수집 액션"]);
    expect(screen.getByText("사용자 추가")).toBeInTheDocument();
    expect(screen.getAllByText("미추가")).toHaveLength(2);

    fireEvent.click(
      screen.getByRole("button", { name: /리틀아이.*사용자 추가/ }),
    );
    expect(onSelect).toHaveBeenCalledWith("seller:littlei");

    fireEvent.click(screen.getByRole("button", { name: "전체상품 수집" }));
    expect(onCollectSeller).toHaveBeenCalledWith(sellers[0]);

    const addAndCollectButtons = screen.getAllByRole("button", {
      name: "추가하고 수집",
    });
    fireEvent.click(addAndCollectButtons[0]);
    expect(onCollectSeller).toHaveBeenLastCalledWith(sellers[1]);
    expect(addAndCollectButtons[1]).toBeDisabled();
  });
});
