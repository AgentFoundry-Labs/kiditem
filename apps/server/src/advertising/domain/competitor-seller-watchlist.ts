export interface CompetitorSellerWatchlistEntry {
  sellerId: string;
  sellerName: string;
  sellerStoreUrl: string;
  brandName: string;
  discoverySource: "user" | "kiditem";
  discoveryKeyword: string;
  knownProductIds: string[];
  knownVendorItemIds: string[];
}

const COMPETITOR_SELLER_WATCHLIST: readonly CompetitorSellerWatchlistEntry[] = [
  {
    sellerId: "A00219251",
    sellerName: "도그블랑",
    sellerStoreUrl: "https://shop.coupang.com/A00219251",
    brandName: "노루잡화점",
    discoverySource: "user",
    discoveryKeyword: "노루잡화점 크런치 슬랑이",
    knownProductIds: ["9528872416", "9528926707", "9542387593"],
    knownVendorItemIds: ["95365902585", "95366081854", "95415385747"],
  },
  {
    sellerId: "littlei",
    sellerName: "리틀아이",
    sellerStoreUrl: "https://shop.coupang.com/littlei",
    brandName: "리틀아이",
    discoverySource: "user",
    discoveryKeyword: "리틀아이 팬시 완구",
    knownProductIds: ["9555826789"],
    knownVendorItemIds: ["95331362930"],
  },
  {
    sellerId: "bridgepeople",
    sellerName: "브릿지피플",
    sellerStoreUrl: "https://shop.coupang.com/bridgepeople",
    brandName: "페이버",
    discoverySource: "user",
    discoveryKeyword: "페이버 슬랑이",
    knownProductIds: ["9626135006"],
    knownVendorItemIds: ["95687359282"],
  },
  {
    sellerId: "A00082956",
    sellerName: "쿨스타일",
    sellerStoreUrl: "https://shop.coupang.com/A00082956",
    brandName: "토이즈데이",
    discoverySource: "user",
    discoveryKeyword: "토이즈데이 말랑이",
    knownProductIds: ["9616310659"],
    knownVendorItemIds: ["95654064568"],
  },
  {
    sellerId: "A00051176",
    sellerName: "세진toy",
    sellerStoreUrl: "https://shop.coupang.com/A00051176",
    brandName: "세진토이",
    discoverySource: "user",
    discoveryKeyword: "세진토이 슬랑이",
    knownProductIds: ["9611841142"],
    knownVendorItemIds: ["95640544323"],
  },
  {
    sellerId: "A00077638",
    sellerName: "퓨전엔터",
    sellerStoreUrl: "https://shop.coupang.com/A00077638",
    brandName: "키드패밀리",
    discoverySource: "user",
    discoveryKeyword: "키드패밀리 슬랑이",
    knownProductIds: ["9638886141"],
    knownVendorItemIds: ["95734178794"],
  },
  {
    sellerId: "A01179280",
    sellerName: "주식회사 에이치케이지",
    sellerStoreUrl: "https://shop.coupang.com/A01179280",
    brandName: "하루연구소",
    discoverySource: "kiditem",
    discoveryKeyword: "하루연구소 크런치 말랑이",
    knownProductIds: ["9604736758"],
    knownVendorItemIds: ["95614705812"],
  },
  {
    sellerId: "A01139488",
    sellerName: "휴보그(HueVogue)",
    sellerStoreUrl: "https://shop.coupang.com/huevogue/140678",
    brandName: "휴보그",
    discoverySource: "kiditem",
    discoveryKeyword: "휴보그 슬랑이 스퀴시",
    knownProductIds: ["9590673929"],
    knownVendorItemIds: ["95572659744", "95575140155"],
  },
];

export function listCompetitorSellerWatchlist(): CompetitorSellerWatchlistEntry[] {
  return COMPETITOR_SELLER_WATCHLIST.map((entry) => ({ ...entry }));
}

export function listCompetitorWatchKeywords(): string[] {
  return COMPETITOR_SELLER_WATCHLIST.map((entry) => entry.discoveryKeyword);
}

export function findCompetitorSellerWatchlistEntry(input: {
  sellerId: string | null;
  sellerName: string;
}): CompetitorSellerWatchlistEntry | null {
  const sellerId = normalize(input.sellerId);
  const sellerName = normalize(input.sellerName);
  return (
    COMPETITOR_SELLER_WATCHLIST.find(
      (entry) =>
        normalize(entry.sellerId) === sellerId ||
        normalize(entry.sellerName) === sellerName ||
        normalize(entry.brandName) === sellerName,
    ) ?? null
  );
}

export function findCompetitorSellerWatchlistEntryForProduct(input: {
  productId: string | null;
  vendorItemId: string | null;
}): CompetitorSellerWatchlistEntry | null {
  return (
    COMPETITOR_SELLER_WATCHLIST.find(
      (entry) =>
        (input.productId !== null &&
          entry.knownProductIds.includes(input.productId)) ||
        (input.vendorItemId !== null &&
          entry.knownVendorItemIds.includes(input.vendorItemId)),
    ) ?? null
  );
}

function normalize(value: string | null): string {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("ko")
    .replace(/\s+/g, "")
    .trim();
}
