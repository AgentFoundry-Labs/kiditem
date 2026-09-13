import { Prisma } from '@prisma/client';
import { addDays, currentBusinessDate } from '../../common/kst';
import type {
  RankHistoryRow,
  RankOverviewSnapshotRow,
  SerpSnapshotRow,
  WingSalesRankSnapshotRow,
} from '../application/port/out/repository/keyword-rank.repository.port';

const COMPLETE_SERP_SOURCE = {
  sourceType: 'coupang_keyword_serp',
  parserVersion: 'keyword-serp-v1',
  status: 'completed',
} as const;

const COMPLETE_WING_RANK_SOURCE = {
  sourceType: 'coupang_wing_rank',
  parserVersion: 'wing-rank-v1',
  status: 'completed',
} as const;

function inclusiveWindowStart(days: number): Date {
  return addDays(currentBusinessDate(), -(Math.max(1, days) - 1));
}

export function readKeywordRankHistory(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; keyword: string; days: number },
): Promise<RankHistoryRow[]> {
  const since = inclusiveWindowStart(input.days);
  return tx.coupangKeywordRankDailySnapshot.findMany({
    where: {
      organizationId: input.organizationId,
      sourceImportRun: {
        organizationId: input.organizationId,
        ...COMPLETE_SERP_SOURCE,
        rankKeyword: input.keyword,
        keywordSerpDailyProjections: {
          some: {
            organizationId: input.organizationId,
            keyword: input.keyword,
            businessDate: { gte: since },
          },
        },
      },
      keyword: input.keyword,
      businessDate: { gte: since },
    },
    orderBy: [{ vendorItemId: 'asc' }, { businessDate: 'asc' }],
    select: {
      vendorItemId: true,
      businessDate: true,
      productName: true,
      overallRank: true,
      organicRank: true,
      adRank: true,
      page: true,
    },
  });
}

export function readKeywordRankOverviewSnapshots(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; days: number },
): Promise<RankOverviewSnapshotRow[]> {
  const since = inclusiveWindowStart(input.days);
  return tx.coupangKeywordRankDailySnapshot.findMany({
    where: {
      organizationId: input.organizationId,
      sourceImportRun: {
        organizationId: input.organizationId,
        ...COMPLETE_SERP_SOURCE,
        keywordSerpDailyProjections: {
          some: {
            organizationId: input.organizationId,
            businessDate: { gte: since },
          },
        },
      },
      businessDate: { gte: since },
    },
    orderBy: [
      { keyword: 'asc' },
      { vendorItemId: 'asc' },
      { businessDate: 'asc' },
      { capturedAt: 'asc' },
      { updatedAt: 'asc' },
      { id: 'asc' },
    ],
    select: {
      keyword: true,
      vendorItemId: true,
      businessDate: true,
      productName: true,
      overallRank: true,
      organicRank: true,
      adRank: true,
      capturedAt: true,
      updatedAt: true,
      id: true,
    },
  });
}

export async function readWingSalesRankSnapshots(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; days: number },
): Promise<WingSalesRankSnapshotRow[]> {
  const since = inclusiveWindowStart(input.days);
  const rows = await tx.coupangWingSalesRankDailySnapshot.findMany({
    where: {
      organizationId: input.organizationId,
      businessDate: { gte: since },
      sourceImportRun: {
        organizationId: input.organizationId,
        ...COMPLETE_WING_RANK_SOURCE,
      },
    },
    orderBy: [
      { keyword: 'asc' },
      { vendorItemId: 'asc' },
      { businessDate: 'asc' },
      { capturedAt: 'asc' },
      { updatedAt: 'asc' },
      { id: 'asc' },
    ],
    select: {
      keyword: true,
      vendorItemId: true,
      businessDate: true,
      productName: true,
      categoryHierarchy: true,
      salesRank: true,
      salesLast28d: true,
      viewsLast28d: true,
      revenueLast28d: true,
      conversionRate28d: true,
      salePrice: true,
      reviewCount: true,
      keywordSalesLast28d: true,
      keywordViewsLast28d: true,
      keywordConversionRate28d: true,
      collectedCount: true,
      totalResults: true,
      capturedAt: true,
      updatedAt: true,
      id: true,
    },
  });
  return rows.map((row) => ({
    ...row,
    conversionRate28d:
      row.conversionRate28d === null ? null : Number(row.conversionRate28d),
    keywordConversionRate28d:
      row.keywordConversionRate28d === null
        ? null
        : Number(row.keywordConversionRate28d),
  }));
}

