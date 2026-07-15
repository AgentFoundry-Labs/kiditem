import {
  findCompetitorSellerWatchlistEntry,
  findCompetitorSellerWatchlistEntryForProduct,
} from "./competitor-seller-watchlist";

const DOMAIN_TERMS = [
  "문구",
  "완구",
  "장난감",
  "학용품",
  "연필",
  "색연필",
  "필통",
  "스티커",
  "노트",
  "공책",
  "보드게임",
  "블록",
  "말랑이",
  "스퀴시",
  "피젯",
  "만들기",
  "미술",
  "색칠",
  "키링",
  "슬라임",
  "인형",
] as const;

const STOP_WORDS = new Set([
  "쿠팡",
  "로켓",
  "배송",
  "무료배송",
  "정품",
  "국내",
  "어린이",
  "아동",
  "키즈",
  "랜덤",
  "세트",
  "묶음",
  "대용량",
  "1개",
  "2개",
  "3개",
]);

export interface CompetitorOwnProduct {
  vendorItemId: string;
  skuId: string;
  productName: string;
  category: string | null;
}

export interface CompetitorSerpSnapshotInput {
  keyword: string;
  businessDate: Date;
  capturedAt: Date;
  pagesScanned: number;
  items: unknown;
}

export interface MatchedOwnProduct {
  vendorItemId: string;
  skuId: string;
  productName: string;
  category: string | null;
  score: number;
  sharedTerms: string[];
}

export interface CompetitorTrackedProduct {
  productKey: string;
  productId: string | null;
  vendorItemId: string | null;
  name: string;
  link: string | null;
  imageUrl: string | null;
  keywords: string[];
  rank: number;
  isAd: boolean;
  priceKrw: number | null;
  reviewCount: number | null;
  ratingScore: number | null;
  rankChange: number | null;
  priceChange: number | null;
  reviewChange: number | null;
  capturedAt: string;
  matchedOwnProducts: MatchedOwnProduct[];
}

export interface CompetitorSellerCatalogProduct {
  productKey: string;
  productId: string | null;
  itemId: string | null;
  vendorItemId: string | null;
  name: string;
  link: string | null;
  imageUrl: string | null;
  priceKrw: number | null;
  reviewCount: number | null;
  sourceRank: number;
  firstSeenAt: string;
  lastSeenAt: string;
  isNew: boolean;
}

export interface CompetitorSellerCatalog {
  sellerStoreUrl: string;
  sort: "newest";
  totalProductCount: number | null;
  collectedProductCount: number;
  isTruncated: boolean;
  newProductCount: number;
  lastCapturedAt: string;
  products: CompetitorSellerCatalogProduct[];
}

export interface CompetitorSellerSummary {
  sellerKey: string;
  sellerName: string;
  brandName: string | null;
  sellerId: string | null;
  sellerStoreUrl: string | null;
  sellerResolved: boolean;
  watchlisted: boolean;
  discoverySource: "user" | "kiditem" | null;
  priorityScore: number;
  overlapProductCount: number;
  matchedOwnProductCount: number;
  trackedKeywordCount: number;
  top10Count: number;
  organicExposureCount: number;
  averageRank: number | null;
  totalReviewCount: number;
  recentChangeCount: number;
  lastCapturedAt: string | null;
  products: CompetitorTrackedProduct[];
  catalog: CompetitorSellerCatalog | null;
}

export interface CompetitorTrackingOverview {
  summary: {
    trackedSellerCount: number;
    topSellerCount: number;
    overlappingProductCount: number;
    matchedOwnProductCount: number;
    trackedKeywordCount: number;
    unresolvedSellerProductCount: number;
    lastCapturedAt: string | null;
  };
  sellers: CompetitorSellerSummary[];
}

interface ParsedSerpItem {
  rank: number;
  isAd: boolean;
  productId: string | null;
  vendorItemId: string | null;
  name: string;
  priceKrw: number | null;
  reviewCount: number | null;
  ratingScore: number | null;
  sellerName: string | null;
  sellerId: string | null;
  sellerStoreUrl: string | null;
  link: string | null;
  imageUrl: string | null;
}

interface PreparedOwnProduct {
  product: CompetitorOwnProduct;
  terms: Set<string>;
}

