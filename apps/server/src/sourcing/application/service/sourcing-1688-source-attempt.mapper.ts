import { ConflictException } from '@nestjs/common';
import { kstBusinessDate } from '../../../common/kst';
import type { SourcingBrowserSourceAttemptPlan } from '../port/out/repository/sourcing-browser-source-attempt.repository.port';
import type { Sourcing1688OfferKeywordObservationInput } from '../port/out/repository/trend-collection.repository.port';

export const SOURCE_1688_HOT_PRODUCT = '1688.hot_product';
const MAX_1688_KEYWORDS = 20;
const MAX_1688_KEYWORD_LENGTH = 120;

export interface Browser1688SourceBatch {
  keywords: Array<{
    keyword: string;
    items: Array<{
      offerId: string;
      title?: string;
      priceCny?: number;
      monthlySales?: number;
      repurchaseRate?: string;
      tradeScore?: number | string;
      supplierName?: string;
      imageUrl?: string;
      sourceUrl?: string;
      rank?: number;
    }>;
  }>;
  errors?: Array<{ keyword: string; message: string }>;
}

export function build1688SourcePlan(values: unknown[]): SourcingBrowserSourceAttemptPlan {
  const keywords = normalizeLegacyCollectorKeywords(values);
  return { source: SOURCE_1688_HOT_PRODUCT, keywords };
}

export function parse1688SourcePlan(
  value: SourcingBrowserSourceAttemptPlan,
): { source: string; keywords: string[] } {
  if (value.source !== SOURCE_1688_HOT_PRODUCT || !Array.isArray(value.keywords)) {
    throw new ConflictException('SOURCE_PLAN_MALFORMED');
  }
  const keywords = validateFrozenKeywords(value.keywords);
  return { source: SOURCE_1688_HOT_PRODUCT, keywords };
}

export function normalize1688SourceBatch(
  organizationId: string,
  input: Browser1688SourceBatch,
): { keywords: string[]; rows: Sourcing1688OfferKeywordObservationInput[]; errorCount: number } {
  if (
    !Array.isArray(input.keywords)
    || input.keywords.length > MAX_1688_KEYWORDS
  ) {
    throw new ConflictException('SOURCE_BATCH_INVALID');
  }
  const capturedAt = new Date();
  const businessDate = kstBusinessDate(capturedAt);
  const seen = new Set<string>();
  const keywords: string[] = [];
  const rows: Sourcing1688OfferKeywordObservationInput[] = [];
  for (const entry of input.keywords) {
    const keyword = trimKeyword(entry?.keyword);
    if (
      !keyword
      || keyword.length > MAX_1688_KEYWORD_LENGTH
      || !Array.isArray(entry.items)
      || entry.items.length > MAX_1688_KEYWORDS
      || keywords.includes(keyword)
    ) {
      throw new ConflictException('SOURCE_BATCH_INVALID');
    }
    keywords.push(keyword);
    entry.items.forEach((item, index) => {
      const offerId = boundedText(item.offerId, 128);
      if (!offerId) return;
      const identity = `${keywordIdentity(keyword)}\u001f${offerId}`;
      if (seen.has(identity)) return;
      seen.add(identity);
      rows.push({
        organizationId,
        businessDate,
        offerId,
        sourceKeyword: keyword,
        rank: boundedInt(item.rank, 1, 20) ?? index + 1,
        title: nullableText(item.title, 500),
        priceCny: nonNegativeNumber(item.priceCny),
        monthlySales: boundedInt(item.monthlySales, 0, 2_147_483_647),
        repurchaseRate: nullableText(item.repurchaseRate, 64),
        tradeScore: item.tradeScore == null ? null : boundedText(String(item.tradeScore), 64),
        supplierName: nullableText(item.supplierName, 200),
        imageUrl: nullableHttpUrl(item.imageUrl),
        sourceUrl: nullableHttpUrl(item.sourceUrl),
        capturedAt,
      });
    });
  }
  const errors = Array.isArray(input.errors) ? input.errors : [];
  return { keywords, rows, errorCount: errors.length };
}

export function sameFrozenKeywordSet(left: readonly string[], right: readonly string[]): boolean {
  const expected = keywordIdentitySet(left);
  const actual = keywordIdentitySet(right);
  return expected !== null
    && actual !== null
    && expected.size === actual.size
    && [...expected].every((keyword) => actual.has(keyword));
}

function normalizeLegacyCollectorKeywords(values: unknown[]): string[] {
  if (values.length > MAX_1688_KEYWORDS) throw new ConflictException('SOURCE_PLAN_MALFORMED');
  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const value of values) {
    if (typeof value !== 'string') throw new ConflictException('SOURCE_PLAN_MALFORMED');
    const keyword = keywordIdentityText(value);
    if (!keyword) continue;
    if (keyword.length > MAX_1688_KEYWORD_LENGTH) {
      throw new ConflictException('SOURCE_PLAN_MALFORMED');
    }
    const identity = keyword.toLocaleLowerCase('en-US');
    if (seen.has(identity)) continue;
    seen.add(identity);
    keywords.push(keyword);
  }
  return keywords;
}

function validateFrozenKeywords(values: unknown[]): string[] {
  if (values.length > MAX_1688_KEYWORDS) throw new ConflictException('SOURCE_PLAN_MALFORMED');
  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const value of values) {
    if (typeof value !== 'string') throw new ConflictException('SOURCE_PLAN_MALFORMED');
    const keyword = keywordIdentityText(value);
    const identity = keyword.toLocaleLowerCase('en-US');
    if (!keyword || value !== keyword || seen.has(identity)) {
      throw new ConflictException('SOURCE_PLAN_MALFORMED');
    }
    seen.add(identity);
    keywords.push(keyword);
  }
  return keywords;
}

function trimKeyword(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function keywordIdentity(value: string): string {
  return keywordIdentityText(value).toLocaleLowerCase('en-US');
}

function keywordIdentityText(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
}

function keywordIdentitySet(values: readonly string[]): Set<string> | null {
  const identities = new Set<string>();
  for (const value of values) {
    const keyword = trimKeyword(value);
    const identity = keyword && keywordIdentity(keyword);
    if (!identity || identities.has(identity)) return null;
    identities.add(identity);
  }
  return identities;
}

function boundedText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function nullableText(value: unknown, max: number): string | null {
  return boundedText(value, max) || null;
}

function boundedInt(value: unknown, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
    ? value
    : null;
}

function nonNegativeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function nullableHttpUrl(value: unknown): string | null {
  const text = boundedText(value, 2_000);
  if (!text) return null;
  try {
    const parsed = new URL(text);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}
