import { ConflictException } from '@nestjs/common';
import { kstBusinessDate } from '../../../common/kst';
import type { SourcingBrowserSourceAttemptPlan } from '../port/out/repository/sourcing-browser-source-attempt.repository.port';
import type { TiktokCcSnapshotUpsert } from '../port/out/repository/trend-collection.repository.port';

export const SOURCE_TIKTOK_CREATIVE = 'tiktok.creative';
export const TIKTOK_SOURCE_SCOPE = 'default';
export const TIKTOK_SOURCE_TARGET = 'all';

const MAX_ITEMS = 100;
const MAX_TARGET_SEEDS = 20;
const TIKTOK_TREND_TYPES = new Set(['hashtag', 'keyword', 'product', 'song']);

export interface TiktokSourceTargetSeed {
  label: string;
  keyword: string;
}

export interface TiktokSourcePlan extends SourcingBrowserSourceAttemptPlan {
  source: typeof SOURCE_TIKTOK_CREATIVE;
  targetSeeds: TiktokSourceTargetSeed[];
  maxItems: number;
  regionOverride: string | null;
}

/**
 * This is the extension's existing terminal shape plus lifecycle coverage.
 * Provider item normalization intentionally remains in the source mapper.
 */
export interface BrowserTiktokSourceBatch {
  region: unknown;
  items: unknown;
  visitedTargetIds: unknown;
  errors?: unknown;
}

export interface NormalizedTiktokSourceBatch {
  region: string;
  rows: TiktokCcSnapshotUpsert[];
  visitedTargetIds: string[];
  errorCount: number;
}

export function buildTiktokSourcePlan(input: {
  targetSeeds: unknown;
  maxItems?: unknown;
  region?: unknown;
}): TiktokSourcePlan {
  return {
    source: SOURCE_TIKTOK_CREATIVE,
    targetSeeds: normalizeLegacyTargetSeeds(input.targetSeeds),
    maxItems: clampMaxItems(input.maxItems),
    regionOverride: sanitizeRegionOverride(input.region),
  };
}

export function parseTiktokSourcePlan(value: SourcingBrowserSourceAttemptPlan): TiktokSourcePlan {
  const targetSeedsValue = value.targetSeeds;
  const maxItems = value.maxItems;
  const regionOverride = value.regionOverride;
  if (
    value.source !== SOURCE_TIKTOK_CREATIVE
    || !Array.isArray(targetSeedsValue)
    || typeof maxItems !== 'number'
    || !Number.isInteger(maxItems)
    || maxItems < 1
    || maxItems > MAX_ITEMS
    || (regionOverride !== null && typeof regionOverride !== 'string')
  ) {
    throw new ConflictException('SOURCE_PLAN_MALFORMED');
  }
  const targetSeeds = normalizeLegacyTargetSeeds(targetSeedsValue);
  if (
    targetSeeds.length !== targetSeedsValue.length
    || !targetSeeds.every((seed, index) => sameSeed(seed, targetSeedsValue[index]))
    || (regionOverride !== null && !isRegion(regionOverride))
  ) {
    throw new ConflictException('SOURCE_PLAN_MALFORMED');
  }
  return {
    source: SOURCE_TIKTOK_CREATIVE,
    targetSeeds,
    maxItems,
    regionOverride,
  };
}

/** The checksum intentionally excludes valid per-run collection options. */
export function tiktokPlanChecksumInput(plan: Pick<TiktokSourcePlan, 'source' | 'targetSeeds'>) {
  return { source: plan.source, targetSeeds: plan.targetSeeds };
}

/** The request fingerprint intentionally excludes mutable owner target seeds. */
export function tiktokRequestFingerprintInput(
  plan: Pick<TiktokSourcePlan, 'source' | 'maxItems' | 'regionOverride'>,
) {
  return {
    source: plan.source,
    maxItems: plan.maxItems,
    regionOverride: plan.regionOverride,
  };
}

export function plannedTiktokTargetIds(plan: Pick<TiktokSourcePlan, 'targetSeeds'>): string[] {
  return [
    'hashtag',
    'product',
    ...plan.targetSeeds.map((seed) => `keyword:${seed.keyword}`),
  ];
}

export function normalizeTiktokSourceBatch(input: {
  organizationId: string;
  operationId: string;
  batch: BrowserTiktokSourceBatch;
}): NormalizedTiktokSourceBatch {
  if (!isRecord(input.batch) || !Array.isArray(input.batch.items) || input.batch.items.length > MAX_ITEMS) {
    throw new ConflictException('SOURCE_BATCH_INVALID');
  }
  const region = normalizeTerminalRegion(input.batch.region);
  const visitedTargetIds = normalizeVisitedTargetIds(input.batch.visitedTargetIds);
  const errors = errorCount(input.batch.errors);
  const capturedAt = new Date();
  const businessDate = kstBusinessDate(capturedAt);
  const seen = new Set<string>();
  const rows: TiktokCcSnapshotUpsert[] = [];

  input.batch.items.forEach((item, index) => {
    const normalized = normalizeTiktokItem(item, index);
    const identity = `${normalized.trendType}\u001f${normalized.entityKey}`;
    if (seen.has(identity)) return;
    seen.add(identity);
    rows.push({
      organizationId: input.organizationId,
      operationId: input.operationId,
      businessDate,
      region,
      ...normalized,
      capturedAt,
    });
  });

  return {
    region,
    rows,
    visitedTargetIds,
    errorCount: errors,
  };
}

