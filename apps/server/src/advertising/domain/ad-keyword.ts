// Keyword-grain value rules for Coupang ad facts.
//
// WHY `normalizeAdKeyword` REJECTS CONTROL LABELS
// -----------------------------------------------
// The Coupang campaign report grid has a `키워드` column, but it does not
// contain a keyword — it contains a button that opens the keyword modal. The
// scraper reads cell text by header, so that column yielded the literal button
// label `"키워드 보기"` and it was stored as the keyword on every product row
// (and baked into `externalId`). Observed across the whole
// `channel_ad_target_daily_snapshots` product grain: 175/175 rows carried
// `keyword = '키워드 보기'`.
//
// A control label is not evidence of a keyword, so it is rejected at the
// domain boundary rather than filtered at each read site. Real keyword values
// arrive from the per-ad keyword table (`ad_keyword`), never from that column.

import type { AdKeywordOrigin } from '@kiditem/shared/advertising';

/**
 * UI control labels that appear in a keyword-shaped cell but carry no keyword.
 * Matched after whitespace collapsing, case-insensitively.
 */
const KEYWORD_CONTROL_LABELS = new Set([
  '키워드 보기',
  '키워드보기',
  '키워드 관리',
  '키워드관리',
  '키워드 추가',
  '키워드추가',
  '선택 상품',
  'view keywords',
]);

const MAX_KEYWORD_LENGTH = 200;

/**
 * Normalize a scraped keyword value, or return `null` when the value is not a
 * usable keyword (blank, a UI control label, or implausibly long).
 */
export function normalizeAdKeyword(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const collapsed = value.replace(/\s+/g, ' ').trim();
  if (collapsed.length === 0) return null;
  if (collapsed.length > MAX_KEYWORD_LENGTH) return null;
  if (KEYWORD_CONTROL_LABELS.has(collapsed.toLowerCase())) return null;
  if (KEYWORD_CONTROL_LABELS.has(collapsed)) return null;
  return collapsed;
}

/** True when the value is a UI control label rather than a keyword. */
export function isAdKeywordControlLabel(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const collapsed = value.replace(/\s+/g, ' ').trim();
  return (
    KEYWORD_CONTROL_LABELS.has(collapsed) ||
    KEYWORD_CONTROL_LABELS.has(collapsed.toLowerCase())
  );
}

/**
 * How the keyword became attached to the ad.
 *
 * Unknown values fall back to `smart_targeting`: a keyword the collector could
 * not prove was registered is, by definition, one Coupang matched on its own.
 */
export function normalizeAdKeywordOrigin(value: unknown): AdKeywordOrigin {
  return value === 'registered' ? 'registered' : 'smart_targeting';
}