export function deriveCompetitorKeywords(
  ownProducts: CompetitorOwnProduct[],
  limit: number,
): string[] {
  const cappedLimit = Math.max(1, Math.min(20, Math.trunc(limit)));
  const relevant = ownProducts.filter((product) =>
    containsDomainTerm(`${product.productName} ${product.category ?? ""}`),
  );
  const source = relevant.length > 0 ? relevant : ownProducts;
  const counts = new Map<string, number>();

  for (const product of source) {
    const normalized = normalizeText(
      `${product.productName} ${product.category ?? ""}`,
    );
    for (const term of DOMAIN_TERMS) {
      if (normalized.includes(term)) increment(counts, term, 4);
    }
    for (const segment of String(product.category ?? "").split(/[>\/|]/)) {
      const category = normalizeKeyword(segment);
      if (category.length >= 2 && category.length <= 24) {
        increment(counts, category, 2);
      }
    }
    for (const token of tokenize(product.productName)) {
      if (token.length >= 2 && token.length <= 16) increment(counts, token, 1);
    }
  }

  return [...counts.entries()]
    .sort(
      (a, b) =>
        b[1] - a[1] ||
        Number(containsDomainTerm(b[0])) - Number(containsDomainTerm(a[0])) ||
        b[0].length - a[0].length ||
        a[0].localeCompare(b[0], "ko"),
    )
    .map(([keyword]) => keyword)
    .slice(0, cappedLimit);
}

