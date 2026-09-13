// Keyword relevance: deciding whether a keyword an ad is serving on actually
// describes the advertised product.
//
// WHY THERE ARE SO MANY KEYWORDS
// ------------------------------
// These are not keywords anyone registered. Every Coupang ad group here runs
// `keywordTargeting: 'AUTOMATIC'` (smart targeting), so Coupang matches the ad
// against whatever shoppers type and the keyword table lists every search term
// that produced at least one impression. One water-gun product came back with
// 474 distinct terms; the account total was 7,613 across 42 products. The long
// tail is mostly single-impression terms, and that tail is exactly where
// unrelated searches hide.
//
// WHY THE VERDICT IS NOT A RULE
// -----------------------------
// Most irrelevant terms are other brands' names. `콩순이 비눗방울`,
// `디즈니 비눗방울`, and `뽀로로 비눗방울` were all served for
// `캐릭터 문어발 비눗방울` — every one shares the head noun `비눗방울`, so token
// overlap rates them as relevant. Knowing 콩순이 is a different toy brand is
// language knowledge, which is why the verdict comes from a model.
//
// WHAT THIS MODULE OWNS
// ---------------------
// The deterministic half around that judgement:
//   1. `buildKeywordProductBatches` — one batch per advertised product, since
//      "does this keyword fit?" is only answerable against a specific product.
//   2. `buildKeywordJudgementPrompt` — the exact question asked.
//   3. `toKeywordPauseCandidates` — turning verdicts into `pause_keyword`
//      proposals, refusing anything the evidence does not support.
//
// The model proposes; a human approves; the extension executes. Nothing here
// pauses a keyword on its own.

import type { ActionCandidate } from './ad-action-rules';

export type KeywordRelevanceVerdictValue = 'relevant' | 'loose' | 'irrelevant';

/** One keyword as the model sees it. */
export interface KeywordJudgementItem {
  /** Stable handle the model echoes back. Never a database id. */
  ref: string;
  keyword: string;
  origin: 'registered' | 'smart_targeting';
  impressions: number;
  clicks: number;
  spend: number;
}

/** Every keyword of one advertised product, judged against that product. */
export interface KeywordProductBatch {
  productKey: string;
  productName: string;
  campaignName: string | null;
  items: KeywordJudgementItem[];
  /** Keywords dropped from this batch by the per-product cap. */
  truncatedCount: number;
}

export interface KeywordJudgementSource {
  adTargetDailyId: string;
  keyword: string;
  productName: string | null;
  campaignName: string | null;
  externalOptionId: string | null;
  listingId: string | null;
  origin: 'registered' | 'smart_targeting';
  impressions: number;
  clicks: number;
  spend: number;
  revenue: number;
  /** `null` when the keyword table did not carry the conversion column. */
  conversions: number | null;
}

export interface KeywordRelevanceVerdict {
  ref: string;
  verdict: KeywordRelevanceVerdictValue;
  reason: string;
  /**
   * Keyword the model believed it was judging. Refs are positional, so new
   * facts arriving between the batch and the verdict would silently shift them
   * onto a different keyword. Echoing the text makes that shift detectable.
   */
  keyword?: string;
}

export interface BuildKeywordProductBatchesOptions {
  /** Cap per product. The largest observed product had 953 keywords. */
  maxKeywordsPerProduct?: number;
  /** Cap on products judged in one pass. */
  maxProducts?: number;
}

export interface KeywordProductBatchResult {
  batches: KeywordProductBatch[];
  sourceByRef: Map<string, KeywordJudgementSource>;
  /** Products left unjudged by `maxProducts`, so callers can report it. */
  skippedProductCount: number;
}

/**
 * Group judgeable keywords by advertised product.
 *
 * A keyword with no product name cannot be judged at all — there is nothing to
 * compare it against, and judging it anyway would let the model invent a
 * rationale from the keyword alone. A keyword serving several products arrives
 * with no option link and is skipped for the same reason.
 */
