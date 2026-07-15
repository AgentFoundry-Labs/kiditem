import { describe, expect, it } from "vitest";
import {
  parseKiditemStorefrontHtml,
  parseKiditemStorefrontPageCount,
} from "./kiditem-storefront.adapter";

describe("KiditemStorefrontAdapter", () => {
  it("parses new-product rows and de-duplicates brand ids", () => {
    const html = `
      <p class="goods_grid_name"><a href="/shop/shopdetail.html?branduid=2232725&amp;xcode=024">4000만두쫀뜩말랑이</a></p>
      <p class="goods_grid_name"><a href="/shop/shopdetail.html?branduid=2232718&amp;xcode=024">3000diy층층3D데코스티커</a></p>
      <p class="goods_grid_name"><a href="/shop/shopdetail.html?branduid=2232725&amp;xcode=024">중복 상품</a></p>
    `;

    expect(parseKiditemStorefrontHtml(html)).toEqual([
      expect.objectContaining({
        externalId: "2232725",
        name: "4000만두쫀뜩말랑이",
      }),
      expect.objectContaining({
        externalId: "2232718",
        name: "3000diy층층3D데코스티커",
      }),
    ]);
  });

  it("discovers the bounded last page from the storefront pagination", () => {
    const html = `
      <a href="/shop/shopbrand.html?type=P&amp;xcode=024&amp;page=2">2</a>
      <a href="/shop/shopbrand.html?type=P&amp;xcode=024&amp;page=5">last</a>
      <a href="/shop/shopbrand.html?type=P&amp;xcode=024&amp;page=999">bad</a>
    `;

    expect(parseKiditemStorefrontPageCount(html)).toBe(5);
  });
});
