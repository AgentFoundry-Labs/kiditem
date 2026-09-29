// Pure scrape-row helpers for the Wing item-winner, sales-rank and
// keyword-rank handlers: primitive value readers (`cleanString`,
// `toNumberOrNull`) and the Wing item-winner row → daily state normalizers.
// A cell that does not parse is `null`, never a measured 0.

/** Option-day winner state a scraped option row carries (`ChannelListingOptionDailySnapshot` columns). */
export interface ListingOptionDailyState {
  optionName?: string | null;
  salePrice?: number | null;
  stockQty?: number | null;
  saleStatus?: string | null;
  isActive?: boolean | null;
  isOfferWinner?: boolean | null;
  myPrice?: number | null;
  winnerPrice?: number | null;
  winnerGapPrice?: number | null;
}

/** Listing-level state that one Wing item-winner row can observe. */
export interface ListingDailyState {
  productName: string | null;
  isOfferWinner: boolean | null;
  myPrice: number | null;
  winnerPrice: number | null;
  winnerGapPrice: number | null;
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

export function toBooleanOrNull(value: unknown): boolean | null {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return null;
}

/**
 * Derive listing-level observable state from a Wing item-winner row.
 * Returns `null` when the row carries no observable state, so the caller
 * can skip the daily upsert entirely.
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