export function buildCompetitorTrackingOverview(
  ownProducts: CompetitorOwnProduct[],
  snapshots: CompetitorSerpSnapshotInput[],
  sellerLimit: number,
): CompetitorTrackingOverview {
  const ownVendorItemIds = new Set(
    ownProducts.map((product) => product.vendorItemId),
  );
  const preparedOwnProducts = ownProducts.map(
    (product): PreparedOwnProduct => ({
      product,
      terms: tokenize(`${product.productName} ${product.category ?? ""}`),
    }),
  );
  const latestByKeyword = latestSnapshotPairs(snapshots);
  const productsBySeller = new Map<string, CompetitorTrackedProduct[]>();
  const catalogsBySeller = buildSellerCatalogs(snapshots);
  const sellerIdentity = new Map<
    string,
    {
      sellerName: string;
      sellerId: string | null;
      sellerStoreUrl: string | null;
      sellerResolved: boolean;
    }
  >();

  for (const snapshot of snapshots) {
    for (const catalog of parseSellerCatalogs(
      snapshot.items,
      snapshot.capturedAt,
    )) {
      sellerIdentity.set(catalog.sellerKey, {
        sellerName: catalog.sellerName ?? "판매자 확인 대기",
        sellerId: catalog.sellerId,
        sellerStoreUrl: catalog.sellerStoreUrl,
        sellerResolved: Boolean(catalog.sellerName),
      });
    }
  }

  for (const [keyword, pair] of latestByKeyword) {
    const keywordTerms = tokenize(keyword);
    const currentItems = parseSerpItems(pair.current.items);
    const previousByProduct = new Map(
      parseSerpItems(pair.previous?.items).map((item) => [
        productKey(item),
        item,
      ]),
    );

    for (const item of currentItems) {
      const resolvedItem = resolveWatchlistedSellerIdentity(item);
      if (
        resolvedItem.vendorItemId &&
        ownVendorItemIds.has(resolvedItem.vendorItemId)
      )
        continue;
      const competitorTerms = tokenize(resolvedItem.name);
      const matches = preparedOwnProducts
        .map((prepared) =>
          matchOwnProduct(prepared, competitorTerms, keywordTerms),
        )
        .filter((match): match is MatchedOwnProduct => match !== null)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
      if (matches.length === 0) continue;

      const key = productKey(resolvedItem);
      const previous = previousByProduct.get(key) ?? null;
      const sellerKey = resolveSellerKey(resolvedItem);
      const identity = sellerIdentity.get(sellerKey);
      if (!identity || (!identity.sellerResolved && resolvedItem.sellerName)) {
        sellerIdentity.set(sellerKey, {
          sellerName: resolvedItem.sellerName ?? "판매자 확인 대기",
          sellerId: resolvedItem.sellerId,
          sellerStoreUrl: resolvedItem.sellerStoreUrl,
          sellerResolved: Boolean(
            resolvedItem.sellerName &&
            resolvedItem.sellerId &&
            resolvedItem.sellerStoreUrl,
          ),
        });
      }

      const product: CompetitorTrackedProduct = {
        productKey: key,
        productId: resolvedItem.productId,
        vendorItemId: resolvedItem.vendorItemId,
        name: resolvedItem.name,
        link: resolvedItem.link,
        imageUrl: resolvedItem.imageUrl,
        keywords: [keyword],
        rank: resolvedItem.rank,
        isAd: resolvedItem.isAd,
        priceKrw: resolvedItem.priceKrw,
        reviewCount: resolvedItem.reviewCount,
        ratingScore: resolvedItem.ratingScore,
        rankChange: previous ? previous.rank - item.rank : null,
        priceChange: difference(item.priceKrw, previous?.priceKrw),
        reviewChange: difference(item.reviewCount, previous?.reviewCount),
        capturedAt: pair.current.capturedAt.toISOString(),
        matchedOwnProducts: matches,
      };
      mergeSellerProduct(productsBySeller, sellerKey, product);
    }
  }

  const sellerKeys = new Set([
    ...productsBySeller.keys(),
    ...catalogsBySeller.keys(),
  ]);
  const sellers = [...sellerKeys].map(
    (sellerKey): CompetitorSellerSummary => {
      const products = productsBySeller.get(sellerKey) ?? [];
      const identity = sellerIdentity.get(sellerKey) ?? {
        sellerName: "판매자 확인 대기",
        sellerId: null,
        sellerStoreUrl: null,
        sellerResolved: false,
      };
      const watchlistEntry = findCompetitorSellerWatchlistEntry(identity);
      products.sort(
        (a, b) =>
          b.matchedOwnProducts[0].score - a.matchedOwnProducts[0].score ||
          a.rank - b.rank ||
          a.name.localeCompare(b.name, "ko"),
      );
      const ownIds = new Set(
        products.flatMap((product) =>
          product.matchedOwnProducts.map((match) => match.vendorItemId),
        ),
      );
      const keywords = new Set(products.flatMap((product) => product.keywords));
      const top10Count = products.filter(
        (product) => product.rank <= 10,
      ).length;
      const organicExposureCount = products.filter(
        (product) => !product.isAd,
      ).length;
      const recentChangeCount = products.filter(
        (product) =>
          product.rankChange !== null ||
          product.priceChange !== null ||
          product.reviewChange !== null,
      ).length;
      const totalReviewCount = products.reduce(
        (sum, product) => sum + (product.reviewCount ?? 0),
        0,
      );
      const priorityScore = Math.min(
        100,
        Math.round(
          products.length * 16 +
            ownIds.size * 12 +
            top10Count * 7 +
            organicExposureCount * 2 +
            Math.log10(totalReviewCount + 1) * 4,
        ),
      );
      return {
        sellerKey,
        ...identity,
        brandName: watchlistEntry?.brandName ?? null,
        watchlisted: watchlistEntry !== null,
        discoverySource: watchlistEntry?.discoverySource ?? null,
        priorityScore,
        overlapProductCount: products.length,
        matchedOwnProductCount: ownIds.size,
        trackedKeywordCount: keywords.size,
        top10Count,
        organicExposureCount,
        averageRank:
          products.length > 0
            ? Math.round(
                products.reduce((sum, product) => sum + product.rank, 0) /
                  products.length,
              )
            : null,
        totalReviewCount,
        recentChangeCount,
        lastCapturedAt:
          products
            .map((product) => product.capturedAt)
            .sort()
            .at(-1) ??
          catalogsBySeller.get(sellerKey)?.lastCapturedAt ??
          null,
        products,
        catalog: catalogsBySeller.get(sellerKey) ?? null,
      };
    },
  );

  sellers.sort(
    (a, b) =>
      Number(b.watchlisted) - Number(a.watchlisted) ||
      Number(b.sellerResolved) - Number(a.sellerResolved) ||
      b.priorityScore - a.priorityScore ||
      b.overlapProductCount - a.overlapProductCount ||
      a.sellerName.localeCompare(b.sellerName, "ko"),
  );
  const visibleSellers = sellers.slice(0, Math.max(1, Math.trunc(sellerLimit)));
  const allProducts = sellers.flatMap((seller) => seller.products);
  const matchedOwnIds = new Set(
    allProducts.flatMap((product) =>
      product.matchedOwnProducts.map((match) => match.vendorItemId),
    ),
  );
  const lastCapturedAt =
    snapshots
      .map((snapshot) => snapshot.capturedAt.toISOString())
      .sort()
      .at(-1) ?? null;

  return {
    summary: {
      trackedSellerCount: sellers.filter((seller) => seller.sellerResolved)
        .length,
      topSellerCount: sellers.filter(
        (seller) =>
          seller.sellerResolved &&
          (seller.top10Count > 0 || seller.overlapProductCount >= 3),
      ).length,
      overlappingProductCount: allProducts.length,
      matchedOwnProductCount: matchedOwnIds.size,
      trackedKeywordCount: latestByKeyword.size,
      unresolvedSellerProductCount: sellers
        .filter((seller) => !seller.sellerResolved)
        .reduce((sum, seller) => sum + seller.overlapProductCount, 0),
      lastCapturedAt,
    },
    sellers: visibleSellers,
  };
}

