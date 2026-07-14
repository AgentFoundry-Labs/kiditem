import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from "@nestjs/common";
import {
  buildCompetitorTrackingOverview,
  deriveCompetitorKeywords,
  type CompetitorOwnProduct,
} from "../../domain/competitor-tracking";
import {
  deriveKiditemStorefrontKeywords,
  toKiditemStorefrontOwnProducts,
} from "../../domain/kiditem-storefront-competitors";
import {
  listCompetitorSellerWatchlist,
  listCompetitorWatchKeywords,
} from "../../domain/competitor-seller-watchlist";
import {
  KIDITEM_STOREFRONT_PORT,
  type KiditemStorefrontPort,
  type KiditemStorefrontProduct,
} from "../port/out/provider/kiditem-storefront.port";
import {
  KEYWORD_RANK_REPOSITORY_PORT,
  type KeywordRankRepositoryPort,
} from "../port/out/repository/keyword-rank.repository.port";

@Injectable()
export class CompetitorTrackingService {
  private readonly logger = new Logger(CompetitorTrackingService.name);

  constructor(
    @Inject(KEYWORD_RANK_REPOSITORY_PORT)
    private readonly keywordRankRepo: KeywordRankRepositoryPort,
    @Inject(KIDITEM_STOREFRONT_PORT)
    private readonly kiditemStorefront: KiditemStorefrontPort,
  ) {}

  async getOverview(organizationId: string, days: number, sellerLimit: number) {
    const [context, trackers, snapshots] = await Promise.all([
      this.loadOwnProductContext(organizationId),
      this.keywordRankRepo.listTrackers(organizationId),
      this.keywordRankRepo.findRecentSerpSnapshots(organizationId, days),
    ]);
    const { ownProducts, wingProductCount, storefrontProducts } = context;
    const overview = buildCompetitorTrackingOverview(
      ownProducts,
      snapshots,
      sellerLimit,
    );
    const suggestedKeywords = this.deriveTrackingKeywords(
      storefrontProducts,
      ownProducts,
      12,
    );
    const enabledTrackers = trackers.filter((tracker) => tracker.enabled);
    const watchedCompetitors = listCompetitorSellerWatchlist();
    const watchedSellerIds = new Set(
      overview.sellers.map((seller) => seller.sellerId).filter(Boolean),
    );
    const sellers = [
      ...overview.sellers,
      ...watchedCompetitors
        .filter((competitor) => !watchedSellerIds.has(competitor.sellerId))
        .map((competitor) => ({
          sellerKey: `id:${competitor.sellerId}`,
          sellerName: competitor.sellerName,
          brandName: competitor.brandName,
          sellerId: competitor.sellerId,
          sellerStoreUrl: competitor.sellerStoreUrl,
          sellerResolved: true,
          watchlisted: true,
          discoverySource: competitor.discoverySource,
          priorityScore: 0,
          overlapProductCount: 0,
          matchedOwnProductCount: 0,
          trackedKeywordCount: 0,
          top10Count: 0,
          organicExposureCount: 0,
          averageRank: null,
          totalReviewCount: 0,
          recentChangeCount: 0,
          lastCapturedAt: null,
          products: [],
          catalog: null,
        })),
    ]
      .sort(
        (a, b) =>
          discoverySourceRank(a.discoverySource) -
            discoverySourceRank(b.discoverySource) ||
          b.priorityScore - a.priorityScore ||
          a.sellerName.localeCompare(b.sellerName, "ko"),
      )
      .slice(0, Math.max(1, Math.trunc(sellerLimit)));

    return {
      periodDays: days,
      collection: {
        status:
          ownProducts.length === 0
            ? "catalog_empty"
            : enabledTrackers.length === 0
              ? "not_configured"
              : snapshots.length === 0
                ? "not_collected"
                : "ready",
        ownProductCount: ownProducts.length,
        wingProductCount,
        storefrontProductCount: storefrontProducts.length,
        storefrontStatus:
          storefrontProducts.length > 0 ? "ready" : "unavailable",
        trackerCount: trackers.length,
        enabledTrackerCount: enabledTrackers.length,
        trackedKeywords: enabledTrackers.map((tracker) => tracker.keyword),
        suggestedKeywords,
        watchedCompetitors,
        lastCapturedAt: overview.summary.lastCapturedAt,
      },
      ...overview,
      summary: {
        ...overview.summary,
        trackedSellerCount: sellers.filter((seller) => seller.sellerResolved)
          .length,
      },
      sellers,
    };
  }

  async autoConfigureTrackers(organizationId: string, maxKeywords: number) {
    const { ownProducts, storefrontProducts } =
      await this.loadOwnProductContext(organizationId);
    if (ownProducts.length === 0) {
      throw new BadRequestException(
        "자사 상품을 불러올 수 없습니다. Wing 상품 카탈로그 또는 키드아이템 신상품 페이지를 확인하세요.",
      );
    }
    const keywords = this.deriveTrackingKeywords(
      storefrontProducts,
      ownProducts,
      maxKeywords,
    );
    if (keywords.length === 0) {
      throw new BadRequestException(
        "자사 상품명과 카테고리에서 추적 키워드를 만들 수 없습니다.",
      );
    }
    const trackers = await Promise.all(
      keywords.map((keyword) =>
        this.keywordRankRepo.upsertTrackerByKeyword(
          { keyword, maxPages: 2 },
          organizationId,
        ),
      ),
    );
    return {
      configuredCount: trackers.length,
      keywords: trackers.map((tracker) => tracker.keyword),
      storefrontProductCount: storefrontProducts.length,
    };
  }

