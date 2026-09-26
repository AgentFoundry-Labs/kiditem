import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from "@nestjs/common";
import type { CompetitorCollectionFacts } from "@kiditem/shared/advertising";
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
import type {
  CompetitorCatalogPlan,
  CompetitorCatalogResult,
  CompetitorCatalogScope,
  CompetitorSellerIdentityPlan,
  CompetitorSellerIdentityResult,
} from "@kiditem/shared/advertising-operations";
import { KiditemConflictError } from "@kiditem/shared/errors";
import {
  assembleCompetitorCatalogs,
  planCompetitorCatalog,
} from "../../domain/competitor-catalog-operation";
import type { OperationStagedChunk } from "@kiditem/shared/operation";
import type { OwnerTransaction } from "../../../common/owner-transaction";
import {
  assembleSellerIdentities,
  planSellerIdentity,
} from "../../domain/competitor-seller-identity-operation";
import { KeywordRankIngestHandler } from "./keyword-rank-ingest.handler";

@Injectable()
export class CompetitorTrackingService {
  private readonly logger = new Logger(CompetitorTrackingService.name);

  constructor(
    @Inject(KEYWORD_RANK_REPOSITORY_PORT)
    private readonly keywordRankRepo: KeywordRankRepositoryPort,
    @Inject(KIDITEM_STOREFRONT_PORT)
    private readonly kiditemStorefront: KiditemStorefrontPort,
    private readonly ingest: KeywordRankIngestHandler,
  ) {}

  /**
   * 경쟁 판매자 확인 실행의 계획(`advertising.competitor_seller_identity`, KID-362): 최근 30일 SERP에서 판매자를 모르는
   * 경쟁 상품 200개(옛 attempt 선택 그대로), 키워드를 주면 그 키워드만.
   */
  async planSellerIdentityOperation(organizationId: string, keywords?: readonly string[]): Promise<CompetitorSellerIdentityPlan> {
    const selected = await this.getProductDetailTargets(organizationId, 30, 200);
    return planSellerIdentity({ selected: selected.targets, keywords });
  }

  /** finish 트랜잭션에서 확인한 판매자를 그 키워드의 최신 SERP 스냅샷 상품에 적는다(실행이 발행한 SERP 행만). */
  async publishSellerIdentityOperation(tx: OwnerTransaction, input: {
    organizationId: string;
    operationId: string;
    plan: CompetitorSellerIdentityPlan;
    chunks: readonly OperationStagedChunk[];
  }): Promise<CompetitorSellerIdentityResult> {
    const identities = assembleSellerIdentities(input.plan, input.chunks);
    const capturedAt = identities.map((identity) => identity.capturedAt).sort().at(-1) ?? new Date().toISOString();
    const applied = await this.keywordRankRepo.runInTransaction(tx, () =>
      this.ingest.executeSellerIdentities(
        { type: "competitor_seller_identity", source: "coupang-overlap-product-detail", timestamp: capturedAt, data: identities },
        input.organizationId,
        input.operationId,
      ));
    return {
      targets: input.plan.targets.length,
      identities: identities.length,
      resolvedProductCount: applied.results.reduce((total, result) => total + result.resolvedProductCount, 0),
    };
  }

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

    // The screen derives its collection word from these counts with the shared
    // `competitorCollectionStatus`; the overview publishes no word of its own.
    const collectionFacts = {
      ownProductCount: ownProducts.length,
      enabledTrackerCount: enabledTrackers.length,
      serpSnapshotCount: snapshots.length,
    } satisfies CompetitorCollectionFacts;

    return {
      periodDays: days,
      collection: {
        ...collectionFacts,
        wingProductCount,
        storefrontProductCount: storefrontProducts.length,
        trackerCount: trackers.length,
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

  /** 경쟁사 카탈로그 실행의 계획(`advertising.competitor_catalog`, KID-362): 최근 30일 판매자 선택 20명(옛 attempt 그대로). */
  async planCatalogOperation(organizationId: string, scope: CompetitorCatalogScope): Promise<CompetitorCatalogPlan> {
    const selected = await this.getSellerTargets(organizationId, 30, 20);
    return planCompetitorCatalog({ selected: selected.targets, scope });
  }

  /**
   * finish 트랜잭션에서 판매자샵 카탈로그를 그 키워드의 최신 SERP 스냅샷(실행이 발행한 행)에 붙인다. SERP가 없거나 더 새
   * 카탈로그가 있으면 그 판매자는 건너뛴다(ignored). 계획한 판매자가 모두 저장·건너뜀으로 끝나야 한다.
   */
  async publishCatalogOperation(tx: OwnerTransaction, input: {
    organizationId: string;
    plan: CompetitorCatalogPlan;
    chunks: readonly OperationStagedChunk[];
  }): Promise<CompetitorCatalogResult> {
    const catalogs = assembleCompetitorCatalogs(input.plan, input.chunks);
    if (catalogs.length === 0) return { targets: 0, captured: 0, ignored: 0 };
    const capturedAt = catalogs.map((catalog) => catalog.capturedAt).sort().at(-1)!;
    const persisted = await this.keywordRankRepo.runInTransaction(tx, () =>
      this.ingest.executeSellerCatalogs(
        { type: "competitor_seller_catalog", source: "coupang-seller-shop", timestamp: capturedAt, data: catalogs as unknown as Array<Record<string, unknown>> },
        input.organizationId,
      ));
    if (persisted.results.length + persisted.ignored.length !== input.plan.targets.length) {
      throw new KiditemConflictError("ADVERTISING_COLLECTION_INCOMPLETE", { details: { reason: "catalog_publication_incomplete" } });
    }
    return { targets: input.plan.targets.length, captured: persisted.results.length, ignored: persisted.ignored.length };
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
