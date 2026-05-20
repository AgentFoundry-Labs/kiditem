// Pure scrape-row normalization helpers extracted from AdSyncService.
//
// - `asScrapeRow` / `pairScrapeRows`: pair raw extension rows with parser
//   normalized rows. Matching/legacy writes use the normalized row, while
//   `ChannelScrapeSnapshot.rawJson` keeps the original source row for
//   replay/debuggability.
// - Primitive value helpers (`cleanString`, `toNumber`, `toNumberOrNull`,
//   `toBooleanOrNull`) — handlers used to inline these as private methods.
// - Wing item-winner row → daily state normalizers. Returns `null` when
//   the row carries no observable state so callers can skip the upsert.
// - `deriveAdTargetType`: keyword/product/campaign grain inference for
//   campaign/raw-scrape handlers.

import type { AdTargetType } from './util/ad-target-key';
import type { ListingDailyState } from '../application/port/out/repository/channel-listing-daily.repository.port';
import type { ListingOptionDailyState } from '../application/port/out/repository/channel-option-daily.repository.port';

export type ScrapeRowPair = {
  rawRow: Record<string, any>;
  normalizedRow: Record<string, any>;
  hasNormalizedRow: boolean;
};

export function asScrapeRow(row: unknown): Record<string, any> {
  if (row && typeof row === 'object' && !Array.isArray(row)) {
    return row as Record<string, any>;
  }
  return { value: row };
}

export function pairScrapeRows(
  rawRowsInput: unknown[] | undefined,
  normalizedRowsInput: unknown[] | undefined,
): ScrapeRowPair[] {
  const rawRows = (rawRowsInput ?? []).map((row) => asScrapeRow(row));
  const normalizedRows = (normalizedRowsInput ?? []).map((row) =>
    asScrapeRow(row),
  );
  const rowCount = Math.max(rawRows.length, normalizedRows.length);

  return Array.from({ length: rowCount }, (_, index) => {
    const normalizedRow = normalizedRows[index] ?? rawRows[index] ?? {};
    return {
      rawRow: rawRows[index] ?? normalizedRow,
      normalizedRow,
      hasNormalizedRow: normalizedRows[index] !== undefined,
    };
  });
}

export function cleanString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value !== 'string') return 0;
  const normalized = value.replace(/[^\d.-]/g, '');
  return normalized ? Number(normalized) || 0 : 0;
}

export function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = toNumber(value);
  return Number.isFinite(num) ? Math.round(num) : null;
}

export function toBooleanOrNull(value: unknown): boolean | null {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return null;
}

/**
 * Derive listing-level observable state from a Wing item-winner row.
 * Returns `null` when the row carries no observable state, so the caller
 * can skip the daily upsert entirely (e.g., a row that is only there to
 * feed `ChannelScrapeSnapshot` raw preservation).
 */
export function normalizeWingListingState(
  row: Record<string, any>,
): ListingDailyState | null {
  const productName = cleanString(row.productName);
  const isOfferWinner = toBooleanOrNull(row.isWinner);
  const myPrice = toNumberOrNull(row.myPrice);
  const winnerPrice = toNumberOrNull(row.winnerPrice);
  if (
    productName === null &&
    isOfferWinner === null &&
    myPrice === null &&
    winnerPrice === null
  ) {
    return null;
  }
  const winnerGapPrice =
    myPrice !== null && winnerPrice !== null ? winnerPrice - myPrice : null;
  return {
    productName,
    isOfferWinner,
    myPrice,
    winnerPrice,
    winnerGapPrice,
  };
}

/**
 * Wing item-winner rows are per-vendor-item, so the same winner fields
 * apply to the option daily fact. Returns `null` when no observable field
 * is present.
 */
export function normalizeWingOptionState(
  row: Record<string, any>,
): ListingOptionDailyState | null {
  const isOfferWinner = toBooleanOrNull(row.isWinner);
  const myPrice = toNumberOrNull(row.myPrice);
  const winnerPrice = toNumberOrNull(row.winnerPrice);
  if (isOfferWinner === null && myPrice === null && winnerPrice === null) {
    return null;
  }
  const winnerGapPrice =
    myPrice !== null && winnerPrice !== null ? winnerPrice - myPrice : null;
  return {
    isOfferWinner,
    myPrice,
    winnerPrice,
    winnerGapPrice,
  };
}

/**
 * Derive the appropriate ad target grain for a campaign/raw-scrape row.
 * `keyword` rows always fall to keyword grain; otherwise infer from
 * `pageType`. Ad-product rows are reserved for the campaign/raw-scrape
 * pipelines where the provider distinguishes ad placement.
 */
export function deriveAdTargetType(
  pageType: string,
  keyword: string | null,
): AdTargetType {
  if (pageType === 'product') return 'product';
  if (keyword) return 'keyword';
  return 'campaign';
}
