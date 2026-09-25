import type { Prisma } from '@prisma/client';
import { SOURCE_IMPORT_RUN_COMPLETED_STATUS } from '@kiditem/shared/source-import';
import {
  CATALOG_BASICS_SOURCE,
  CATALOG_DETAILS_SOURCE,
  CATALOG_PARSER,
  CATALOG_SOURCE,
  ROCKET_SELLPIA_MATCHING_CSV_SOURCE_TYPE,
} from '../../../domain/collection/catalog-source-identity';
import {
  ROCKET_PO_CATALOG_PARSER_VERSION,
  ROCKET_PO_CATALOG_SOURCE_TYPE,
} from '../../../../orders/application/port/in/rocket-po-catalog.port';
import {
  MALL_ADMIN_LISTINGS_PARSER_VERSION,
  MALL_ADMIN_LISTINGS_SOURCE_TYPE,
} from '@kiditem/shared/mall-admin-listings';
import {
  SABANGNET_MALL_LISTINGS_PARSER_VERSION,
  SABANGNET_MALL_LISTINGS_SOURCE_TYPE,
} from '@kiditem/shared/sabangnet-mall-listings';

/**
 * Raw source markers only a catalog owner publication writes on an option: the
 * basics or details terminal of a browser import. `coupang_catalog_browser`
 * remains on rows the removed full stage wrote.
 */
const PUBLISHED_CATALOG_OPTION_SOURCES = [
  'coupang_catalog_browser',
  'coupang_catalog_basics',
  'coupang_catalog_details',
] as const;

/** Catalog file imports whose completed status alone certifies their listings. */
const COMPLETED_FILE_CATALOG_SOURCE_TYPES = [
  CATALOG_SOURCE,
  'coupang_rocket_catalog_seed',
  ROCKET_SELLPIA_MATCHING_CSV_SOURCE_TYPE,
];

/**
 * The one rule for a source import run whose listings are catalog identity for
 * matching availability, Sellpia alias candidates, the matching row lock, and
 * readiness: a completed catalog file import, a Rocket PO catalog, a Sabangnet
 * mall listing import or a mall admin listing import its owner certifies by
 * parser version, or a completed catalog-owner basics/details publication.
 */
export function completedCatalogRunWhere(
  organizationId: string,
  channelAccountId?: string,
): Prisma.SourceImportRunWhereInput {
  return {
    organizationId,
    ...(channelAccountId ? { channelAccountId } : {}),
    status: SOURCE_IMPORT_RUN_COMPLETED_STATUS,
    OR: [
      { sourceType: { in: COMPLETED_FILE_CATALOG_SOURCE_TYPES } },
      {
        sourceType: ROCKET_PO_CATALOG_SOURCE_TYPE,
        parserVersion: ROCKET_PO_CATALOG_PARSER_VERSION,
      },
      {
        sourceType: SABANGNET_MALL_LISTINGS_SOURCE_TYPE,
        parserVersion: SABANGNET_MALL_LISTINGS_PARSER_VERSION,
      },
      {
        sourceType: MALL_ADMIN_LISTINGS_SOURCE_TYPE,
        parserVersion: MALL_ADMIN_LISTINGS_PARSER_VERSION,
      },
      {
        sourceType: { in: [CATALOG_BASICS_SOURCE, CATALOG_DETAILS_SOURCE] },
        parserVersion: CATALOG_PARSER,
        importedAt: { not: null },
      },
    ],
  };
}

/** Resolves owner-scoped run IDs for consumers that must join by scalar provenance. */
export async function readCompletedCatalogRunIds(
  tx: Pick<Prisma.TransactionClient, 'sourceImportRun'>,
  input: { organizationId: string; channelAccountId?: string },
): Promise<string[]> {
  const rows = await tx.sourceImportRun.findMany({
    where: completedCatalogRunWhere(input.organizationId, input.channelAccountId),
    select: { id: true },
  });
  return rows.map(({ id }) => id);
}

/**
 * 완료된 반영이 쓴 리스팅: 완료 run이 마지막으로 쓴 행, 또는 실행 계약으로 옮긴 원천(Wing 카탈로그, KID-354)이
 * 쓴 행. 실행은 finish 트랜잭션 안에서만 원장을 쓰므로 `lastOperationId`가 있으면 곧 완료 반영이다.
 */
export function publishedCatalogListingBranches(completedRunIds: readonly string[]): Prisma.ChannelListingWhereInput[] {
  return [
    ...(completedRunIds.length > 0 ? [{ lastImportRunId: { in: [...completedRunIds] } }] : []),
    { lastOperationId: { not: null } },
  ];
}

/**
 * An active option carrying a catalog owner publication marker. It admits a
 * listing as catalog identity for matching availability, Sellpia alias
 * candidates, and the matching row lock even when the listing's last import
 * run is not a completed catalog run.
 */
export function publishedCatalogOptionWhere(
  organizationId: string,
): Prisma.ChannelListingOptionWhereInput {
  return {
    organizationId,
    isActive: true,
    OR: PUBLISHED_CATALOG_OPTION_SOURCES.map((source) => ({
      rawJson: { path: ['source'], equals: source },
    })),
  };
}

/**
 * Counts an account's active listings whose catalog identity is published: the
 * last import is a completed catalog run or a finished operation. Details write listings only in their
 * terminal transaction (KID-348), so no running or failed run publishes a
 * countable listing.
 */
export async function countPublishedCatalogListings(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; channelAccountId: string },
): Promise<number> {
  const { organizationId, channelAccountId } = input;
  const completedRunIds = await readCompletedCatalogRunIds(tx, { organizationId, channelAccountId });
  return tx.channelListing.count({
    where: {
      organizationId,
      channelAccountId,
      isActive: true,
      OR: publishedCatalogListingBranches(completedRunIds),
    },
  });
}
