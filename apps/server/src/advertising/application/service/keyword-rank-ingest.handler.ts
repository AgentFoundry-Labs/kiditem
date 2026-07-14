// `keyword_rank` — 쿠팡 검색 SERP 캡처 ingest.
//
// 확장이 www.coupang.com 검색결과를 키워드별로 캡처해 보내면
// (1) 추적 대상(트래커 명시 vendorItemIds ∪ 자사 CoupangProductListing)을
//     매칭해 키워드×상품×일자 rank fact 를 upsert 하고
// (2) SERP 전체를 키워드×일자당 최신본으로 upsert 한다.
//
// 매칭 규칙:
// - 같은 vendorItemId 가 광고+오가닉으로 두 번 노출되면 overallRank 는
//   최소(min) 전체 순위, organicRank/adRank 는 각 노출 유형에서의 순위로
//   fold 한다. 서술 필드(page, priceKrw 등)는 best(min overall) 노출 기준.
// - 트래커에 명시된 vendorItemId 가 캡처에 없으면 순위 null 미노출(miss)
//   행을 upsert 한다(순위권 밖 기록).
// - 자동매칭 전용(자사 카탈로그) 상품은 노출됐을 때만 행을 만든다
//   (일별 null 스팸 방지).
// - 미등록 키워드 캡처가 오면 트래커를 즉석 생성한다(enabled=true,
//   vendorItemIds=[]).
//
// 아이템 파싱은 방어적으로 — 형식이 깨진 항목은 건너뛰고 절대 한 행
// 때문에 전체 ingest 를 실패시키지 않는다.

import { Inject, Injectable, Logger } from "@nestjs/common";
import { resolveBusinessDate } from "../../domain/business-date";
import {
  cleanString,
  toNumberOrNull,
} from "../../domain/scrape-row-normalizers";
import {
  KEYWORD_RANK_REPOSITORY_PORT,
  type KeywordRankRepositoryPort,
  type UpsertRankSnapshotInput,
} from "../port/out/repository/keyword-rank.repository.port";
import type { ExtensionSyncDto } from "../../adapter/in/http/dto";

interface ParsedSerpItem {
  rank: number;
  page: number | null;
  positionInPage: number | null;
  isAd: boolean;
  productId: string | null;
  itemId: string | null;
  vendorItemId: string | null;
  name: string | null;
  priceKrw: number | null;
  reviewCount: number | null;
  ratingScore: number | null;
  sellerName: string | null;
  sellerId: string | null;
  sellerStoreUrl: string | null;
  imageUrl: string | null;
  link: string | null;
}

interface RankFold {
  overallRank: number;
  organicRank: number | null;
  adRank: number | null;
  bestItem: ParsedSerpItem;
}

interface ParsedSellerCatalog {
  sellerId: string;
  sellerName: string | null;
  sellerStoreUrl: string;
  totalProductCount: number | null;
  collectedProductCount: number;
  isTruncated: boolean;
  sort: "newest";
  capturedAt: string;
  products: Array<Record<string, unknown>>;
}

@Injectable()
export class KeywordRankIngestHandler {
  private readonly logger = new Logger(KeywordRankIngestHandler.name);

  constructor(
    @Inject(KEYWORD_RANK_REPOSITORY_PORT)
    private readonly keywordRankRepo: KeywordRankRepositoryPort,
  ) {}