function resolveWatchlistedSellerIdentity(
  item: ParsedSerpItem,
): ParsedSerpItem {
  if (item.sellerName && item.sellerId && item.sellerStoreUrl) return item;
  const watchlistEntry = findCompetitorSellerWatchlistEntryForProduct(item);
  if (!watchlistEntry) return item;
  return {
    ...item,
    sellerName: watchlistEntry.sellerName,
    sellerId: watchlistEntry.sellerId,
    sellerStoreUrl: watchlistEntry.sellerStoreUrl,
  };
}

function latestSnapshotPairs(snapshots: CompetitorSerpSnapshotInput[]) {
  const grouped = new Map<string, CompetitorSerpSnapshotInput[]>();
  for (const snapshot of snapshots) {
    const rows = grouped.get(snapshot.keyword) ?? [];
    rows.push(snapshot);
    grouped.set(snapshot.keyword, rows);
  }
  const pairs = new Map<
    string,
    {
      current: CompetitorSerpSnapshotInput;
      previous: CompetitorSerpSnapshotInput | null;
    }
  >();
  for (const [keyword, rows] of grouped) {
    rows.sort(
      (a, b) =>
        a.businessDate.getTime() - b.businessDate.getTime() ||
        a.capturedAt.getTime() - b.capturedAt.getTime(),
    );
    pairs.set(keyword, {
      current: rows.at(-1)!,
      previous: rows.at(-2) ?? null,
    });
  }
  return pairs;
}

function parseSerpItems(raw: unknown): ParsedSerpItem[] {
  const values = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>).serpItems
      : [];
  if (!Array.isArray(values)) return [];
  return values.flatMap((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const item = value as Record<string, unknown>;
    const name = stringValue(item.name);
    if (!name) return [];
    return [
      {
        rank: positiveNumber(item.rank) ?? index + 1,
        isAd: item.isAd === true,
        productId: stringValue(item.productId),
        vendorItemId: stringValue(item.vendorItemId),
        name,
        priceKrw: positiveNumber(item.priceKrw),
        reviewCount: numberValue(item.reviewCount),
        ratingScore: numberValue(item.ratingScore),
        sellerName: stringValue(item.sellerName),
        sellerId: stringValue(item.sellerId),
        sellerStoreUrl: stringValue(item.sellerStoreUrl),
        link: stringValue(item.link),
        imageUrl: stringValue(item.imageUrl),
      },
    ];
  });
}

interface ParsedCatalogProduct {
  productKey: string;
  productId: string | null;
  itemId: string | null;
  vendorItemId: string | null;
  name: string;
  link: string | null;
  imageUrl: string | null;
  priceKrw: number | null;
  reviewCount: number | null;
  sourceRank: number;
}

