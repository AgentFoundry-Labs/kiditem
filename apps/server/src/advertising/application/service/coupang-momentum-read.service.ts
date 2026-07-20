import { Inject, Injectable } from '@nestjs/common';
import type {
  CoupangMomentumReadCapabilityPort,
  CoupangSerpMomentumItem,
  CoupangSerpMomentumSnapshot,
  CoupangWingSalesMomentumRow,
} from '../port/in/capability/coupang-momentum-read.port';
import {
  KEYWORD_RANK_REPOSITORY_PORT,
  type KeywordRankRepositoryPort,
  type SerpSnapshotRow,
  type WingSalesRankSnapshotRow,
} from '../port/out/repository/keyword-rank.repository.port';

/**
 * Read-only projection of Coupang momentum evidence for cross-domain consumers.
 * Owns the parsing of advertising's SERP JSON envelope so downstream domains
 * only ever see the normalized item shape. Depends on the repository port, not
 * Prisma, per the advertising Prisma-free service rule.
 */
@Injectable()
export class CoupangMomentumReadService
  implements CoupangMomentumReadCapabilityPort
{
  constructor(
    @Inject(KEYWORD_RANK_REPOSITORY_PORT)
    private readonly keywordRankRepo: KeywordRankRepositoryPort,
  ) {}

  async readSerpMomentum(
    organizationId: string,
    days: number,
  ): Promise<CoupangSerpMomentumSnapshot[]> {
    const rows = await this.keywordRankRepo.findRecentSerpSnapshots(
      organizationId,
      days,
    );
    return rows.map((row) => toSerpSnapshot(row));
  }

  async readWingSalesMomentum(
    organizationId: string,
    days: number,
  ): Promise<CoupangWingSalesMomentumRow[]> {
    const rows = await this.keywordRankRepo.findWingSalesRankSnapshots(
      organizationId,
      days,
    );
    return rows.map((row) => toWingSalesRow(row));
  }
}

function toSerpSnapshot(row: SerpSnapshotRow): CoupangSerpMomentumSnapshot {
  const items = parseSerpItems(row.items);
  return {
    keyword: row.keyword,
    businessDate: dateString(row.businessDate),
    capturedAt: row.capturedAt.toISOString(),
    itemCount: items.length,
    items,
  };
}

function toWingSalesRow(row: WingSalesRankSnapshotRow): CoupangWingSalesMomentumRow {
  return {
    keyword: row.keyword,
    businessDate: dateString(row.businessDate),
    vendorItemId: row.vendorItemId,
    productName: row.productName,
    categoryHierarchy: row.categoryHierarchy,
    salesRank: row.salesRank,
    salesLast28d: row.salesLast28d,
    viewsLast28d: row.viewsLast28d,
    revenueLast28d: row.revenueLast28d,
    conversionRate28d: row.conversionRate28d,
    salePrice: row.salePrice,
    reviewCount: row.reviewCount,
    capturedAt: row.capturedAt.toISOString(),
  };
}

/** SERP envelope is `{ serpItems: [...], sellerCatalogs: [...] }`; parse defensively. */
function parseSerpItems(value: unknown): CoupangSerpMomentumItem[] {
  const rows = extractSerpItemRows(value);
  return rows
    .map((raw) => toSerpItem(raw))
    .filter((item): item is CoupangSerpMomentumItem => item != null);
}

function extractSerpItemRows(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter(isRecord);
  if (!isRecord(value)) return [];
  if (Array.isArray(value.serpItems)) return value.serpItems.filter(isRecord);
  return [];
}

function toSerpItem(raw: Record<string, unknown>): CoupangSerpMomentumItem | null {
  const productId = stringOrNull(raw.productId);
  const vendorItemId = stringOrNull(raw.vendorItemId);
  const itemId = stringOrNull(raw.itemId);
  if (!productId && !vendorItemId && !itemId) return null;
  return {
    rank: intOrNull(raw.rank),
    page: intOrNull(raw.page),
    positionInPage: intOrNull(raw.positionInPage),
    isAd: raw.isAd === true,
    productId,
    itemId,
    vendorItemId,
    name: stringOrNull(raw.name),
    priceKrw: intOrNull(raw.priceKrw),
    reviewCount: intOrNull(raw.reviewCount),
    ratingScore: numberOrNull(raw.ratingScore),
    link: stringOrNull(raw.link),
  };
}

function dateString(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function stringOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function intOrNull(value: unknown): number | null {
  const parsed = numberOrNull(value);
  return parsed == null ? null : Math.round(parsed);
}
