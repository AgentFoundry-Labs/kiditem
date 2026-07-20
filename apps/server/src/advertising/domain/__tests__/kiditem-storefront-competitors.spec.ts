import { describe, expect, it } from "vitest";
import {
  deriveKiditemStorefrontKeywords,
  normalizeKiditemStorefrontProductName,
  toKiditemStorefrontOwnProducts,
} from "../kiditem-storefront-competitors";

const products = [
  {
    externalId: "1",
    name: "4000만두쫀뜩말랑이",
    link: "http://www.kiditem.com/product/1",
  },
  {
    externalId: "2",
    name: "10000(집중력up)스마트폰감옥",
    link: "http://www.kiditem.com/product/2",
  },
  {
    externalId: "3",
    name: "7000diy생크림오르골만들기",
    link: "http://www.kiditem.com/product/3",
  },
  {
    externalId: "4",
    name: "18000카피바라무드등",
    link: "http://www.kiditem.com/product/4",
  },
];

describe("kiditem storefront competitor profile", () => {
  it("removes price prefixes and separates matching terms", () => {
    expect(normalizeKiditemStorefrontProductName(products[1].name)).toBe(
      "(집중력up) 스마트폰 감옥",
    );
  });

  it("derives high-intent Coupang overlap searches from live storefront products", () => {
    expect(deriveKiditemStorefrontKeywords(products, 10)).toEqual([
      "스마트폰 감옥",
      "만두 말랑이",
      "생크림 만들기",
      "카피바라 무드등",
      "말랑이",
    ]);
  });

  it("maps storefront products into own-product matching inputs", () => {
    expect(toKiditemStorefrontOwnProducts(products)[0]).toMatchObject({
      vendorItemId: "kiditem-storefront:1",
      productName: "만두 쫀뜩 말랑이",
      category: "키드아이템 신상품/문구/완구",
    });
  });
});
