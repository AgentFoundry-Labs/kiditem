import type { Search1688KeywordItem } from '../../../application/port/out/provider/1688-keyword-search.port';
import { parseAllowedSupplierUrl } from '../../../domain/supplier-source-url-policy';

const MAX_1688_KEYWORD_ITEMS = 40;
const MAX_PAYLOAD_DEPTH = 14;
const MAX_VISITED_PAYLOAD_OBJECTS = 5_000;
const MAX_TEXT_LENGTH = 500;
const MAX_URL_LENGTH = 2_000;
const MAX_METRIC = 2_147_483_647;
const API_COLLECTION_KEYS = new Set([
  'offers',
  'offerlist',
  'offeritems',
  'offerrecords',
  'productlist',
  'products',
  'searchresults',
  'resultlist',
  'resultitems',
]);

export type Search1688KeywordApiReadiness =
  | { kind: 'items'; items: Search1688KeywordItem[] }
  | { kind: 'explicit_zero' }
  | { kind: 'indeterminate' };

export type Search1688KeywordDomReadiness =
  | { kind: 'items'; records: unknown[] }
  | { kind: 'explicit_zero' }
  | { kind: 'loading' }
  | { kind: 'unready' };

/**
 * Projects the current 1688 search response into the narrow, persistence-safe
 * provider contract. It deliberately walks a bounded object graph rather than
 * depending on one provider response shape.
 */
export function extract1688KeywordItemsFromApiPayload(payload: unknown): Search1688KeywordItem[] {
  const result = inspect1688KeywordApiPayload(payload);
  return result.kind === 'items' ? result.items : [];
}

/**
 * A trusted search-response URL alone is not enough to authorize a durable
 * empty result. The payload must expose one of the current search collection
 * shapes and that collection must be explicitly empty.
 */
export function inspect1688KeywordApiPayload(payload: unknown): Search1688KeywordApiReadiness {
  const collections = recognizedApiCollections(payload);
  if (collections.length === 0) return { kind: 'indeterminate' };
  if (collections.every((collection) => collection.length === 0)) {
    return { kind: 'explicit_zero' };
  }
  const items = extract1688KeywordItemsFromRecognizedPayload(collections);
  return items.length > 0 ? { kind: 'items', items } : { kind: 'indeterminate' };
}

function extract1688KeywordItemsFromRecognizedPayload(payload: unknown): Search1688KeywordItem[] {
  const items: Search1688KeywordItem[] = [];
  const seenObjects = new WeakSet<object>();
  const queue: Array<{ value: unknown; depth: number }> = [{ value: payload, depth: 0 }];
  let visited = 0;

  while (queue.length > 0 && items.length < MAX_1688_KEYWORD_ITEMS && visited < MAX_VISITED_PAYLOAD_OBJECTS) {
    const entry = queue.shift();
    if (!entry || !isRecordOrArray(entry.value)) continue;
    if (seenObjects.has(entry.value)) continue;
    seenObjects.add(entry.value);
    visited += 1;

    if (!Array.isArray(entry.value)) {
      const item = normalize1688KeywordItem(entry.value, items.length);
      if (item && !items.some((candidate) => sameOfferIdentity(candidate, item))) {
        items.push(item);
      }
    }

    if (entry.depth >= MAX_PAYLOAD_DEPTH) continue;
    for (const child of childrenOf(entry.value)) {
      if (isRecordOrArray(child)) queue.push({ value: child, depth: entry.depth + 1 });
    }
  }

  return items;
}

/** Normalizes browser-side DOM projections; it never returns page objects or HTML. */
export function extract1688KeywordItemsFromDomRecords(records: unknown): Search1688KeywordItem[] {
  if (!Array.isArray(records)) return [];
  const items: Search1688KeywordItem[] = [];
  for (const record of records) {
    if (items.length >= MAX_1688_KEYWORD_ITEMS || !isRecord(record)) continue;
    const item = normalize1688KeywordItem(record, items.length);
    if (item && !items.some((candidate) => sameOfferIdentity(candidate, item))) items.push(item);
  }
  return items;
}

/** API results win over DOM records because they are less presentation-dependent. */
export function merge1688KeywordSearchItems(
  apiItems: readonly Search1688KeywordItem[],
  domItems: readonly Search1688KeywordItem[],
): Search1688KeywordItem[] {
  const merged: Search1688KeywordItem[] = [];
  for (const item of [...apiItems, ...domItems]) {
    if (merged.length >= MAX_1688_KEYWORD_ITEMS) break;
    if (!merged.some((candidate) => sameOfferIdentity(candidate, item))) merged.push(item);
  }
  return merged;
}

