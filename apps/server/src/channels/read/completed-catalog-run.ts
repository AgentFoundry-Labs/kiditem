import type { Prisma } from '@prisma/client';
import { SOURCE_IMPORT_RUN_COMPLETED_STATUS } from '@kiditem/shared/source-import';
import {
  CATALOG_BASICS_SOURCE,
  CATALOG_DETAILS_SOURCE,
  CATALOG_PARSER,
  CATALOG_SOURCE,
} from '../adapter/out/repository/channel-catalog-attempt-fence';
import { ROCKET_SELLPIA_MATCHING_CSV_SOURCE_TYPE } from '../adapter/out/repository/rocket-sellpia-matching-csv.catalog';
import {
  ROCKET_PO_CATALOG_PARSER_VERSION,
  ROCKET_PO_CATALOG_SOURCE_TYPE,
} from './rocket-po-catalog.reader';

/** Catalog file imports whose completed status alone certifies their listings. */
const COMPLETED_FILE_CATALOG_SOURCE_TYPES = [
  CATALOG_SOURCE,
  'coupang_rocket_catalog_seed',
  ROCKET_SELLPIA_MATCHING_CSV_SOURCE_TYPE,
];

/**
 * The one rule for a source import run whose listings are catalog identity for
 * matching availability, Sellpia alias candidates, the matching row lock, and
 * readiness: a completed catalog file import, a Rocket PO catalog its owner
 * certifies by parser version, or a completed catalog-owner basics/details
 * publication.
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
        sourceType: { in: [CATALOG_BASICS_SOURCE, CATALOG_DETAILS_SOURCE] },
        parserVersion: CATALOG_PARSER,
        importedAt: { not: null },
      },
    ],
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
      channelProducts: { some: listingScope },
    },
    select: { id: true, plan: true },
  });
  const rootByDetails = new Map(unfinishedDetails.flatMap((details) => {
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
  return tx.channelListing.count({
    where: {
      ...listingScope,
      OR: [
        { lastImportRun: { is: completedCatalogRunWhere(organizationId, channelAccountId) } },
        ...(admittedDetails.length > 0
          ? [{ lastImportRunId: { in: admittedDetails } }]
          : []),
      ],
    },
  });
}

/** The basics attempt a details child was admitted for, as the owner pins it. */
function rootAttemptIdOf(plan: Prisma.JsonValue | null): string | null {
  if (plan === null || typeof plan !== 'object' || Array.isArray(plan)) return null;
  const rootAttemptId = (plan as Record<string, Prisma.JsonValue>).rootAttemptId;
  return typeof rootAttemptId === 'string' ? rootAttemptId : null;
}
