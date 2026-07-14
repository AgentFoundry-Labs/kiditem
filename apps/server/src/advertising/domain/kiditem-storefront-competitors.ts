import type { KiditemStorefrontProduct } from "../application/port/out/provider/kiditem-storefront.port";
import type { CompetitorOwnProduct } from "./competitor-tracking";

const MATCH_TERMS = [
  "스마트폰",
  "카피바라",
  "비눗방울",
  "생크림",
  "오르골",
  "만들기",
  "무드등",
  "말랑이",
  "슬라임",
  "워터건",
  "물총",
  "플라잉",
  "팽이",
  "키링",
  "스티커",
  "레고",
  "블럭",
  "감옥",
  "만두",
  "diy",
  "led",
] as const;

const QUERY_RULES = [
  { terms: ["스마트폰", "감옥"], keyword: "스마트폰 감옥" },
  { terms: ["만두", "말랑이"], keyword: "만두 말랑이" },
  { terms: ["생크림", "만들기"], keyword: "생크림 만들기" },
  { terms: ["카피바라", "무드등"], keyword: "카피바라 무드등" },
  { terms: ["말랑이", "키링"], keyword: "말랑 키링" },
  { terms: ["diy", "키링"], keyword: "DIY 키링 만들기" },
  { terms: ["led", "팽이"], keyword: "LED 팽이" },
  { terms: ["비눗방울"], keyword: "비눗방울 완구" },
  { terms: ["물총"], keyword: "어린이 물총" },
  { terms: ["워터건"], keyword: "어린이 워터건" },
  { terms: ["diy", "스티커"], keyword: "DIY 스티커" },
  { terms: ["레고", "블럭"], keyword: "피규어 레고 블럭" },
  { terms: ["말랑이"], keyword: "말랑이" },
  { terms: ["슬라임"], keyword: "슬라임" },
] as const;

export function toKiditemStorefrontOwnProducts(
  products: KiditemStorefrontProduct[],
): CompetitorOwnProduct[] {
  return products.map((product) => ({
    vendorItemId: `kiditem-storefront:${product.externalId}`,
    skuId: `kiditem-storefront:${product.externalId}`,
    productName: normalizeKiditemStorefrontProductName(product.name),
    category: "키드아이템 신상품/문구/완구",
  }));
}

export function deriveKiditemStorefrontKeywords(
  products: KiditemStorefrontProduct[],
  limit: number,
): string[] {
  const cappedLimit = Math.max(1, Math.min(20, Math.trunc(limit)));
  const normalizedCatalog = products
    .map((product) => normalizeKiditemStorefrontProductName(product.name))
    .join("\n")
    .toLocaleLowerCase("ko");

  return QUERY_RULES.filter((rule) =>
    rule.terms.every((term) => normalizedCatalog.includes(term)),
  )
    .map((rule) => rule.keyword)
    .slice(0, cappedLimit);
}

export function normalizeKiditemStorefrontProductName(value: string): string {
  let normalized = String(value || "")
    .normalize("NFKC")
    .replace(/^\s*\d[\d,]*\s*/, "")
    .replace(/\s+/g, " ")
    .trim();

  for (const term of MATCH_TERMS) {
    normalized = normalized.replace(
      new RegExp(escapeRegExp(term), "gi"),
      (match) => ` ${match} `,
    );
  }
  return normalized.replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
