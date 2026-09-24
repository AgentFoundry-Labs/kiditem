import {
  COUPANG_CATALOG_BASIC_SOURCE_TYPE,
  COUPANG_CATALOG_DETAILS_SOURCE_TYPE,
} from '@kiditem/shared/coupang-catalog-snapshot';

// Source-import identity of Channels' catalog publications. The catalog
// adapters write these values and `read/completed-catalog-run` selects by them.

/** The catalog workbook import. (The removed legacy full browser stage shared this source type.) */
export const CATALOG_SOURCE = 'coupang_wing_catalog';
/** The basics root of a staged browser catalog import. */
export const CATALOG_BASICS_SOURCE = COUPANG_CATALOG_BASIC_SOURCE_TYPE;
/** The details child of a staged browser catalog import. */
export const CATALOG_DETAILS_SOURCE = COUPANG_CATALOG_DETAILS_SOURCE_TYPE;
export const CATALOG_PARSER = 'coupang-catalog-owner-v1';
/** The Rocket-Sellpia matching CSV catalog import. */
export const ROCKET_SELLPIA_MATCHING_CSV_SOURCE_TYPE = 'coupang_rocket_matching_csv';