export function buildKeywordProductBatches(
  sources: KeywordJudgementSource[],
  options: BuildKeywordProductBatchesOptions = {},
): KeywordProductBatchResult {
  const maxKeywordsPerProduct = options.maxKeywordsPerProduct ?? 400;
  const maxProducts = options.maxProducts ?? 50;

  const byProduct = new Map<string, KeywordJudgementSource[]>();
  for (const source of sources) {
    if (source.keyword.trim().length === 0) continue;
    if (!source.externalOptionId) continue;
    if ((source.productName ?? '').trim().length === 0) continue;
    // A keyword that converted has proven itself regardless of how it reads,
    // and one whose conversions were not observed may have converted.
    if (source.conversions === null || source.conversions > 0) continue;
    const bucket = byProduct.get(source.externalOptionId);
    if (bucket) bucket.push(source);
    else byProduct.set(source.externalOptionId, [source]);
  }

  // Spend first, then impressions: a product burning budget on unrelated
  // searches is the one worth judging when the pass is capped.
  const ordered = [...byProduct.entries()].sort((a, b) => {
    const spendA = a[1].reduce((sum, row) => sum + row.spend, 0);
    const spendB = b[1].reduce((sum, row) => sum + row.spend, 0);
    if (spendA !== spendB) return spendB - spendA;
    return b[1].length - a[1].length || a[0].localeCompare(b[0]);
  });

  const batches: KeywordProductBatch[] = [];
  const sourceByRef = new Map<string, KeywordJudgementSource>();

  for (const [productKey, rows] of ordered.slice(0, maxProducts)) {
    const productIndex = batches.length + 1;
    const rankedRows = [...rows].sort(
      (a, b) =>
        b.spend - a.spend ||
        b.impressions - a.impressions ||
        a.keyword.localeCompare(b.keyword),
    );
    const kept = rankedRows.slice(0, maxKeywordsPerProduct);
    const items: KeywordJudgementItem[] = kept.map((source, index) => {
      const ref = `p${productIndex}k${index + 1}`;
      sourceByRef.set(ref, source);
      return {
        ref,
        keyword: source.keyword,
        origin: source.origin,
        impressions: source.impressions,
        clicks: source.clicks,
        spend: source.spend,
      };
    });
    batches.push({
      productKey,
      productName: (kept[0].productName ?? '').trim(),
      campaignName: kept[0].campaignName,
      items,
      truncatedCount: rankedRows.length - kept.length,
    });
  }

  return {
    batches,
    sourceByRef,
    skippedProductCount: Math.max(0, ordered.length - batches.length),
  };
}

/**
 * Split one product's keywords into prompt-sized chunks, keeping the product
 * context on every chunk.
 *
 * A 400-keyword prompt asking for 400 verdicts timed out against the provider
 * (120s cap) on the live account. Smaller asks also return better-formed JSON
 * and lose less when one call fails.
 */
export function chunkKeywordProductBatch(
  batch: KeywordProductBatch,
  size: number,
): KeywordProductBatch[] {
  const chunkSize = Math.max(1, Math.floor(size));
  if (batch.items.length <= chunkSize) return [batch];
  const chunks: KeywordProductBatch[] = [];
  for (let index = 0; index < batch.items.length; index += chunkSize) {
    chunks.push({
      ...batch,
      items: batch.items.slice(index, index + chunkSize),
      // Only the last chunk carries the product's truncation note, so a
      // caller summing chunks does not multiply it.
      truncatedCount: 0,
    });
  }
  chunks[chunks.length - 1] = {
    ...chunks[chunks.length - 1],
    truncatedCount: batch.truncatedCount,
  };
  return chunks;
}

export const KEYWORD_RELEVANCE_SYSTEM_PROMPT = [
  '당신은 쿠팡 광고 키워드 심사자다.',
  '광고가 노출된 검색어가 그 상품을 찾는 검색어인지 판정한다.',
  '',
  '판정 값:',
  '- relevant: 그 상품을 찾는 검색어. 상품 자체, 상위 카테고리, 용도, 대상 연령 등.',
  '- loose: 같은 카테고리지만 의도가 어긋남. 형태/규격/구성이 다른 변형, 지나치게 넓은 상위어.',
  '- irrelevant: 이 상품을 찾는 검색어가 아니다.',
  '',
  'irrelevant 대표 사례:',
  '- 다른 브랜드/IP 이름. 상품이 그 브랜드 제품이 아닌데 브랜드명이 들어간 검색어',
  '  (예: 문어발 비눗방울 상품에 "콩순이 비눗방울", "뽀로로 비눗방울").',
  '  뒤에 붙은 일반명사가 같다는 이유로 relevant 로 판정하지 마라 —',
  '  검색한 사람은 그 브랜드 제품을 원한 것이다.',
  '  단, 상품명 자체에 그 브랜드가 들어 있으면 정상 키워드다.',
  '- 다른 상품 종류 (상품은 비눗방울인데 검색어가 "물총", "슬라임").',
  '- 상품명에 근거가 없는 규격·수량·기능.',
  '- 다른 상품의 숫자 코드로 보이는 검색어.',
  '',
  '판단이 애매하면 loose 를 쓴다. 확신이 없으면 irrelevant 로 쓰지 마라 —',
  'irrelevant 는 광고 중단 제안으로 이어지고, 잘못 끄면 매출이 사라진다.',
  '',
  'reason 은 왜 그 상품과 무관한지를 한국어 한 문장으로 쓴다.',
  '"연관 없음", "무관함" 같은 동어반복 금지.',
  '근거는 상품명과 검색어 안에서만 찾는다. 재고·시즌·경쟁사 같은 외부 사실을 지어내지 마라.',
  '',
  '출력은 JSON 만. items 의 모든 ref 에 대해 하나씩 판정한다.',
  '입력에 없는 ref 를 만들지 마라.',
  '{"verdicts":[{"ref":"p1k1","keyword":"검색어","verdict":"irrelevant","reason":"..."}]}',
].join('\n');