export function hasCompleteTiktokCoverage(
  plan: Pick<TiktokSourcePlan, 'targetSeeds' | 'maxItems'>,
  batch: Pick<NormalizedTiktokSourceBatch, 'rows' | 'visitedTargetIds' | 'errorCount'>,
): boolean {
  if (batch.errorCount > 0 || batch.rows.length > plan.maxItems) return false;
  const expected = plannedTiktokTargetIds(plan);
  if (sameOrderedIds(batch.visitedTargetIds, expected)) return true;
  return batch.rows.length === plan.maxItems
    && batch.visitedTargetIds.length > 0
    && isOrderedPrefix(batch.visitedTargetIds, expected);
}

function normalizeLegacyTargetSeeds(value: unknown): TiktokSourceTargetSeed[] {
  if (!Array.isArray(value)) return [];
  const targets: TiktokSourceTargetSeed[] = [];
  for (const entry of value) {
    const keyword = isRecord(entry) && typeof entry.keyword === 'string'
      ? entry.keyword.trim()
      : '';
    if (!keyword) continue;
    const rawLabel = isRecord(entry) && typeof entry.label === 'string'
      ? entry.label.trim()
      : '';
    targets.push({
      label: (rawLabel || keyword).slice(0, 200),
      keyword: keyword.slice(0, 100),
    });
    if (targets.length >= MAX_TARGET_SEEDS) break;
  }
  return targets;
}

function sameSeed(seed: TiktokSourceTargetSeed, value: unknown): boolean {
  return isRecord(value) && value.label === seed.label && value.keyword === seed.keyword;
}

function clampMaxItems(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) return MAX_ITEMS;
  return Math.max(1, Math.min(MAX_ITEMS, value));
}

function sanitizeRegionOverride(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/[^A-Za-z]/g, '').toUpperCase();
  return isRegion(cleaned) ? cleaned : null;
}

function normalizeTerminalRegion(value: unknown): string {
  const region = boundedText(value, 8).toUpperCase();
  if (!isRegion(region)) throw new ConflictException('SOURCE_BATCH_INVALID');
  return region;
}

function isRegion(value: string): boolean {
  return /^[A-Z]{2,8}$/.test(value);
}

function normalizeVisitedTargetIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > MAX_TARGET_SEEDS + 2) {
    throw new ConflictException('SOURCE_BATCH_INVALID');
  }
  if (!value.every((target) => typeof target === 'string' && target.length > 0 && target.length <= 200)) {
    throw new ConflictException('SOURCE_BATCH_INVALID');
  }
  return [...value];
}

function normalizeTiktokItem(value: unknown, index: number): Omit<TiktokCcSnapshotUpsert, 'organizationId' | 'operationId' | 'businessDate' | 'region' | 'capturedAt'> {
  if (!isRecord(value)) throw new ConflictException('SOURCE_BATCH_INVALID');
  const trendType = boundedRequiredText(value.trendType, 32);
  if (!TIKTOK_TREND_TYPES.has(trendType)) throw new ConflictException('SOURCE_BATCH_INVALID');
  const entityKey = boundedRequiredText(value.entityKey, 200);
  return {
    trendType,
    entityKey,
    rank: optionalInt(value.rank, 1, 1_000) ?? index + 1,
    label: optionalText(value.label, 300),
    industry: optionalText(value.industry, 120),
    sourceKeyword: optionalText(value.sourceKeyword, 80),
    postCount: optionalInt(value.postCount, 0, 2_147_483_647),
    viewCount: optionalInt(value.viewCount, 0, 9_000_000_000_000),
    growthPct: optionalNumber(value.growthPct, -100_000, 10_000_000),
    thumbnailUrl: optionalHttpUrl(value.thumbnailUrl),
    sourceUrl: optionalHttpUrl(value.sourceUrl),
  };
}

function boundedRequiredText(value: unknown, max: number): string {
  const text = boundedText(value, max);
  if (!text) throw new ConflictException('SOURCE_BATCH_INVALID');
  return text;
}

function optionalText(value: unknown, max: number): string | null {
  return boundedText(value, max) || null;
}

function optionalInt(value: unknown, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
    ? value
    : null;
}

function optionalNumber(value: unknown, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
    ? value
    : null;
}

function optionalHttpUrl(value: unknown): string | null {
  const text = boundedText(value, 2_048);
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.protocol === 'http:' || url.protocol === 'https:' ? text : null;
  } catch {
    return null;
  }
}

function boundedText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function errorCount(value: unknown): number {
  return Array.isArray(value) ? Math.min(value.length, 50) : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function sameOrderedIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function isOrderedPrefix(prefix: readonly string[], values: readonly string[]): boolean {
  return prefix.length <= values.length && prefix.every((value, index) => value === values[index]);
}
