import { ConflictException } from '@nestjs/common';
import { kstBusinessDate } from '../../../common/kst';
import type { SourcingBrowserSourceAttemptPlan } from '../port/out/repository/sourcing-browser-source-attempt.repository.port';
import type {
  LiveCommerceBroadcastSnapshotUpsert,
  LiveCommerceProductSnapshotUpsert,
  LiveCommerceSource,
} from '../port/out/repository/live-commerce.repository.port';

export const SOURCE_LIVE_COMMERCE_SCOPE = 'page-url';
export const MAX_LIVE_COMMERCE_PRODUCTS = 100;
const MAX_LIVE_COMMERCE_PAGE_URL_LENGTH = 500;

export const BROWSER_SOURCES = ['1688', 'douyin'] as const;

export type BrowserLiveCommerceSource = (typeof BROWSER_SOURCES)[number];

export interface BrowserLiveCommerceSourceBatch {
  source: BrowserLiveCommerceSource;
  pageUrl: string;
  broadcast: {
    broadcastId: string;
    title?: string;
    broadcasterId?: string;
    broadcasterName?: string;
    status?: string;
    viewerCount?: number;
    likeCount?: number;
    startedAt?: string;
    endedAt?: string;
    coverImageUrl?: string;
  };
  products: Array<{
    productId: string;
    rank?: number;
    title?: string;
    priceCny?: number;
    salesCount?: number;
    imageUrl?: string;
    sourceUrl?: string;
  }>;
}

export type BrowserLiveCommerceSourcePlan = {
  source: BrowserLiveCommerceSource;
  pageUrl: string;
  maxProducts: typeof MAX_LIVE_COMMERCE_PRODUCTS;
};

export function sourceKeyForBrowserLiveCommerce(source: BrowserLiveCommerceSource): string {
  return `${source}.live_commerce`;
}

export function buildBrowserLiveCommercePlan(url: unknown): BrowserLiveCommerceSourcePlan {
  const pageUrl = normalizeBrowserLiveCommerceUrl(url);
  const source = browserLiveCommerceSourceForUrl(pageUrl);
  if (!source) throw new ConflictException('SOURCE_PLAN_MALFORMED');
  return { source, pageUrl, maxProducts: MAX_LIVE_COMMERCE_PRODUCTS };
}

export function parseBrowserLiveCommercePlan(
  value: SourcingBrowserSourceAttemptPlan,
): BrowserLiveCommerceSourcePlan {
  if (
    !value
    || value.maxProducts !== MAX_LIVE_COMMERCE_PRODUCTS
    || typeof value.pageUrl !== 'string'
    || !BROWSER_SOURCES.includes(value.source as BrowserLiveCommerceSource)
  ) {
    throw new ConflictException('SOURCE_PLAN_MALFORMED');
  }
  const pageUrl = normalizeBrowserLiveCommerceUrl(value.pageUrl);
  const source = value.source as BrowserLiveCommerceSource;
  if (browserLiveCommerceSourceForUrl(pageUrl) !== source) {
    throw new ConflictException('SOURCE_PLAN_MALFORMED');
  }
  return { source, pageUrl, maxProducts: MAX_LIVE_COMMERCE_PRODUCTS };
}