interface ParsedCatalog {
  sellerKey: string;
  sellerId: string;
  sellerName: string | null;
  sellerStoreUrl: string;
  totalProductCount: number | null;
  collectedProductCount: number;
  isTruncated: boolean;
  capturedAt: Date;
  products: ParsedCatalogProduct[];
}

function buildSellerCatalogs(
  snapshots: CompetitorSerpSnapshotInput[],
): Map<string, CompetitorSellerCatalog> {
  const histories = new Map<string, ParsedCatalog[]>();
  for (const snapshot of snapshots) {
    for (const catalog of parseSellerCatalogs(
      snapshot.items,
      snapshot.capturedAt,
    )) {
      const history = histories.get(catalog.sellerKey) ?? [];
      history.push(catalog);
      histories.set(catalog.sellerKey, history);
    }
  }

  const result = new Map<string, CompetitorSellerCatalog>();
  for (const [sellerKey, history] of histories) {
    history.sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());
    const latest = history.at(-1)!;
    const firstSeen = new Map<string, string>();
    for (const catalog of history) {
      const capturedAt = catalog.capturedAt.toISOString();
      for (const product of catalog.products) {
        if (!firstSeen.has(product.productKey)) {
          firstSeen.set(product.productKey, capturedAt);
        }
      }
    }
    const latestCapturedAt = latest.capturedAt.toISOString();
    const hasBaseline = history.some(
      (catalog) => catalog.capturedAt.getTime() < latest.capturedAt.getTime(),
    );
    const products = latest.products
      .map((product): CompetitorSellerCatalogProduct => {
        const firstSeenAt =
          firstSeen.get(product.productKey) ?? latestCapturedAt;
        return {
          ...product,
          firstSeenAt,
          lastSeenAt: latestCapturedAt,
          isNew: hasBaseline && firstSeenAt === latestCapturedAt,
        };
      })
      .sort((a, b) => a.sourceRank - b.sourceRank);
    result.set(sellerKey, {
      sellerStoreUrl: latest.sellerStoreUrl,
      sort: "newest",
      totalProductCount: latest.totalProductCount,
      collectedProductCount: products.length,
      isTruncated: latest.isTruncated,
      newProductCount: products.filter((product) => product.isNew).length,
      lastCapturedAt: latestCapturedAt,
      products,
    });
  }
  return result;
}

function parseSellerCatalogs(
  raw: unknown,
  fallbackCapturedAt: Date,
): ParsedCatalog[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const candidates = (raw as Record<string, unknown>).sellerCatalogs;
  if (!Array.isArray(candidates)) return [];
  return candidates.flatMap((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const row = value as Record<string, unknown>;
    const sellerId = stringValue(row.sellerId);
    const sellerName = stringValue(row.sellerName);
    const sellerStoreUrl = stringValue(row.sellerStoreUrl);
    if (!sellerId || !sellerStoreUrl) return [];
    const capturedAtValue = stringValue(row.capturedAt);
    const parsedCapturedAt = capturedAtValue ? new Date(capturedAtValue) : null;
    const capturedAt =
      parsedCapturedAt && Number.isFinite(parsedCapturedAt.getTime())
        ? parsedCapturedAt
        : fallbackCapturedAt;
    const products = parseCatalogProducts(row.products);
    if (products.length === 0) return [];
    return [
      {
        sellerKey: `id:${sellerId}`,
        sellerId,
        sellerName,
        sellerStoreUrl,
        totalProductCount: positiveNumber(row.totalProductCount),
        collectedProductCount: products.length,
        isTruncated: row.isTruncated === true,
        capturedAt,
        products,
      },
    ];
  });
}

function parseCatalogProducts(raw: unknown): ParsedCatalogProduct[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const item = value as Record<string, unknown>;
    const name = stringValue(item.name);
    const productId = stringValue(item.productId);
    const itemId = stringValue(item.itemId);
    const vendorItemId = stringValue(item.vendorItemId);
    if (!name || (!productId && !itemId && !vendorItemId)) return [];
    return [
      {
        productKey: vendorItemId || itemId || productId!,
        productId,
        itemId,
        vendorItemId,
        name,
        link: stringValue(item.link),
        imageUrl: stringValue(item.imageUrl),
        priceKrw: positiveNumber(item.priceKrw),
        reviewCount: numberValue(item.reviewCount),
        sourceRank: positiveNumber(item.sourceRank) ?? index + 1,
      },
    ];
  });
}

