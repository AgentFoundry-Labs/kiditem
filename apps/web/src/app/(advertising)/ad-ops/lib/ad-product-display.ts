/**
 * Display helpers for the per-campaign product detail table.
 *
 * Both exist because the Coupang campaign detail grid packs more than one thing
 * into a single cell, and the scraper preserves the cell text verbatim.
 */

/**
 * Coupang renders the product name and its option id in the same cell, so the
 * scraped `productName` ends with `ID: <optionId>`:
 *
 *   '스핀 워터건 (1p) 소형 어린이 물총 물놀이 권총 ID: 92548632917'
 *
 * The table shows the id on its own line, so the embedded copy has to come off
 * or the row reads `... ID: 92548632917 ID: 92548632917`.
 *
 * Only a trailing id is stripped, and only when it matches the row's option id
 * — a product whose real name happens to contain digits keeps them.
 */
export function stripEmbeddedOptionId(
  productName: string | null,
  externalOptionId: string | null,
): string | null {
  if (!productName) return productName;
  const trimmed = productName.trim();
  if (!externalOptionId) return trimmed;

  const suffix = new RegExp(`\\s*ID:\\s*${escapeRegExp(externalOptionId)}\\s*$`);
  const stripped = trimmed.replace(suffix, '').trim();
  return stripped.length > 0 ? stripped : trimmed;
}

/**
 * The keyword column of the Coupang detail grid is a `키워드 보기` link, not a
 * keyword. Persisting that label and rendering it as the row's keyword claims
 * data we do not have, so it degrades to unknown.
 */
const KEYWORD_PLACEHOLDERS = new Set(['키워드 보기', '키워드보기', '보기']);

export function displayKeyword(keyword: string | null): string | null {
  if (!keyword) return null;
  const trimmed = keyword.trim();
  if (trimmed.length === 0) return null;
  return KEYWORD_PLACEHOLDERS.has(trimmed) ? null : trimmed;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