  async execute(payload: ExtensionSyncDto, organizationId: string) {
    const entries = payload.data ?? [];
    const ownItems =
      await this.keywordRankRepo.listOwnVendorItems(organizationId);
    const ownNameByVendorItemId = new Map(
      ownItems.map((item) => [item.vendorItemId, item.productName]),
    );

    const results: Array<{
      keyword: string;
      businessDate: string;
      matchedCount: number;
      targetMissCount: number;
      serpSaved: true;
    }> = [];

    for (const entry of entries) {
      const keyword =
        entry && typeof entry === "object"
          ? cleanString((entry as Record<string, unknown>).keyword)
          : null;
      if (!keyword) {
        this.logger.warn(
          "keyword_rank ingest skipped entry without keyword (malformed capture)",
        );
        continue;
      }
      const row = entry as Record<string, unknown>;

      const capturedAtRaw =
        cleanString(row.capturedAt) ?? payload.timestamp ?? null;
      const capturedAtParsed = capturedAtRaw ? new Date(capturedAtRaw) : null;
      const capturedAt =
        capturedAtParsed && Number.isFinite(capturedAtParsed.getTime())
          ? capturedAtParsed
          : new Date();
      const businessDate = resolveBusinessDate(
        cleanString(row.capturedAt),
        payload.timestamp,
      );

      const items = this.parseItems(row.items, keyword);
      const incomingSellerCatalogs = this.parseSellerCatalogs(
        row.sellerCatalogs,
      );

      let tracker = await this.keywordRankRepo.getTrackerByKeyword(
        keyword,
        organizationId,
      );
      if (!tracker) {
        // 미등록 키워드 캡처 — 트래커 즉석 생성(자사 자동매칭만).
        tracker = await this.keywordRankRepo.upsertTrackerByKeyword(
          { keyword, vendorItemIds: [] },
          organizationId,
        );
      }

      const explicitTargets = new Set(tracker.vendorItemIds);
      const folds = this.foldOccurrences(
        items,
        (vendorItemId) =>
          explicitTargets.has(vendorItemId) ||
          ownNameByVendorItemId.has(vendorItemId),
      );

      const rankRows: UpsertRankSnapshotInput[] = [];
      for (const [vendorItemId, fold] of folds) {
        const best = fold.bestItem;
        rankRows.push({
          organizationId,
          keyword,
          vendorItemId,
          businessDate,
          productId: best.productId,
          itemId: best.itemId,
          productName:
            best.name ?? ownNameByVendorItemId.get(vendorItemId) ?? null,
          overallRank: fold.overallRank,
          organicRank: fold.organicRank,
          adRank: fold.adRank,
          page: best.page,
          positionInPage: best.positionInPage,
          priceKrw: best.priceKrw,
          reviewCount: best.reviewCount,
          capturedAt,
        });
      }

      // 명시 타깃 미노출(miss) 행 — 순위권 밖 기록. 자동매칭 전용 상품은
      // 노출됐을 때만 행을 만들므로 여기서 제외된다.
      let targetMissCount = 0;
      for (const vendorItemId of explicitTargets) {
        if (folds.has(vendorItemId)) continue;
        targetMissCount += 1;
        rankRows.push({
          organizationId,
          keyword,
          vendorItemId,
          businessDate,
          productId: null,
          itemId: null,
          productName: ownNameByVendorItemId.get(vendorItemId) ?? null,
          overallRank: null,
          organicRank: null,
          adRank: null,
          page: null,
          positionInPage: null,
          priceKrw: null,
          reviewCount: null,
          capturedAt,
        });
      }

      await this.keywordRankRepo.upsertRankSnapshots(rankRows);
      const existingSnapshot = await this.keywordRankRepo.findLatestSerp(
        organizationId,
        keyword,
      );
      const existingEnvelope = this.readSnapshotEnvelope(
        existingSnapshot?.items,
      );
      const sellerCatalogs = this.mergeSellerCatalogs(
        existingSnapshot &&
          existingSnapshot.businessDate.getTime() === businessDate.getTime()
          ? existingEnvelope.sellerCatalogs
          : [],
        incomingSellerCatalogs,
      );
      await this.keywordRankRepo.upsertSerpSnapshot({
        organizationId,
        keyword,
        businessDate,
        items: {
          serpItems: items.map((item) => ({ ...item })),
          sellerCatalogs,
        },
        itemCount: items.length,
        pagesScanned:
          toNumberOrNull(row.pagesScanned) ??
          items.reduce((max, item) => Math.max(max, item.page ?? 0), 0),
        capturedAt,
      });
      await this.keywordRankRepo.touchTrackerCaptured(
        tracker.id,
        organizationId,
        capturedAt,
      );

      results.push({
        keyword,
        businessDate: businessDate.toISOString().slice(0, 10),
        matchedCount: folds.size,
        targetMissCount,
        serpSaved: true,
      });
    }

    return { success: true, results };
  }