/** The exact question asked about one product. */
export function buildKeywordJudgementPrompt(batch: KeywordProductBatch): string {
  const lines = [
    `상품명: ${batch.productName}`,
    batch.campaignName ? `캠페인: ${batch.campaignName}` : null,
    '',
    `아래 ${batch.items.length}개 검색어가 이 상품을 찾는 검색어인지 각각 판정하라.`,
    '형식: <ref>\t<검색어>\t노출<n>\t클릭<n>\t광고비<n>원',
    '',
  ].filter((line): line is string => line !== null);

  for (const item of batch.items) {
    lines.push(
      `${item.ref}\t${item.keyword}\t노출${item.impressions}\t클릭${item.clicks}\t광고비${item.spend}원`,
    );
  }
  return lines.join('\n');
}

export interface KeywordPauseCandidateResult {
  candidates: ActionCandidate[];
  /** Verdicts that were dropped, with the reason, so the run stays auditable. */
  rejected: { ref: string; reason: string }[];
}

/**
 * Convert model verdicts into `pause_keyword` proposals.
 *
 * Rejects a verdict when the `ref` was never asked about, the echoed keyword no
 * longer matches that ref, no rationale came back, the keyword's conversions
 * were not observed, or the keyword converted after the batch was built.
 */
export function toKeywordPauseCandidates(
  verdicts: KeywordRelevanceVerdict[],
  sourceByRef: Map<string, KeywordJudgementSource>,
): KeywordPauseCandidateResult {
  const candidates: ActionCandidate[] = [];
  const rejected: { ref: string; reason: string }[] = [];
  const seenRefs = new Set<string>();

  for (const verdict of verdicts) {
    const ref = typeof verdict?.ref === 'string' ? verdict.ref.trim() : '';
    if (!ref) {
      rejected.push({ ref: '', reason: 'missing_ref' });
      continue;
    }
    if (seenRefs.has(ref)) {
      rejected.push({ ref, reason: 'duplicate_ref' });
      continue;
    }
    seenRefs.add(ref);

    const source = sourceByRef.get(ref);
    if (!source) {
      // The model named a keyword that was never in this batch.
      rejected.push({ ref, reason: 'unknown_ref' });
      continue;
    }
    if (
      typeof verdict.keyword === 'string' &&
      verdict.keyword.trim().length > 0 &&
      verdict.keyword.trim() !== source.keyword
    ) {
      // The batch shifted under the model: this ref now points at a different
      // keyword than the one it judged.
      rejected.push({ ref, reason: 'keyword_mismatch' });
      continue;
    }
    if (verdict.verdict !== 'irrelevant') continue;

    const reason = typeof verdict.reason === 'string' ? verdict.reason.trim() : '';
    if (!reason) {
      rejected.push({ ref, reason: 'missing_reason' });
      continue;
    }
    if (source.conversions === null) {
      rejected.push({ ref, reason: 'conversions_unobserved' });
      continue;
    }
    if (source.conversions > 0) {
      rejected.push({ ref, reason: 'converted_keyword' });
      continue;
    }

    candidates.push({
      adTargetDailyId: source.adTargetDailyId,
      listingId: source.listingId,
      actionType: 'pause_keyword',
      targetType: 'keyword',
      externalId: source.externalOptionId,
      targetLabel: source.keyword,
      reason: `상품과 연관 없는 키워드 — ${reason}`,
      // Money already spent on an unrelated search is the whole point, so a
      // spending keyword outranks one that only takes impressions.
      priority: source.spend > 0 ? 'high' : 'medium',
      currentValue: null,
      proposedValue: null,
      payload: {
        pageType: 'keyword',
        keyword: source.keyword,
        productName: source.productName,
        campaignName: source.campaignName,
        externalOptionId: source.externalOptionId,
        origin: source.origin,
        relevance: 'irrelevant',
        relevanceReason: reason,
        evidence: {
          impressions: source.impressions,
          clicks: source.clicks,
          spend: source.spend,
          revenue: source.revenue,
        },
      },
    });
  }

  return { candidates, rejected };
}

/**
 * Narrow an untrusted model response into verdicts. Anything that is not a
 * well-formed verdict object is dropped rather than coerced.
 */
export function parseKeywordRelevanceVerdicts(
  value: unknown,
): KeywordRelevanceVerdict[] {
  const raw = typeof value === 'string' ? safeParseJson(value) : value;
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { verdicts?: unknown })?.verdicts)
      ? (raw as { verdicts: unknown[] }).verdicts
      : [];
  const verdicts: KeywordRelevanceVerdict[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    const ref = typeof row.ref === 'string' ? row.ref.trim() : '';
    const rawVerdict = typeof row.verdict === 'string' ? row.verdict.trim() : '';
    if (!ref) continue;
    if (
      rawVerdict !== 'relevant' &&
      rawVerdict !== 'loose' &&
      rawVerdict !== 'irrelevant'
    ) {
      continue;
    }
    verdicts.push({
      ref,
      verdict: rawVerdict,
      reason: typeof row.reason === 'string' ? row.reason.trim() : '',
      ...(typeof row.keyword === 'string' ? { keyword: row.keyword.trim() } : {}),
    });
  }
  return verdicts;
}

/**
 * Models wrap JSON in prose or fences often enough that a bare `JSON.parse`
 * throws away otherwise-valid answers. Fall back to the outermost object.
 */
function safeParseJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}
