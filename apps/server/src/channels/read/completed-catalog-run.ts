import type { Prisma } from '@prisma/client';
import { SOURCE_IMPORT_RUN_COMPLETED_STATUS } from '@kiditem/shared/source-import';
import {
  CATALOG_BASICS_SOURCE,
  CATALOG_DETAILS_SOURCE,
  CATALOG_PARSER,
  CATALOG_SOURCE,
  ROCKET_SELLPIA_MATCHING_CSV_SOURCE_TYPE,
} from '../domain/collection/catalog-source-identity';
import {
  ROCKET_PO_CATALOG_PARSER_VERSION,
  ROCKET_PO_CATALOG_SOURCE_TYPE,
} from '../../orders/application/port/in/rocket-po-catalog.port';
import {
  MALL_ADMIN_LISTINGS_PARSER_VERSION,
  MALL_ADMIN_LISTINGS_SOURCE_TYPE,
} from '@kiditem/shared/mall-admin-listings';
import {
  SABANGNET_MALL_LISTINGS_PARSER_VERSION,
  SABANGNET_MALL_LISTINGS_SOURCE_TYPE,
} from '@kiditem/shared/sabangnet-mall-listings';

/**
 * Raw source markers only a catalog owner publication writes on an option: a
 * browser full-catalog or basics publication at completion, or a details
 * chunk of the child of a completed basics run.
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
 * last import is a completed catalog run, or the details child of a completed
 * basics run. A details publication moves each enriched listing onto its child
 * run while the child is running and leaves it there if the child fails; those
 * listings keep the completed basics identity. No other running or failed run
 * publishes a countable listing.
 */
export async function countPublishedCatalogListings(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; channelAccountId: string },
): Promise<number> {
  const { organizationId, channelAccountId } = input;
  const listingScope = {
    organizationId,
    channelAccountId,
    isActive: true,
  } satisfies Prisma.ChannelListingWhereInput;
  const unfinishedDetails = await tx.sourceImportRun.findMany({
    where: {
      organizationId,
      channelAccountId,
      sourceType: CATALOG_DETAILS_SOURCE,
      parserVersion: CATALOG_PARSER,
      status: { not: SOURCE_IMPORT_RUN_COMPLETED_STATUS },
    },
    select: { id: true, plan: true },
  });
  const referencedUnfinishedDetails = unfinishedDetails.length === 0
    ? new Set<string>()
    : new Set((await tx.channelListing.findMany({
        where: {
          ...listingScope,
          lastImportRunId: { in: unfinishedDetails.map(({ id }) => id) },
        },
        select: { lastImportRunId: true },
      })).flatMap(({ lastImportRunId }) => lastImportRunId ? [lastImportRunId] : []));
  const rootByDetails = new Map(unfinishedDetails
    .filter((details) => referencedUnfinishedDetails.has(details.id))
    .flatMap((details) => {
      const rootAttemptId = rootAttemptIdOf(details.plan);
      return rootAttemptId ? [[details.id, rootAttemptId] as const] : [];
    }));
  const completedBasics = rootByDetails.size === 0
    ? new Set<string>()
    : new Set((await tx.sourceImportRun.findMany({
        where: {
          ...completedCatalogRunWhere(organizationId, channelAccountId),
          id: { in: [...new Set(rootByDetails.values())] },
          sourceType: CATALOG_BASICS_SOURCE,
        },
        select: { id: true },
      })).map(({ id }) => id));
  const admittedDetails = [...rootByDetails]
    .filter(([, rootAttemptId]) => completedBasics.has(rootAttemptId))
    .map(([detailsId]) => detailsId);
  const completedRunIds = await readCompletedCatalogRunIds(tx, { organizationId, channelAccountId });
  const publishedRunIds = [...new Set([...completedRunIds, ...admittedDetails])];
  return tx.channelListing.count({
    where: {
      ...listingScope,
      lastImportRunId: { in: publishedRunIds },
    },
  });
}

/** The basics attempt a details child was admitted for, as the owner pins it. */
function rootAttemptIdOf(plan: Prisma.JsonValue | null): string | null {
  if (plan === null || typeof plan !== 'object' || Array.isArray(plan)) return null;
  const rootAttemptId = (plan as Record<string, Prisma.JsonValue>).rootAttemptId;
  return typeof rootAttemptId === 'string' ? rootAttemptId : null;
}