  async executeSellerCatalogs(
    payload: ExtensionSyncDto,
    organizationId: string,
  ) {
    const results: Array<{
      keyword: string;
      sellerId: string;
      productCount: number;
      saved: true;
    }> = [];
    for (const entry of payload.data ?? []) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        continue;
      }
      const row = entry as Record<string, unknown>;
      const keyword = cleanString(row.keyword);
      const catalog = this.parseSellerCatalogs([row])[0];
      if (!keyword || !catalog) continue;
      const snapshot = await this.keywordRankRepo.findLatestSerp(
        organizationId,
        keyword,
      );
      if (!snapshot) {
        this.logger.warn(
          `competitor_seller_catalog skipped without SERP snapshot (keyword=${keyword})`,
        );
        continue;
      }
      const envelope = this.readSnapshotEnvelope(snapshot.items);
      const sellerCatalogs = this.mergeSellerCatalogs(envelope.sellerCatalogs, [
        catalog,
      ]);
      const capturedAt = new Date(catalog.capturedAt);
      await this.keywordRankRepo.upsertSerpSnapshot({
        organizationId,
        keyword,
        businessDate: snapshot.businessDate,
        items: {
          serpItems: envelope.serpItems,
          sellerCatalogs,
        },
        itemCount: snapshot.itemCount,
        pagesScanned: snapshot.pagesScanned,
        capturedAt,
      });
      results.push({
        keyword,
        sellerId: catalog.sellerId,
        productCount: catalog.products.length,
        saved: true,
      });
    }
    return { success: true, results };
  }

  async executeSellerIdentities(
    payload: ExtensionSyncDto,
    organizationId: string,
  ) {
    const byKeyword = new Map<string, Array<Record<string, unknown>>>();
    for (const entry of payload.data ?? []) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        continue;
      }
      const row = entry as Record<string, unknown>;
      const keyword = cleanString(row.keyword);
      const sellerName = cleanString(row.sellerName);
      const sellerId = cleanString(row.sellerId);
      const sellerStoreUrl = cleanString(row.sellerStoreUrl);
      const productKey = cleanString(row.productKey);
      if (
        !keyword ||
        !sellerName ||
        !sellerId ||
        !sellerStoreUrl ||
        !productKey ||
        !this.isSellerStoreUrl(sellerStoreUrl)
      ) {
        continue;
      }
      const rows = byKeyword.get(keyword) ?? [];
      rows.push(row);
      byKeyword.set(keyword, rows);
    }

    const results: Array<{
      keyword: string;
      resolvedProductCount: number;
      saved: true;
    }> = [];
    for (const [keyword, identities] of byKeyword) {
      const snapshot = await this.keywordRankRepo.findLatestSerp(
        organizationId,
        keyword,
      );
      if (!snapshot) continue;
      const envelope = this.readSnapshotEnvelope(snapshot.items);
      const identityByProductKey = new Map(
        identities.map((identity) => [
          cleanString(identity.productKey)!,
          identity,
        ]),
      );
      let resolvedProductCount = 0;
      const serpItems = envelope.serpItems.map((item) => {
        const key = this.snapshotProductKey(item);
        const identity = identityByProductKey.get(key);
        if (!identity) return item;
        resolvedProductCount += 1;
        return {
          ...item,
          sellerName: cleanString(identity.sellerName),
          sellerId: cleanString(identity.sellerId),
          sellerStoreUrl: cleanString(identity.sellerStoreUrl),
        };
      });
      if (resolvedProductCount === 0) continue;
      const capturedAt =
        identities
          .map((identity) => cleanString(identity.capturedAt))
          .filter((value): value is string => Boolean(value))
          .map((value) => new Date(value))
          .filter((value) => Number.isFinite(value.getTime()))
          .sort((a, b) => a.getTime() - b.getTime())
          .at(-1) ?? snapshot.capturedAt;
      await this.keywordRankRepo.upsertSerpSnapshot({
        organizationId,
        keyword,
        businessDate: snapshot.businessDate,
        items: { serpItems, sellerCatalogs: envelope.sellerCatalogs },
        itemCount: snapshot.itemCount,
        pagesScanned: snapshot.pagesScanned,
        capturedAt,
      });
      results.push({ keyword, resolvedProductCount, saved: true });
    }
    return { success: true, results };
  }

  private snapshotProductKey(item: Record<string, unknown>): string {
    return (
      cleanString(item.vendorItemId) ||
      cleanString(item.productId) ||
      `name:${String(cleanString(item.name) || "")
        .normalize("NFKC")
        .toLocaleLowerCase("ko")
        .replace(/\s+/g, " ")
        .trim()}`
    );
  }

  private readSnapshotEnvelope(raw: unknown): {
    serpItems: Array<Record<string, unknown>>;
    sellerCatalogs: ParsedSellerCatalog[];
  } {
    if (Array.isArray(raw)) {
      return {
        serpItems: raw.filter(
          (item): item is Record<string, unknown> =>
            Boolean(item) && typeof item === "object" && !Array.isArray(item),
        ),
        sellerCatalogs: [],
      };
    }
    if (!raw || typeof raw !== "object") {
      return { serpItems: [], sellerCatalogs: [] };
    }
    const envelope = raw as Record<string, unknown>;
    return {
      serpItems: Array.isArray(envelope.serpItems)
        ? envelope.serpItems.filter(
            (item): item is Record<string, unknown> =>
              Boolean(item) && typeof item === "object" && !Array.isArray(item),
          )
        : [],
      sellerCatalogs: this.parseSellerCatalogs(envelope.sellerCatalogs),
    };
  }

  private mergeSellerCatalogs(
    existing: ParsedSellerCatalog[],
    incoming: ParsedSellerCatalog[],
  ): ParsedSellerCatalog[] {
    const bySellerId = new Map(
      existing.map((catalog) => [catalog.sellerId, catalog]),
    );
    for (const catalog of incoming) bySellerId.set(catalog.sellerId, catalog);
    return [...bySellerId.values()];
  }

  private parseSellerCatalogs(raw: unknown): ParsedSellerCatalog[] {
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((candidate) => {
      if (
        !candidate ||
        typeof candidate !== "object" ||
        Array.isArray(candidate)
      ) {
        return [];
      }
      const row = candidate as Record<string, unknown>;
      const sellerId = cleanString(row.sellerId);
      const sellerStoreUrl = cleanString(row.sellerStoreUrl);
      if (
        !sellerId ||
        !sellerStoreUrl ||
        !this.isSellerStoreUrl(sellerStoreUrl)
      ) {
        return [];
      }
      const products = Array.isArray(row.products)
        ? row.products.flatMap((value, index) => {
            if (!value || typeof value !== "object" || Array.isArray(value))
              return [];
            const product = value as Record<string, unknown>;
            const name = cleanString(product.name);
            const productId = cleanString(product.productId);
            const itemId = cleanString(product.itemId);
            const vendorItemId = cleanString(product.vendorItemId);
            if (!name || (!productId && !itemId && !vendorItemId)) return [];
            return [
              {
                sourceRank: toNumberOrNull(product.sourceRank) ?? index + 1,
                productId,
                itemId,
                vendorItemId,
                name,
                priceKrw: toNumberOrNull(product.priceKrw),
                reviewCount: toNumberOrNull(product.reviewCount),
                imageUrl: cleanString(product.imageUrl),
                link: cleanString(product.link),
              },
            ];
          })
        : [];
      if (products.length === 0) return [];
      const capturedAtRaw = cleanString(row.capturedAt);
      const capturedAt =
        capturedAtRaw && Number.isFinite(new Date(capturedAtRaw).getTime())
          ? new Date(capturedAtRaw).toISOString()
          : new Date().toISOString();
      return [
        {
          sellerId,
          sellerName: cleanString(row.sellerName),
          sellerStoreUrl,
          totalProductCount: toNumberOrNull(row.totalProductCount),
          collectedProductCount: products.length,
          isTruncated: row.isTruncated === true,
          sort: "newest" as const,
          capturedAt,
          products,
        },
      ];
    });
  }

  private isSellerStoreUrl(value: string): boolean {
    try {
      const parsed = new URL(value);
      return (
        parsed.protocol === "https:" && parsed.hostname === "shop.coupang.com"
      );
    } catch {
      return false;
    }
  }

  /**
   * SERP 아이템 방어적 파싱. 객체가 아니거나 rank 를 복원할 수 없는 항목만
   * 건너뛰고, 나머지 필드는 null 로 관대하게 받는다.
   */
  private parseItems(raw: unknown, keyword: string): ParsedSerpItem[] {
    if (!Array.isArray(raw)) return [];
    const items: ParsedSerpItem[] = [];
    for (const candidate of raw) {
      if (
        !candidate ||
        typeof candidate !== "object" ||
        Array.isArray(candidate)
      ) {
        this.logger.warn(
          `keyword_rank ingest skipped malformed SERP item (keyword=${keyword})`,
        );
        continue;
      }
      const item = candidate as Record<string, unknown>;
      // rank 누락 시 파싱 순서(DOM 순서) 기반으로 복원한다.
      const rank = toNumberOrNull(item.rank) ?? items.length + 1;
      items.push({
        rank,
        page: toNumberOrNull(item.page),
        positionInPage: toNumberOrNull(item.positionInPage),
        isAd: item.isAd === true,
        productId: cleanString(item.productId),
        itemId: cleanString(item.itemId),
        vendorItemId: cleanString(item.vendorItemId),
        name: cleanString(item.name),
        priceKrw: toNumberOrNull(item.priceKrw),
        reviewCount: toNumberOrNull(item.reviewCount),
        ratingScore:
          typeof item.ratingScore === "number" &&
          Number.isFinite(item.ratingScore)
            ? item.ratingScore
            : null,
        sellerName: cleanString(item.sellerName),
        sellerId: cleanString(item.sellerId),
        sellerStoreUrl: cleanString(item.sellerStoreUrl),
        imageUrl: cleanString(item.imageUrl),
        link: cleanString(item.link),
      });
    }
    return items;
  }

  /**
   * 추적 대상 vendorItemId 별 best-occurrence fold. DOM 순서로 걸으며
   * 오가닉/광고 각각의 순위 카운터를 유지한다 — organicRank 는 오가닉
   * 아이템만 센 순위, adRank 는 광고 아이템만 센 순위.
   */
  private foldOccurrences(
    items: ParsedSerpItem[],
    isTarget: (vendorItemId: string) => boolean,
  ): Map<string, RankFold> {
    const folds = new Map<string, RankFold>();
    let organicPosition = 0;
    let adPosition = 0;
    for (const item of items) {
      if (item.isAd) adPosition += 1;
      else organicPosition += 1;

      const vendorItemId = item.vendorItemId;
      if (!vendorItemId || !isTarget(vendorItemId)) continue;

      const organicRank = item.isAd ? null : organicPosition;
      const adRank = item.isAd ? adPosition : null;
      const existing = folds.get(vendorItemId);
      if (!existing) {
        folds.set(vendorItemId, {
          overallRank: item.rank,
          organicRank,
          adRank,
          bestItem: item,
        });
        continue;
      }
      if (item.rank < existing.overallRank) {
        existing.overallRank = item.rank;
        existing.bestItem = item;
      }
      if (organicRank !== null) {
        existing.organicRank =
          existing.organicRank === null
            ? organicRank
            : Math.min(existing.organicRank, organicRank);
      }
      if (adRank !== null) {
        existing.adRank =
          existing.adRank === null ? adRank : Math.min(existing.adRank, adRank);
      }
    }
    return folds;
  }
}