  async getSellerTargets(organizationId: string, days: number, limit: number) {
    const [context, snapshots] = await Promise.all([
      this.loadOwnProductContext(organizationId),
      this.keywordRankRepo.findRecentSerpSnapshots(organizationId, days),
    ]);
    const overview = buildCompetitorTrackingOverview(
      context.ownProducts,
      snapshots,
      Math.max(limit, 50),
    );
    const discoveredTargets = overview.sellers
      .filter(
        (seller) =>
          seller.sellerResolved &&
          seller.sellerId &&
          seller.sellerStoreUrl &&
          seller.products[0]?.keywords[0],
      )
      .slice(0, limit)
      .map((seller) => ({
        sellerId: seller.sellerId!,
        sellerName: seller.sellerName,
        sellerStoreUrl: seller.sellerStoreUrl!,
        keyword: seller.products[0].keywords[0],
        priorityScore: seller.priorityScore,
        overlapProductCount: seller.overlapProductCount,
        matchedOwnProductCount: seller.matchedOwnProductCount,
      }));
    const watchedTargets = listCompetitorSellerWatchlist().map((seller) => ({
      sellerId: seller.sellerId,
      sellerName: seller.sellerName,
      sellerStoreUrl: seller.sellerStoreUrl,
      keyword: seller.discoveryKeyword,
      priorityScore: seller.discoverySource === "user" ? 100 : 80,
      overlapProductCount: 0,
      matchedOwnProductCount: 0,
    }));
    return {
      targets: [
        ...new Map(
          [...watchedTargets, ...discoveredTargets].map((target) => [
            target.sellerId,
            target,
          ]),
        ).values(),
      ].slice(0, limit),
    };
  }

  async getProductDetailTargets(
    organizationId: string,
    days: number,
    limit: number,
  ) {
    const [context, snapshots] = await Promise.all([
      this.loadOwnProductContext(organizationId),
      this.keywordRankRepo.findRecentSerpSnapshots(organizationId, days),
    ]);
    const overview = buildCompetitorTrackingOverview(
      context.ownProducts,
      snapshots,
      Number.MAX_SAFE_INTEGER,
    );
    const targets = overview.sellers
      .filter((seller) => !seller.sellerResolved)
      .flatMap((seller) => seller.products)
      .flatMap((product) =>
        product.keywords.map((keyword) => ({
          keyword,
          productKey: product.productKey,
          productId: product.productId,
          vendorItemId: product.vendorItemId,
          name: product.name,
          link: product.link,
          rank: product.rank,
          matchScore: product.matchedOwnProducts[0]?.score ?? 0,
        })),
      )
      .filter((target): target is typeof target & { link: string } =>
        Boolean(target.link),
      )
      .sort((a, b) => b.matchScore - a.matchScore || a.rank - b.rank);
    return {
      targets: [
        ...new Map(
          targets.map((target) => [
            `${target.keyword}:${target.productKey}`,
            target,
          ]),
        ).values(),
      ].slice(0, limit),
    };
  }

  private async loadOwnProductContext(organizationId: string): Promise<{
    ownProducts: CompetitorOwnProduct[];
    wingProductCount: number;
    storefrontProducts: KiditemStorefrontProduct[];
  }> {
    const [wingProducts, storefrontProducts] = await Promise.all([
      this.keywordRankRepo.listOwnVendorItems(organizationId),
      this.kiditemStorefront.listNewProducts().catch((error: unknown) => {
        this.logger.warn(
          `KidItem storefront product load failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return [];
      }),
    ]);
    const storefrontOwnProducts =
      toKiditemStorefrontOwnProducts(storefrontProducts);
    const byVendorItemId = new Map(
      [...wingProducts, ...storefrontOwnProducts].map((product) => [
        product.vendorItemId,
        product,
      ]),
    );
    return {
      ownProducts: [...byVendorItemId.values()],
      wingProductCount: wingProducts.length,
      storefrontProducts,
    };
  }

  private deriveTrackingKeywords(
    storefrontProducts: KiditemStorefrontProduct[],
    ownProducts: CompetitorOwnProduct[],
    limit: number,
  ): string[] {
    const cappedLimit = Math.max(1, Math.min(20, Math.trunc(limit)));
    const watchKeywords = listCompetitorWatchKeywords();
    const storefrontKeywords = deriveKiditemStorefrontKeywords(
      storefrontProducts,
      cappedLimit,
    );
    const catalogKeywords = deriveCompetitorKeywords(ownProducts, cappedLimit);
    return [
      ...new Set([...watchKeywords, ...storefrontKeywords, ...catalogKeywords]),
    ].slice(0, cappedLimit);
  }
}

function discoverySourceRank(
  source: "user" | "kiditem" | null,
): number {
  if (source === "user") return 0;
  if (source === "kiditem") return 1;
  return 2;
}