/**
 * Runs inside the authenticated page through `page.evaluate`. Keep helpers
 * nested so Playwright can serialize the callback without server closures.
 */
export function inspect1688KeywordDomReadiness(maxResults: number): Search1688KeywordDomReadiness {
  const limit = Math.max(1, Math.min(40, Math.floor(Number(maxResults) || 40)));
  const roots: unknown[] = [document];
  const cards: unknown[] = [];
  const seenCards = new Set<unknown>();

  const text = (value: unknown, maxLength = 500): string => {
    if (typeof value !== 'string' && typeof value !== 'number') return '';
    return String(value).replace(/\s+/gu, ' ').trim().slice(0, maxLength);
  };
  const attr = (element: unknown, name: string): string => {
    try {
      return text((element as { getAttribute?: (key: string) => unknown })?.getAttribute?.(name), 2_000);
    } catch {
      return '';
    }
  };
  const queryAll = (root: unknown, selector: string): unknown[] => {
    try {
      const values = (root as { querySelectorAll?: (value: string) => ArrayLike<unknown> })?.querySelectorAll?.(selector);
      return values ? Array.from(values) : [];
    } catch {
      return [];
    }
  };
  const query = (root: unknown, selector: string): unknown => {
    try {
      return (root as { querySelector?: (value: string) => unknown })?.querySelector?.(selector) ?? null;
    } catch {
      return null;
    }
  };
  const textContent = (element: unknown): string => {
    try {
      return text((element as { textContent?: unknown })?.textContent);
    } catch {
      return '';
    }
  };
  const offerIdFrom = (value: string): string => {
    const path = value.match(/\/offer\/(\d{6,})(?:\.html)?(?:[/?#]|$)/iu);
    if (path?.[1]) return path[1];
    const queryValue = value.match(/(?:[?&]|^)(?:offerId|offer_id)=(\d{6,})(?:[&#]|$)/iu);
    return queryValue?.[1] ?? '';
  };

  for (let index = 0; index < roots.length && roots.length < 64; index += 1) {
    for (const element of queryAll(roots[index], '*')) {
      try {
        const shadowRoot = (element as { shadowRoot?: unknown }).shadowRoot;
        if (shadowRoot && !roots.includes(shadowRoot)) roots.push(shadowRoot);
      } catch {
        // Closed or inaccessible shadow roots are not a provider failure.
      }
    }
  }

  for (const root of roots) {
    for (const link of queryAll(root, 'a[href]')) {
      if (cards.length >= limit) break;
      const href = attr(link, 'href');
      if (!offerIdFrom(href)) continue;
      let card: unknown = link;
      try {
        card = (link as { closest?: (selector: string) => unknown })?.closest?.(
          '[data-offer-id], [data-offerid], [offer-id], article, li, [class*=offer-card], [class*=offer-item], [class*=card-wrap], [class*=result-tile], [class*=search-offer], [class*=offer-wrapper]',
        ) ?? link;
      } catch {
        card = link;
      }
      if (seenCards.has(card)) continue;
      seenCards.add(card);

      const title = attr(link, 'title') || textContent(link) || textContent(card);
      if (!title) continue;
      const image = query(card, 'img[data-sf-original-src], img[data-src], img[src]');
      const price = query(card, '.price-wrap, .price em, [class*=price] em, [class*=price]');
      const sales = query(card, '[class*=trade], [class*=sold], [class*=sale], [class*=deal], [class*=pay]');
      const supplier = query(card, '.company-name, [class*=company-name]');
      cards.push({
        href,
        title,
        imageUrl: attr(image, 'data-sf-original-src') || attr(image, 'data-src') || attr(image, 'src'),
        priceText: textContent(price),
        salesText: textContent(sales) || textContent(card),
        supplierName: attr(supplier, 'title') || textContent(supplier),
      });
    }
  }

  if (cards.length > 0) return { kind: 'items', records: cards };

  const loadingSelectors = [
    '[aria-busy="true"]',
    '[data-loading="true"]',
    '[data-testid*="skeleton"]',
    '[class*="skeleton"]',
    '[class*="loading"]',
    '[class*="placeholder"]',
  ].join(', ');
  if (roots.some((root) => queryAll(root, loadingSelectors).length > 0)) {
    return { kind: 'loading' };
  }
  // The current 1688 empty surface is text-led rather than consistently
  // data-attributed. Both attested phrases must be contained by a known offer
  // result region; matching either phrase elsewhere on the page is not enough
  // to authorize a durable zero result.
  const currentEmptyResultRegionSelectors = [
    '[data-search-result]',
    '[class*="search-result"]',
    '[class*="offer-list"]',
    '[class*="result-list"]',
    'div.wp-offerlist-windows',
  ].join(', ');
  const currentEmptyStateText = '哎呦喂，这里空空如也～';
  const currentEmptySupportingText = '您还可以：写下您的采购需求，快速获得多个供应商报价';
  const hasCurrentExplicitEmptyState = (root: unknown): boolean => queryAll(root, currentEmptyResultRegionSelectors)
    .some((region) => {
      const regionText = textContent(region);
      return regionText.includes(currentEmptyStateText) && regionText.includes(currentEmptySupportingText);
    });
  if (roots.some(hasCurrentExplicitEmptyState)) return { kind: 'explicit_zero' };
  const emptySelectors = [
    '[data-search-result] [data-empty="true"]',
    '[data-search-result] [data-testid*="empty"]',
    '[data-search-result] [class*="empty"]',
    '[data-search-result] [class*="no-result"]',
    '[data-search-result] [class*="no-results"]',
    '[data-search-result] [class*="zero-result"]',
    '[class*="search-result"] [data-empty="true"]',
    '[class*="search-result"] [data-testid*="empty"]',
    '[class*="search-result"] [class*="empty"]',
    '[class*="search-result"] [class*="no-result"]',
    '[class*="search-result"] [class*="no-results"]',
    '[class*="search-result"] [class*="zero-result"]',
    '[class*="offer-list"] [data-empty="true"]',
    '[class*="offer-list"] [class*="empty"]',
    '[class*="result-list"] [data-empty="true"]',
    '[class*="result-list"] [class*="empty"]',
  ].join(', ');
  return roots.some((root) => queryAll(root, emptySelectors).length > 0)
    ? { kind: 'explicit_zero' }
    : { kind: 'unready' };
}

/** Keeps the historical rows-only helper for pure extractor consumers. */
export function collect1688KeywordDomRecords(maxResults: number): unknown[] {
  const result = inspect1688KeywordDomReadiness(maxResults);
  return result.kind === 'items' ? result.records : [];
}

function recognizedApiCollections(payload: unknown): unknown[][] {
  const collections: unknown[][] = [];
  const seenObjects = new WeakSet<object>();
  const queue: Array<{ value: unknown; depth: number }> = [{ value: payload, depth: 0 }];
  let visited = 0;

  while (queue.length > 0 && visited < MAX_VISITED_PAYLOAD_OBJECTS) {
    const entry = queue.shift();
    if (!entry || !isRecordOrArray(entry.value)) continue;
    if (seenObjects.has(entry.value)) continue;
    seenObjects.add(entry.value);
    visited += 1;

    if (isRecord(entry.value)) {
      let entries: Array<[string, unknown]> = [];
      try {
        entries = Object.entries(entry.value);
      } catch {
        return collections;
      }
      for (const [key, child] of entries) {
        const normalizedKey = key.replace(/[^a-z]/giu, '').toLowerCase();
        if (API_COLLECTION_KEYS.has(normalizedKey) && Array.isArray(child)) {
          collections.push(child);
        }
        if (entry.depth < MAX_PAYLOAD_DEPTH && isRecordOrArray(child)) {
          queue.push({ value: child, depth: entry.depth + 1 });
        }
      }
      continue;
    }
    if (entry.depth < MAX_PAYLOAD_DEPTH) {
      for (const child of entry.value) {
        if (isRecordOrArray(child)) queue.push({ value: child, depth: entry.depth + 1 });
      }
    }
  }
  return collections;
}

function normalize1688KeywordItem(value: Record<string, unknown>, index: number): Search1688KeywordItem | null {
  const sourceCandidate = firstText(value, [
    'detailUrl', 'offerUrl', 'productUrl', 'url', 'href', 'linkUrl', 'link', 'sourceUrl',
  ], MAX_URL_LENGTH);
  const offerId = offerIdFromValue(
    firstText(value, ['offerId', 'offerID', 'offer_id', 'productId', 'productID', 'itemId'], 200),
  ) ?? offerIdFromValue(sourceCandidate);
  const sourceUrl = offerId ? canonicalOfferUrl(offerId) : normalizeSupplierOfferUrl(sourceCandidate);
  const title = firstText(value, ['subject', 'offerTitle', 'title', 'productTitle', 'name'], MAX_TEXT_LENGTH);
  if (!title || !sourceUrl) return null;

  const salesText = firstText(value, [
    'monthlySales', 'saleNum', 'saleCount', 'tradeQuantity', 'dealCount', 'soldCount', 'tradeCount',
    'tradeText', 'salesText', 'sales',
  ], 200);
  const suppliedScore = metricValue(firstText(value, ['score', 'rankScore'], 100));

  return {
    offerId,
    title,
    priceCny: metricValue(firstText(value, [
      'price', 'priceValue', 'minPrice', 'discountPrice', 'salePrice', 'currentPrice', 'priceText',
    ], 100)),
    sourceUrl,
    imageUrl: normalizePublicImageUrl(firstText(value, [
      'imageUrl', 'imgUrl', 'offerImgUrl', 'mainImage', 'mainPic', 'picUrl', 'pictureUrl', 'image',
    ], MAX_URL_LENGTH)),
    monthlySales: monthlySalesValue(salesText),
    tradeScore: metricValue(firstText(value, ['tradeScore', 'tradeLevel', 'serviceScore'], 100)),
    repurchaseRate: nullableText(firstText(value, ['repurchaseRate', 'repurchase', 'repeatPurchaseRate'], 500)),
    supplierName: nullableText(firstText(value, ['companyName', 'supplierName', 'shopName', 'sellerName', 'loginId'], 500)),
    score: suppliedScore != null && suppliedScore <= 100 ? suppliedScore : Math.max(0, 100 - index),
  };
}

function sameOfferIdentity(left: Search1688KeywordItem, right: Search1688KeywordItem): boolean {
  if (left.offerId && right.offerId) return left.offerId === right.offerId;
  return left.sourceUrl === right.sourceUrl;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isRecordOrArray(value: unknown): value is Record<string, unknown> | unknown[] {
  return value !== null && typeof value === 'object';
}

function childrenOf(value: Record<string, unknown> | unknown[]): unknown[] {
  try {
    return Array.isArray(value) ? value : Object.values(value);
  } catch {
    return [];
  }
}

function firstText(source: Record<string, unknown>, keys: readonly string[], maxLength: number): string {
  for (const key of keys) {
    const value = scalarText(source[key], maxLength);
    if (value) return value;
  }
  return '';
}

function scalarText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).replace(/\s+/gu, ' ').trim().slice(0, maxLength);
}

function nullableText(value: string): string | null {
  return value || null;
}

function offerIdFromValue(value: string): string | null {
  const normalized = value.trim();
  if (/^\d{6,}$/u.test(normalized)) return normalized;
  const path = normalized.match(/\/offer\/(\d{6,})(?:\.html)?(?:[/?#]|$)/iu);
  if (path?.[1]) return path[1];
  const query = normalized.match(/(?:[?&]|^)(?:offerId|offer_id)=(\d{6,})(?:[&#]|$)/iu);
  return query?.[1] ?? null;
}

function canonicalOfferUrl(offerId: string): string {
  return `https://detail.1688.com/offer/${offerId}.html`;
}

function normalizeSupplierOfferUrl(value: string): string | null {
  if (!value) return null;
  try {
    return parseAllowedSupplierUrl(value).normalizedUrl;
  } catch {
    return null;
  }
}

function normalizePublicImageUrl(value: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.startsWith('//') ? `https:${value}` : value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function metricValue(value: string): number | null {
  const match = value.replace(/,/gu, '').match(/\d+(?:\.\d+)?/u);
  if (!match) return null;
  const metric = Number(match[0]);
  if (!Number.isFinite(metric) || metric < 0) return null;
  return Math.min(MAX_METRIC, metric);
}

function monthlySalesValue(value: string): number | null {
  const text = value.replace(/,/gu, '');
  if (!text) return null;
  const beforeCount = text.match(
    /(?:近\s*30\s*天\s*)?(?:成交|月销|销量|已售|付款|购买|采购|下单|구매)[^\d]{0,12}(\d+(?:\.\d+)?)\s*([亿万千억만천]?)\s*\+?/iu,
  );
  const afterCount = text.match(
    /(\d+(?:\.\d+)?)\s*([亿万千억만천]?)\s*\+?\s*(?:人付款|件已售|笔成交|购买|人采购|人下单|구매)/iu,
  );
  const match = beforeCount ?? afterCount;
  if (!match?.[1]) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount < 0) return null;
  const multiplier = match[2] === '亿' || match[2] === '억' ? 100_000_000
    : match[2] === '万' || match[2] === '만' ? 10_000
      : match[2] === '千' || match[2] === '천' ? 1_000
        : 1;
  return Math.min(MAX_METRIC, Math.floor(amount * multiplier));
}