function matchOwnProduct(
  prepared: PreparedOwnProduct,
  competitorTerms: Set<string>,
  keywordTerms: Set<string>,
): MatchedOwnProduct | null {
  const { product: own, terms: ownTerms } = prepared;
  const sharedTerms = [...ownTerms].filter((term) => competitorTerms.has(term));
  const keywordOverlap = [...keywordTerms].filter(
    (term) => ownTerms.has(term) && competitorTerms.has(term),
  );
  const unionSize = new Set([...ownTerms, ...competitorTerms]).size;
  const jaccard = unionSize > 0 ? sharedTerms.length / unionSize : 0;
  const domainShared = sharedTerms.filter((term) => containsDomainTerm(term));
  const score = Math.min(
    100,
    Math.round(
      sharedTerms.length * 24 +
        keywordOverlap.length * 12 +
        domainShared.length * 10 +
        jaccard * 30,
    ),
  );
  if (score < 32 || sharedTerms.length === 0) return null;
  return {
    vendorItemId: own.vendorItemId,
    skuId: own.skuId,
    productName: own.productName,
    category: own.category,
    score,
    sharedTerms: sharedTerms.slice(0, 5),
  };
}

function mergeSellerProduct(
  productsBySeller: Map<string, CompetitorTrackedProduct[]>,
  sellerKey: string,
  product: CompetitorTrackedProduct,
) {
  const products = productsBySeller.get(sellerKey) ?? [];
  const existing = products.find(
    (candidate) => candidate.productKey === product.productKey,
  );
  if (!existing) {
    products.push(product);
    productsBySeller.set(sellerKey, products);
    return;
  }
  existing.keywords = [...new Set([...existing.keywords, ...product.keywords])];
  existing.matchedOwnProducts = [
    ...new Map(
      [...existing.matchedOwnProducts, ...product.matchedOwnProducts]
        .sort((a, b) => b.score - a.score)
        .map((match) => [match.vendorItemId, match]),
    ).values(),
  ].slice(0, 3);
  if (product.rank < existing.rank)
    Object.assign(existing, product, {
      keywords: existing.keywords,
      matchedOwnProducts: existing.matchedOwnProducts,
    });
}

function resolveSellerKey(item: ParsedSerpItem): string {
  if (item.sellerId) return `id:${item.sellerId}`;
  if (item.sellerName) return `name:${normalizeText(item.sellerName)}`;
  return "unresolved";
}

function productKey(item: ParsedSerpItem): string {
  return (
    item.vendorItemId || item.productId || `name:${normalizeText(item.name)}`
  );
}

function tokenize(value: string): Set<string> {
  const normalized = normalizeText(value);
  const tokens = new Set(
    normalized
      .split(/[^0-9a-z가-힣]+/)
      .map((token) => token.trim())
      .filter(
        (token) =>
          token.length >= 2 &&
          !STOP_WORDS.has(token) &&
          !/^\d+(?:개|입|매|종|p|pcs)?$/.test(token),
      ),
  );
  for (const term of DOMAIN_TERMS) {
    if (normalized.includes(term)) tokens.add(term);
  }
  return tokens;
}

function containsDomainTerm(value: string): boolean {
  const normalized = normalizeText(value);
  return DOMAIN_TERMS.some((term) => normalized.includes(term));
}

function normalizeKeyword(value: string): string {
  return normalizeText(value).replace(/\s+/g, " ").trim();
}

function normalizeText(value: string): string {
  return String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase("ko")
    .replace(/\s+/g, " ")
    .trim();
}

function stringValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function numberValue(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function positiveNumber(value: unknown): number | null {
  const parsed = numberValue(value);
  return parsed !== null && parsed > 0 ? Math.trunc(parsed) : null;
}

function difference(
  current: number | null,
  previous: number | null | undefined,
): number | null {
  return current !== null && previous !== null && previous !== undefined
    ? current - previous
    : null;
}

function increment(map: Map<string, number>, key: string, amount: number) {
  if (!key || STOP_WORDS.has(key)) return;
  map.set(key, (map.get(key) ?? 0) + amount);
}
