// Pure scrape-row normalization helpers shared by advertising source owners.
//
// - `asScrapeRow` / `pairScrapeRows`: pair raw extension rows with parser
//   normalized rows. Matching/legacy writes use the normalized row, while
//   `ChannelScrapeSnapshot.rawJson` keeps the original source row for
//   replay/debuggability.
// - Primitive value helpers (`cleanString`, `parseProviderNumber`,
//   `toNumberOrNull`, `readProviderMetric`, `toBooleanOrNull`). A cell that
//   does not parse is `null` or a rejected row, never a measured 0.
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

/**
 * A provider cell as a number, or `null` when the cell is absent or does not
 * parse. An unparseable cell is not a measured zero: callers decide whether
 * that rejects the row or records the metric as unobserved.
 */
export function parseProviderNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/[^\d.-]/g, '');
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function toNumberOrNull(value: unknown): number | null {
  const parsed = parseProviderNumber(value);
  return parsed === null ? null : Math.round(parsed);
}

/**
 * An additive ad metric for a non-null ledger column. A column the provider
 * grid did not carry is stored as 0 and recorded as unobserved by the caller's
 * `observedMetrics` stamp; a column it did carry must parse, so an unreadable
 * cell rejects the row instead of becoming a measured zero.
 */
export function readProviderMetric(
  value: unknown,
  observed: boolean,
  field: string,
): number {
  const parsed = parseProviderNumber(value);
  if (parsed !== null) return Math.round(parsed);
  if (observed) throw new AdMetricUnparseableError(field);
  return 0;
}

/**
 * An observed provider metric cell that does not parse. Source owners turn it
 * into their receipt rejection (a failed attempt or a warning), never HTTP 500.
 */
export class AdMetricUnparseableError extends Error {
  readonly code = 'AD_METRIC_UNPARSEABLE' as const;

  constructor(readonly field: string) {
    super(`AD_METRIC_UNPARSEABLE: ${field}`);
    this.name = 'AdMetricUnparseableError';
  }
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
