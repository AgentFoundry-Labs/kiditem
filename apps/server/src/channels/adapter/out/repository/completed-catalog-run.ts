import type { Prisma } from '@prisma/client';
import { SOURCE_IMPORT_RUN_COMPLETED_STATUS } from '@kiditem/shared/source-import';
import {
  ROCKET_PO_CATALOG_PARSER_VERSION,
  ROCKET_PO_CATALOG_SOURCE_TYPE,
} from '../../../read/rocket-po-catalog.reader';
import {
  CATALOG_BASICS_SOURCE,
  CATALOG_DETAILS_SOURCE,
  CATALOG_PARSER,
  CATALOG_SOURCE,
} from './channel-catalog-attempt-fence';
import { ROCKET_SELLPIA_MATCHING_CSV_SOURCE_TYPE } from './rocket-sellpia-matching-csv.catalog';

/** Catalog file imports whose completed status alone certifies their listings. */
const COMPLETED_FILE_CATALOG_SOURCE_TYPES = [
  CATALOG_SOURCE,
  'coupang_rocket_catalog_seed',
  ROCKET_SELLPIA_MATCHING_CSV_SOURCE_TYPE,
];

/**
 * The one rule for a source import run whose listings are catalog identity for
 * matching availability, Sellpia alias candidates, and the matching row lock:
 * a completed catalog file import, a Rocket PO catalog its owner certifies by
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
        sourceType: { in: [CATALOG_BASICS_SOURCE, CATALOG_DETAILS_SOURCE] },
        parserVersion: CATALOG_PARSER,
        importedAt: { not: null },
      },
    ],
  };
}