export function readLatestSerpSnapshot(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; keyword: string },
): Promise<SerpSnapshotRow | null> {
  return tx.coupangKeywordSerpDailySnapshot.findFirst({
    where: {
      organizationId: input.organizationId,
      sourceImportRun: {
        organizationId: input.organizationId,
        ...COMPLETE_SERP_SOURCE,
      },
      keyword: input.keyword,
    },
    orderBy: [{ businessDate: 'desc' }, { capturedAt: 'desc' }, { updatedAt: 'desc' }, { id: 'desc' }],
    select: {
      keyword: true,
      businessDate: true,
      capturedAt: true,
      updatedAt: true,
      id: true,
      pagesScanned: true,
      itemCount: true,
      items: true,
    },
  });
}

export function readRecentSerpSnapshots(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; days: number },
): Promise<SerpSnapshotRow[]> {
  const since = inclusiveWindowStart(input.days);
  return tx.coupangKeywordSerpDailySnapshot.findMany({
    where: {
      organizationId: input.organizationId,
      sourceImportRun: {
        organizationId: input.organizationId,
        ...COMPLETE_SERP_SOURCE,
      },
      businessDate: { gte: since },
    },
    orderBy: [
      { keyword: 'asc' },
      { businessDate: 'asc' },
      { capturedAt: 'asc' },
      { updatedAt: 'asc' },
      { id: 'asc' },
    ],
    select: {
      keyword: true,
      businessDate: true,
      capturedAt: true,
      updatedAt: true,
      id: true,
      pagesScanned: true,
      itemCount: true,
      items: true,
    },
  });
}

export type WingRankCoverageFacts = Readonly<{
  businessDate: Date | null;
  capturedAt: Date | null;
  vendorItemIds: readonly string[];
  rowCount: number;
}>;

export async function readWingRankCoverage(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; vendorItemIds: readonly string[] },
): Promise<WingRankCoverageFacts> {
  if (input.vendorItemIds.length === 0) {
    return { businessDate: null, capturedAt: null, vendorItemIds: [], rowCount: 0 };
  }
  const latest = await tx.coupangWingSalesRankDailySnapshot.findFirst({
    where: {
      organizationId: input.organizationId,
      vendorItemId: { in: [...input.vendorItemIds] },
      sourceImportRun: {
        organizationId: input.organizationId,
        ...COMPLETE_WING_RANK_SOURCE,
      },
    },
    orderBy: [{ businessDate: 'desc' }, { capturedAt: 'desc' }, { updatedAt: 'desc' }, { id: 'desc' }],
    select: { capturedAt: true, businessDate: true },
  });
  if (!latest) {
    return { businessDate: null, capturedAt: null, vendorItemIds: [], rowCount: 0 };
  }
  const where = {
    organizationId: input.organizationId,
    businessDate: latest.businessDate,
    vendorItemId: { in: [...input.vendorItemIds] },
    sourceImportRun: {
      organizationId: input.organizationId,
      ...COMPLETE_WING_RANK_SOURCE,
    },
  } satisfies Prisma.CoupangWingSalesRankDailySnapshotWhereInput;
  const rows = await tx.coupangWingSalesRankDailySnapshot.findMany({
    where,
    select: { vendorItemId: true },
    distinct: ['vendorItemId'],
  });
  const rowCount = await tx.coupangWingSalesRankDailySnapshot.count({ where });
  return {
    businessDate: latest.businessDate,
    capturedAt: latest.capturedAt,
    vendorItemIds: [...new Set(rows.map((row) => row.vendorItemId))],
    rowCount,
  };
}