export function normalizeBrowserLiveCommerceBatch(input: {
  organizationId: string;
  operationId: string;
  plan: BrowserLiveCommerceSourcePlan;
  batch: BrowserLiveCommerceSourceBatch;
}): {
  source: BrowserLiveCommerceSource;
  pageUrl: string;
  broadcast: LiveCommerceBroadcastSnapshotUpsert;
  products: LiveCommerceProductSnapshotUpsert[];
} {
  const source = input.batch?.source;
  const pageUrl = normalizeBrowserLiveCommerceUrl(input.batch?.pageUrl);
  if (
    !BROWSER_SOURCES.includes(source)
    || source !== input.plan.source
    || pageUrl !== input.plan.pageUrl
  ) {
    throw new ConflictException('SOURCE_PLAN_MISMATCH');
  }
  if (!input.batch.broadcast || !Array.isArray(input.batch.products)) {
    throw new ConflictException('SOURCE_BATCH_INVALID');
  }
  if (input.batch.products.length > input.plan.maxProducts) {
    throw new ConflictException('SOURCE_BATCH_INVALID');
  }

  const capturedAt = new Date();
  const businessDate = kstBusinessDate(capturedAt);
  const broadcastId = requiredText(input.batch.broadcast.broadcastId, 128);
  const broadcast: LiveCommerceBroadcastSnapshotUpsert = {
    organizationId: input.organizationId,
    operationId: input.operationId,
    businessDate,
    source,
    broadcastId,
    title: optionalText(input.batch.broadcast.title, 500),
    broadcasterId: optionalText(input.batch.broadcast.broadcasterId, 128),
    broadcasterName: optionalText(input.batch.broadcast.broadcasterName, 200),
    status: optionalText(input.batch.broadcast.status, 64),
    viewerCount: boundedInt(input.batch.broadcast.viewerCount, 0, 2_147_483_647),
    likeCount: boundedInt(input.batch.broadcast.likeCount, 0, 2_147_483_647),
    startedAt: optionalDate(input.batch.broadcast.startedAt),
    endedAt: optionalDate(input.batch.broadcast.endedAt),
    coverImageUrl: optionalHttpUrl(input.batch.broadcast.coverImageUrl),
    sourceUrl: pageUrl,
    capturedAt,
  };
  const productIds = new Set<string>();
  const products: LiveCommerceProductSnapshotUpsert[] = [];
  input.batch.products.forEach((item, index) => {
    const productId = optionalText(item?.productId, 128);
    if (!productId || productIds.has(productId)) return;
    productIds.add(productId);
    products.push({
      organizationId: input.organizationId,
      operationId: input.operationId,
      businessDate,
      source,
      broadcastId,
      productId,
      rank: boundedInt(item.rank, 1, input.plan.maxProducts) ?? index + 1,
      title: optionalText(item.title, 500),
      priceCny: boundedNumber(item.priceCny, 0, 1_000_000_000),
      salesCount: boundedInt(item.salesCount, 0, 2_147_483_647),
      imageUrl: optionalHttpUrl(item.imageUrl),
      sourceUrl: optionalSourceUrl(source, item.sourceUrl),
      capturedAt,
    });
  });
  return { source, pageUrl, broadcast, products };
}

export function normalizeBrowserLiveCommerceUrl(value: unknown): string {
  if (
    typeof value !== 'string'
    || !value.trim()
    || value.length > MAX_LIVE_COMMERCE_PAGE_URL_LENGTH
  ) {
    throw new ConflictException('SOURCE_BATCH_INVALID');
  }
  try {
    const parsed = new URL(value.trim());
    if (
      parsed.protocol !== 'https:'
      || !browserLiveCommerceSourceForUrl(parsed.toString())
    ) {
      throw new Error('host_invalid');
    }
    const normalized = parsed.toString();
    if (normalized.length > MAX_LIVE_COMMERCE_PAGE_URL_LENGTH) throw new Error('url_too_long');
    return normalized;
  } catch {
    throw new ConflictException('SOURCE_BATCH_INVALID');
  }
}

export function browserLiveCommerceSourceForUrl(value: string): BrowserLiveCommerceSource | null {
  const host = new URL(value).hostname.toLowerCase();
  if (host === 'zb.1688.com' || host.endsWith('.zb.1688.com')) return '1688';
  if (host === 'live.douyin.com' || host.endsWith('.live.douyin.com')) return 'douyin';
  return null;
}

function requiredText(value: unknown, maxLength: number): string {
  const result = optionalText(value, maxLength);
  if (!result) throw new ConflictException('SOURCE_BATCH_INVALID');
  return result;
}

function optionalText(value: unknown, maxLength: number): string | null {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) || null : null;
}

function optionalHttpUrl(value: unknown): string | null {
  const result = optionalText(value, 2_048);
  if (!result) return null;
  try {
    const parsed = new URL(result);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function optionalSourceUrl(source: BrowserLiveCommerceSource, value: unknown): string | null {
  const result = optionalHttpUrl(value);
  if (!result) return null;
  const host = new URL(result).hostname.toLowerCase();
  const matches = source === '1688'
    ? host === '1688.com' || host.endsWith('.1688.com')
    : host === 'douyin.com' || host.endsWith('.douyin.com')
      || host === 'jinritemai.com' || host.endsWith('.jinritemai.com');
  return matches ? result : null;
}

function optionalDate(value: unknown): Date | null {
  const text = optionalText(value, 64);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function boundedInt(value: unknown, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
    ? value
    : null;
}

function boundedNumber(value: unknown, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
    ? value
    : null;
}
