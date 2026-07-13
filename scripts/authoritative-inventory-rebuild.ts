#!/usr/bin/env tsx
import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertLocalDevelopmentDatabase } from './bootstrap-authoritative-inventory-dev';

const SCHEMA_VERSION = 'kiditem.authoritative-inventory-rebuild.v2';
const REBUILD_STATUS_KEY = 'inventory.rebuild.status';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GIT_SHA_PATTERN = /^[0-9a-f]{40}$/i;
const PRIVATE_REPLAY_KEY_PATTERN = /(?:auth(?:orization)?|password|passcode|secret|token|credential|cookie|session|e-?mail|phone|address|street|postal|zip|buyer|customer|receiver|recipient|memo|note|review|(?:^|[_-])(?:name|full.?name|first.?name|last.?name|home)(?:[_-]|$)|이름|성명|배송|주소|연락처|전화|이메일|수령|구매자|고객|메모|요청사항)/i;
const EMAIL_VALUE_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE_VALUE_PATTERN = /(?:^|\D)(?:\+?82[-.\s]?)?0?1[016789][-.\s]?\d{3,4}[-.\s]?\d{4}(?:\D|$)/;
const INTERNATIONAL_PHONE_VALUE_PATTERN = /(?:^|\D)\+[1-9]\d{0,2}(?:[\s().-]*\d){7,14}(?:\D|$)/;
const KOREAN_ADDRESS_VALUE_PATTERN = /(?:서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)(?:특별시|광역시|특별자치시|특별자치도|도)?\s+(?:[^\s]+(?:시|군|구)\s+)?[^\s]+(?:로|길|동|읍|면)(?:\s+\d[\d-]*)?/;
const ENGLISH_ADDRESS_VALUE_PATTERN = /(?:\bP\.?O\.?\s+Box\s+\d+\b|\b\d{1,6}\s+(?:[A-Z0-9.'-]+\s+){1,7}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Way|Parkway|Pkwy|Highway|Hwy)\b)/i;
const BODY_KEYS = new Set([
  'type', 'source', 'data', 'normalizedRows', 'kpis', 'summary', 'adSummary',
  'campaignName', 'period', 'timestamp', 'dateFrom', 'dateTo', 'url',
]);
const BUNDLE_KEYS = new Set([
  'schemaVersion', 'target', 'originRunId', 'deployedSha', 'organizationId',
  'channelAccountId', 'channelAccountFingerprint', 'createdAt',
  'expectedReplayCounts', 'expectedFactDigestSha256', 'payloadSha256', 'payloads',
]);
const PAYLOAD_KEYS = new Set(['sourceRunId', 'body']);
const WING_ITEM_ROW_KEYS = new Set([
  'externalId', 'external_id', 'productId', 'coupangProductId', 'vendorItemId',
  'vendor_item_id', 'itemId', 'productName', 'isWinner', 'myPrice', 'winnerPrice',
]);
const TRAFFIC_ROW_KEYS = new Set([
  'externalId', 'external_id', 'productId', 'coupangProductId', 'vendorItemId',
  'vendor_item_id', 'itemId', 'productName', 'visitors', 'views', 'cartAdds',
  'orders', 'salesQty', 'revenue', 'conversionRate', 'adStatus',
]);
const AD_ROW_KEYS = new Set([
  'externalId', 'external_id', 'productId', 'coupangProductId', 'vendorItemId',
  'vendor_item_id', 'itemId', '_kpiOnly', 'pageType', 'campaignName', 'campaignId',
  'adGroup', 'keyword', 'productName', 'imageUrl', 'productUrl', 'saleType',
  'placement', 'status', 'onOff', 'currentBid', 'dailyBudget', 'runningAdSpend',
  'spend', 'revenue', 'impressions', 'clicks', 'conversions', 'orders', 'roas',
  'ctr', 'conversionRate', 'adEfficiencyTarget',
]);
const ADS_DAILY_ROW_KEYS = new Set([
  'date', 'adSpend', 'adRevenue', 'impressions', 'clicks', 'conversions', 'orders',
  'roas', 'ctr', 'conversionRate', 'rowCount',
]);
const ACCOUNT_AD_DAILY_DIGEST_KEYS = new Set([
  'adSpend', 'adRevenue', 'impressions', 'clicks', 'conversions', 'orders',
  'providerRoas', 'providerCtr', 'providerConversionRate',
]);
const TRAFFIC_SUMMARY_KEYS = new Set([
  'visitors', 'views', 'cartAdds', 'orders', 'conversionRate', 'salesQty', 'revenue',
]);
const AD_SUMMARY_KEYS = new Set([
  'adGmv', 'adSpend', 'adOrders', 'trafficOrders', 'revenue', 'orders',
]);
const TRAFFIC_KPI_KEYS = new Set([
  'visitor', 'pageView', 'addToCart', 'order', 'conversion', 'unitSold', 'sales',
]);
const WING_KPI_KEYS = new Set([
  '전체 상품', '아이템위너 상품', '아이템위너', '노출제한 상품', '노출 제한 상품',
  '판매중 상품', '판매 중 상품', '품절 상품',
]);
const ADS_KPI_KEYS = new Set([
  '전체 집행 광고비', '집행 광고비', '광고비', '광고 전환 매출', '광고 매출',
  '노출', '노출수', '클릭', '클릭수', '전환 판매수', '광고 전환 판매수',
  '전환수', '전환 주문수', '광고 전환 주문수', '주문수', '광고 수익률',
  '광고수익률', '클릭률', '전환율', 'ad spend', 'ad gmv', 'impressions',
  'clicks', 'conversions', 'orders', 'roas', 'ctr', 'conversion rate',
]);
const BOOLEAN_ROW_KEYS = new Set(['isWinner', '_kpiOnly']);
const NUMBERISH_ROW_KEYS = new Set([
  'myPrice', 'winnerPrice', 'visitors', 'views', 'cartAdds', 'orders', 'salesQty',
  'revenue', 'conversionRate', 'currentBid', 'dailyBudget', 'runningAdSpend',
  'spend', 'impressions', 'clicks', 'conversions', 'roas', 'ctr',
  'adEfficiencyTarget', 'adSpend', 'adRevenue', 'rowCount',
]);
const COMMANDS = new Set([
  'guard',
  'export-coupang',
  'bootstrap',
  'replay-coupang',
  'verify-ready',
]);

type SharedRebuildTarget = 'staging' | 'production';
type RebuildTarget = SharedRebuildTarget | 'local';

export type SharedRebuildGuardInput = {
  target: string;
  deploymentTarget: string;
  githubEnvironment: string;
  confirmation: string;
  expectedConfirmation: string;
  githubActions: string;
};

export type LocalRebuildGuardInput = {
  databaseUrl: string;
  confirmation: string;
  expectedConfirmation: string;
};

export type SharedBootstrapInput = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  userId: string;
  userEmail: string;
  userName: string;
  coupangAccountId: string;
  coupangExternalAccountId: string;
  coupangAccountName: string;
  rocketAccountId?: string;
  rocketExternalAccountId?: string;
  rocketAccountName?: string;
};

export type SharedBootstrapPlan = ReturnType<typeof buildSharedBootstrapPlan>;

type JsonRecord = Record<string, unknown>;
type RebuildPrisma = PrismaClient | Prisma.TransactionClient;

export type ReplaySourceRun = {
  id: string;
  source: string;
  pageType: string;
  businessDate: Date | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  period: string | null;
  targetUrl: string | null;
  metaJson: unknown;
  snapshots: Array<{
    rawJson: unknown;
    normalizedJson: unknown;
  }>;
};

export type ReplayFactCounts = {
  scrapeRuns: number;
  rawSnapshots: number;
  listingDailyFacts: number;
  optionDailyFacts: number;
  adTargetFacts: number;
  accountKpiFacts: number;
};

export type CoupangReplayBundle = {
  schemaVersion: typeof SCHEMA_VERSION;
  target: RebuildTarget;
  originRunId: string;
  deployedSha: string;
  organizationId: string;
  channelAccountId: string;
  channelAccountFingerprint: string;
  createdAt: string;
  expectedReplayCounts: ReplayFactCounts;
  expectedFactDigestSha256: string;
  payloadSha256: string;
  payloads: Array<{
    sourceRunId: string;
    body: JsonRecord;
  }>;
};

export type RebuildReadyActual = {
  completedSellpiaImports: number;
  completedWingImports: number;
  activeMasters: number;
  listings: number;
  channelSkus: number;
};

export type RebuildReadyExpected = {
  activeMasters: number;
  listings: number;
  channelSkus: number;
};

type ParsedCli = {
  command: string;
  values: Map<string, string>;
};

export function assertSharedRebuildGuard(input: SharedRebuildGuardInput): SharedRebuildTarget {
  const expectedToken = `RESET_${input.target.toUpperCase()}_DATA`;
  const safe =
    (input.target === 'staging' || input.target === 'production') &&
    input.deploymentTarget === input.target &&
    input.githubActions === 'true' &&
    input.githubEnvironment === input.target &&
    input.expectedConfirmation === expectedToken &&
    input.confirmation === expectedToken;

  if (!safe) {
    throw new Error(
      'Refusing shared database rebuild: GitHub Actions, target Environment, and exact reset confirmation must all match.',
    );
  }
  return input.target as SharedRebuildTarget;
}

export function assertLocalRebuildGuard(input: LocalRebuildGuardInput): 'local' {
  assertLocalDevelopmentDatabase(input.databaseUrl);
  if (
    input.expectedConfirmation !== 'RESET_LOCAL_DATA' ||
    input.confirmation !== 'RESET_LOCAL_DATA'
  ) {
    throw new Error('Refusing local rebuild: exact RESET_LOCAL_DATA confirmation is required');
  }
  return 'local';
}

type DatabaseIdentityPrisma = {
  organization: {
    findFirst(input: unknown): Promise<{ id: string; slug: string } | null>;
  };
  channelAccount: {
    findFirst(input: unknown): Promise<{
      id: string;
      channel: string;
      externalAccountId: string | null;
    } | null>;
  };
};

export type SharedDatabaseIdentityInput = {
  target: SharedRebuildTarget;
  databaseUrl: string;
  expectedDatabaseHost: string;
  expectedSupabaseProjectRef: string;
  organizationId: string;
  organizationSlug: string;
  channelAccountId: string;
  channelAccountExternalId: string;
};

export async function assertSharedDatabaseIdentity(
  prisma: DatabaseIdentityPrisma,
  input: SharedDatabaseIdentityInput,
): Promise<{
  target: SharedRebuildTarget;
  organizationId: string;
  channelAccountId: string;
  channelAccountFingerprint: string;
}> {
  const parsed = new URL(input.databaseUrl);
  const actualHost = parsed.hostname.toLowerCase();
  const expectedHost = requireText(input.expectedDatabaseHost, 'expectedDatabaseHost')
    .toLowerCase();
  if (actualHost !== expectedHost) {
    throw new Error(
      `Refusing ${input.target} rebuild: database host fingerprint does not match the protected environment`,
    );
  }
  const projectRef = databaseProjectRef(parsed);
  if (projectRef !== input.expectedSupabaseProjectRef) {
    throw new Error(
      `Refusing ${input.target} rebuild: database project fingerprint does not match the protected environment`,
    );
  }
  assertUuid(input.organizationId, 'organizationId');
  assertUuid(input.channelAccountId, 'channelAccountId');
  const [organization, account] = await Promise.all([
    prisma.organization.findFirst({
      where: { id: input.organizationId, slug: input.organizationSlug },
      select: { id: true, slug: true },
    }),
    prisma.channelAccount.findFirst({
      where: {
        id: input.channelAccountId,
        organizationId: input.organizationId,
        channel: 'coupang',
        externalAccountId: input.channelAccountExternalId,
      },
      select: { id: true, channel: true, externalAccountId: true },
    }),
  ]);
  if (
    organization?.id !== input.organizationId ||
    organization.slug !== input.organizationSlug
  ) {
    throw new Error(`Refusing ${input.target} rebuild: protected Organization identity is absent`);
  }
  if (
    account?.id !== input.channelAccountId ||
    account.channel !== 'coupang' ||
    account.externalAccountId !== input.channelAccountExternalId
  ) {
    throw new Error(`Refusing ${input.target} rebuild: protected ChannelAccount identity is absent`);
  }
  return {
    target: input.target,
    organizationId: organization.id,
    channelAccountId: account.id,
    channelAccountFingerprint: buildChannelAccountFingerprint({
      organizationId: organization.id,
      channelAccountId: account.id,
      channelAccountExternalId: account.externalAccountId,
    }),
  };
}

export function assertProtectedApiDestination(
  apiUrl: string,
  expectedProtectedOrigin: string,
): void {
  const actual = new URL(apiUrl);
  const expected = new URL(expectedProtectedOrigin);
  const loopback = actual.hostname === 'localhost' || actual.hostname === '127.0.0.1';
  if (!loopback && actual.protocol !== 'https:') {
    throw new Error('Non-local rebuild API URL must use HTTPS before bearer transmission');
  }
  if (actual.origin !== expected.origin) {
    throw new Error('Rebuild API URL does not match the expected protected API origin');
  }
}

export function assertProtectedSupabaseDestination(
  supabaseUrl: string,
  expectedProjectRef: string,
): void {
  const parsed = new URL(supabaseUrl);
  const expectedOrigin = `https://${expectedProjectRef}.supabase.co`;
  if (
    parsed.protocol !== 'https:' ||
    parsed.origin !== expectedOrigin ||
    parsed.port !== '' ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.pathname !== '/' ||
    parsed.search !== '' ||
    parsed.hash !== ''
  ) {
    throw new Error('Supabase URL does not match the expected protected Supabase project');
  }
}

function databaseProjectRef(url: URL): string | null {
  const username = decodeURIComponent(url.username);
  if (username.startsWith('postgres.')) return username.slice('postgres.'.length);
  const direct = url.hostname.match(/^db\.([a-z0-9-]+)\.supabase\.co$/i);
  return direct?.[1] ?? null;
}

export function buildSharedBootstrapPlan(input: SharedBootstrapInput) {
  for (const [label, value] of [
    ['organizationId', input.organizationId],
    ['userId', input.userId],
    ['coupangAccountId', input.coupangAccountId],
  ] as const) {
    assertUuid(value, label);
  }
  requireText(input.organizationName, 'organizationName');
  requireText(input.organizationSlug, 'organizationSlug');
  requireText(input.userEmail, 'userEmail');
  requireText(input.userName, 'userName');
  requireText(input.coupangExternalAccountId, 'coupangExternalAccountId');
  requireText(input.coupangAccountName, 'coupangAccountName');

  const channelAccounts: Array<{
    id: string;
    organizationId: string;
    channel: 'coupang' | 'rocket';
    name: string;
    externalAccountId: string;
    status: 'active';
    isPrimary: true;
    config: null;
  }> = [{
    id: input.coupangAccountId,
    organizationId: input.organizationId,
    channel: 'coupang' as const,
    name: input.coupangAccountName,
    externalAccountId: input.coupangExternalAccountId,
    status: 'active' as const,
    isPrimary: true as const,
    config: null,
  }];

  const rocketValues = [
    input.rocketAccountId,
    input.rocketExternalAccountId,
    input.rocketAccountName,
  ];
  if (rocketValues.some(Boolean) && !rocketValues.every(Boolean)) {
    throw new Error('rocket account id, external id, and name must be supplied together');
  }
  if (input.rocketAccountId && input.rocketExternalAccountId && input.rocketAccountName) {
    assertUuid(input.rocketAccountId, 'rocketAccountId');
    channelAccounts.push({
      id: input.rocketAccountId,
      organizationId: input.organizationId,
      channel: 'rocket',
      name: input.rocketAccountName,
      externalAccountId: input.rocketExternalAccountId,
      status: 'active',
      isPrimary: true,
      config: null,
    });
  }

  return {
    organization: {
      id: input.organizationId,
      name: input.organizationName,
      slug: input.organizationSlug,
      isActive: true as const,
    },
    user: {
      id: input.userId,
      email: input.userEmail,
      name: input.userName,
      role: 'admin' as const,
      type: 'human' as const,
      isActive: true as const,
    },
    membership: {
      organizationId: input.organizationId,
      userId: input.userId,
      role: 'admin' as const,
      status: 'active' as const,
    },
    channelAccounts,
  };
}

export function buildCoupangReplayBundle(input: {
  target: RebuildTarget;
  originRunId: string;
  deployedSha: string;
  organizationId: string;
  channelAccountId: string;
  channelAccountExternalId: string;
  runs: ReplaySourceRun[];
  factCounts: ReplayFactCounts;
  factDigestSha256: string;
  createdAt?: string;
}): CoupangReplayBundle {
  assertPositiveIntegerText(input.originRunId, 'originRunId');
  assertUuid(input.organizationId, 'organizationId');
  assertUuid(input.channelAccountId, 'channelAccountId');
  if (!GIT_SHA_PATTERN.test(input.deployedSha)) throw new Error('deployedSha must be an immutable git SHA');
  if (!/^[0-9a-f]{64}$/.test(input.factDigestSha256)) {
    throw new Error('factDigestSha256 must be a SHA-256 digest');
  }

  const payloads = input.runs.map((run) => ({
    sourceRunId: run.id,
    body: buildReplayBody(run),
  }));

  const bundle: CoupangReplayBundle = {
    schemaVersion: SCHEMA_VERSION,
    target: input.target,
    originRunId: input.originRunId,
    deployedSha: input.deployedSha,
    organizationId: input.organizationId,
    channelAccountId: input.channelAccountId,
    channelAccountFingerprint: buildChannelAccountFingerprint({
      organizationId: input.organizationId,
      channelAccountId: input.channelAccountId,
      channelAccountExternalId: input.channelAccountExternalId,
    }),
    createdAt: input.createdAt ?? new Date().toISOString(),
    expectedReplayCounts: input.factCounts,
    expectedFactDigestSha256: input.factDigestSha256,
    payloadSha256: sha256(stableStringify(payloads)),
    payloads,
  };
  assertReplayBundle(bundle);
  return bundle;
}

export function assertReadyCounts(
  actual: RebuildReadyActual,
  expected: RebuildReadyExpected,
): void {
  if (actual.completedSellpiaImports < 1) {
    throw new Error('Sellpia authenticated import is missing');
  }
  if (actual.completedWingImports < 1) {
    throw new Error('Wing authenticated import is missing');
  }
  assertExactCount(actual.activeMasters, expected.activeMasters, 'active Sellpia Masters');
  assertExactCount(actual.listings, expected.listings, 'Wing listings');
  assertExactCount(actual.channelSkus, expected.channelSkus, 'channel SKUs');
}

function buildReplayBody(run: ReplaySourceRun): JsonRecord {
  const meta = asRecord(run.metaJson);
  const type = replayType(run);
  const rowKeys = replayRowKeys(type, run.source);
  const data = run.snapshots.map((snapshot) => pickAllowedRecord(snapshot.rawJson, rowKeys));
  const normalizedRows = run.snapshots.map((snapshot) =>
    snapshot.normalizedJson == null ? {} : pickAllowedRecord(snapshot.normalizedJson, rowKeys));
  const hasNormalizedRows = run.snapshots.some((snapshot) => snapshot.normalizedJson != null);
  const body: JsonRecord = {
    type,
    source: type === 'coupang_ads_daily' ? 'coupang_ads' : run.source,
    data,
  };

  if (hasNormalizedRows) body.normalizedRows = normalizedRows;
  const kpis = buildReplayKpis(type, run.source, meta.kpis);
  if (Object.keys(kpis).length > 0) body.kpis = kpis;
  const summary = pickAllowedRecord(meta.summary, TRAFFIC_SUMMARY_KEYS);
  if (Object.keys(summary).length > 0) body.summary = summary;
  const adSummary = pickAllowedRecord(meta.adSummary, AD_SUMMARY_KEYS);
  if (Object.keys(adSummary).length > 0) body.adSummary = adSummary;
  copyString(meta, body, 'campaignName');
  if (run.period) body.period = run.period;
  if (run.businessDate) body.timestamp = run.businessDate.toISOString();
  if (run.periodStart) body.dateFrom = dateOnly(run.periodStart);
  if (run.periodEnd) body.dateTo = dateOnly(run.periodEnd);
  if (run.targetUrl) body.url = safeReplayUrl(run.targetUrl);
  return body;
}

function replayType(run: ReplaySourceRun): string {
  if (run.source === 'coupang_ads' || run.pageType === 'dashboard_daily') {
    return 'coupang_ads_daily';
  }
  if (run.pageType === 'traffic') return 'traffic';
  if (run.pageType === 'campaign') return 'ad_campaign';
  return 'raw_scrape';
}

function copyString(source: JsonRecord, target: JsonRecord, key: string): void {
  if (typeof source[key] === 'string' && source[key]) target[key] = source[key];
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function pickAllowedRecord(value: unknown, allowedKeys: ReadonlySet<string>): JsonRecord {
  const record = asRecord(value);
  const picked: JsonRecord = {};
  for (const [key, entry] of Object.entries(record)) {
    if (!allowedKeys.has(key) || PRIVATE_REPLAY_KEY_PATTERN.test(key)) continue;
    if (containsPiiValue(entry)) continue;
    picked[key] = cloneReplayValue(entry);
  }
  return picked;
}

function cloneReplayValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneReplayValue);
  if (value && typeof value === 'object') {
    const cloned: JsonRecord = {};
    for (const [key, entry] of Object.entries(asRecord(value))) {
      if (PRIVATE_REPLAY_KEY_PATTERN.test(key) || containsPiiValue(entry)) continue;
      cloned[key] = cloneReplayValue(entry);
    }
    return cloned;
  }
  return value;
}

function replayRowKeys(type: string, source: string): ReadonlySet<string> {
  if (type === 'traffic') return TRAFFIC_ROW_KEYS;
  if (type === 'coupang_ads_daily') return ADS_DAILY_ROW_KEYS;
  if (type === 'ad_campaign' || source === 'advertising') return AD_ROW_KEYS;
  return WING_ITEM_ROW_KEYS;
}

function buildReplayKpis(type: string, source: string, value: unknown): JsonRecord {
  const record = asRecord(value);
  const allowed = type === 'traffic'
    ? TRAFFIC_KPI_KEYS
    : source === 'advertising' || type === 'ad_campaign' || type === 'coupang_ads_daily'
      ? ADS_KPI_KEYS
      : WING_KPI_KEYS;
  const result: JsonRecord = {};
  for (const [key, entry] of Object.entries(record)) {
    if (!allowed.has(key) || containsPiiValue(entry)) continue;
    if (type === 'traffic') {
      result[key] = pickAllowedRecord(entry, new Set(['value', 'numValue', 'change']));
    } else if (source === 'advertising' || type === 'ad_campaign' || type === 'coupang_ads_daily') {
      result[key] = typeof entry === 'object' && entry !== null
        ? pickAllowedRecord(entry, new Set(['value', 'unit']))
        : entry;
    } else if (typeof entry === 'string' || typeof entry === 'number') {
      result[key] = entry;
    }
  }
  return result;
}

export function assertReplayBundle(value: unknown): asserts value is CoupangReplayBundle {
  const bundle = asRecord(value);
  assertAllowedRecord(bundle, BUNDLE_KEYS, 'bundle');
  if (bundle.schemaVersion !== SCHEMA_VERSION) throw new Error('Unknown rebuild bundle schema version');
  if (bundle.target !== 'local' && bundle.target !== 'staging' && bundle.target !== 'production') {
    throw new Error('Unknown rebuild bundle target');
  }
  if (typeof bundle.originRunId !== 'string') throw new Error('Missing rebuild origin run ID');
  assertPositiveIntegerText(bundle.originRunId, 'originRunId');
  if (typeof bundle.deployedSha !== 'string' || !GIT_SHA_PATTERN.test(bundle.deployedSha)) {
    throw new Error('Invalid immutable deployed SHA');
  }
  if (typeof bundle.organizationId !== 'string') throw new Error('Missing organizationId');
  if (typeof bundle.channelAccountId !== 'string') throw new Error('Missing channelAccountId');
  assertUuid(bundle.organizationId, 'organizationId');
  assertUuid(bundle.channelAccountId, 'channelAccountId');
  if (typeof bundle.channelAccountFingerprint !== 'string' || !/^[0-9a-f]{64}$/.test(bundle.channelAccountFingerprint)) {
    throw new Error('Invalid ChannelAccount fingerprint');
  }
  if (!Array.isArray(bundle.payloads)) throw new Error('Rebuild payloads must be an array');
  assertReplayFactCounts(bundle.expectedReplayCounts);
  for (const payloadValue of bundle.payloads) {
    const payload = asRecord(payloadValue);
    assertAllowedRecord(payload, PAYLOAD_KEYS, 'payload');
    if (typeof payload.sourceRunId !== 'string' || !payload.sourceRunId) {
      throw new Error('Replay sourceRunId is required');
    }
    assertUuid(payload.sourceRunId, 'sourceRunId');
    const body = asRecord(payload.body);
    for (const key of Object.keys(body)) {
      if (!BODY_KEYS.has(key)) throw new Error(`Unknown replay payload key: ${key}`);
    }
    const type = typeof body.type === 'string' ? body.type : '';
    const source = typeof body.source === 'string' ? body.source : '';
    if (!['raw_scrape', 'traffic', 'ad_campaign', 'coupang_ads_daily'].includes(type)) {
      throw new Error(`Unknown replay payload type: ${type || '<missing>'}`);
    }
    if (!['wing', 'advertising', 'coupang_ads'].includes(source)) {
      throw new Error(`Unknown replay payload source: ${source || '<missing>'}`);
    }
    assertOptionalScalar(body.campaignName, ['string'], 'body.campaignName');
    assertOptionalScalar(body.period, ['string', 'number'], 'body.period');
    for (const key of ['timestamp', 'dateFrom', 'dateTo', 'url'] as const) {
      assertOptionalScalar(body[key], ['string'], `body.${key}`);
    }
    const rowKeys = replayRowKeys(type, source);
    assertAllowedRows(body.data, rowKeys, 'data');
    if (body.normalizedRows !== undefined) {
      assertAllowedRows(body.normalizedRows, rowKeys, 'normalizedRows');
    }
    if (body.summary !== undefined) assertAllowedScalarRecord(body.summary, TRAFFIC_SUMMARY_KEYS, 'summary');
    if (body.adSummary !== undefined) assertAllowedScalarRecord(body.adSummary, AD_SUMMARY_KEYS, 'adSummary');
    if (body.kpis !== undefined) assertReplayKpis(body.kpis, type, source);
    assertNoPii(body, 'body');
  }
  if (typeof bundle.expectedFactDigestSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(bundle.expectedFactDigestSha256)) {
    throw new Error('Invalid replay fact digest');
  }
  if (typeof bundle.payloadSha256 !== 'string') throw new Error('Missing replay payload hash');
  const actualHash = sha256(stableStringify(bundle.payloads));
  if (bundle.payloadSha256 !== actualHash) throw new Error('Replay payload hash mismatch');
}

function assertReplayFactCounts(value: unknown): void {
  const counts = asRecord(value);
  const expectedKeys = new Set<keyof ReplayFactCounts>([
    'scrapeRuns',
    'rawSnapshots',
    'listingDailyFacts',
    'optionDailyFacts',
    'adTargetFacts',
    'accountKpiFacts',
  ]);
  assertAllowedRecord(counts, expectedKeys, 'expectedReplayCounts');
  for (const key of expectedKeys) {
    const count = counts[key];
    if (!Number.isSafeInteger(count) || (count as number) < 0) {
      throw new Error(`Replay expectedReplayCounts.${key} must be a non-negative integer`);
    }
  }
}

function assertAllowedRecord(
  value: unknown,
  allowed: ReadonlySet<string>,
  label: string,
): void {
  const record = assertPlainRecord(value, label);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) throw new Error(`Unknown replay ${label} key: ${key}`);
  }
}

function assertAllowedScalarRecord(
  value: unknown,
  allowed: ReadonlySet<string>,
  label: string,
): void {
  assertAllowedRecord(value, allowed, label);
  for (const [key, entry] of Object.entries(asRecord(value))) {
    assertReplayScalar(entry, ['string', 'number'], `Replay ${label}.${key}`);
  }
}

function assertReplayKpis(value: unknown, type: string, source: string): void {
  const record = assertPlainRecord(value, 'kpis');
  const isTraffic = type === 'traffic';
  const isAds = source === 'advertising' || type === 'ad_campaign' || type === 'coupang_ads_daily';
  const allowed = isTraffic ? TRAFFIC_KPI_KEYS : isAds ? ADS_KPI_KEYS : WING_KPI_KEYS;
  assertAllowedRecord(record, allowed, 'kpis');
  for (const [key, entry] of Object.entries(record)) {
    if (isTraffic) {
      assertAllowedScalarRecord(entry, new Set(['value', 'numValue', 'change']), `kpis.${key}`);
    } else if (isAds && entry !== null && typeof entry === 'object') {
      assertAllowedScalarRecord(entry, new Set(['value', 'unit']), `kpis.${key}`);
    } else {
      assertReplayScalar(entry, ['string', 'number'], `Replay kpis.${key}`);
    }
  }
}

function assertAllowedRows(value: unknown, allowed: ReadonlySet<string>, label: string): void {
  if (!Array.isArray(value)) throw new Error(`Replay ${label} must be an array`);
  for (const [index, rowValue] of value.entries()) {
    const row = assertPlainRecord(rowValue, `${label}[${index}]`);
    for (const [key, entry] of Object.entries(row)) {
      if (!allowed.has(key)) throw new Error(`Unknown replay ${label} key: ${key}`);
      assertReplayScalar(
        entry,
        BOOLEAN_ROW_KEYS.has(key)
          ? ['boolean']
          : NUMBERISH_ROW_KEYS.has(key)
            ? ['string', 'number']
            : ['string'],
        `Replay ${label}[${index}].${key}`,
      );
    }
  }
}

type ReplayScalarType = 'string' | 'number' | 'boolean';

function assertOptionalScalar(
  value: unknown,
  allowed: readonly ReplayScalarType[],
  label: string,
): void {
  if (value === undefined) return;
  assertReplayScalar(value, allowed, `Replay ${label}`);
}

function assertReplayScalar(
  value: unknown,
  allowed: readonly ReplayScalarType[],
  label: string,
): void {
  if (value === null) return;
  if (!allowed.includes(typeof value as ReplayScalarType)) {
    throw new Error(`${label} must be a ${allowed.join(' or ')} scalar`);
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number scalar`);
  }
}

function assertPlainRecord(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Replay ${label} must be an object with no unknown keys`);
  }
  return value as JsonRecord;
}

function assertNoPii(value: unknown, path: string): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoPii(entry, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(asRecord(value))) {
      if (PRIVATE_REPLAY_KEY_PATTERN.test(key)) throw new Error(`PII-like replay key at ${path}.${key}`);
      assertNoPii(entry, `${path}.${key}`);
    }
    return;
  }
  if (containsPiiValue(value)) throw new Error(`PII-like replay value at ${path}`);
}

function containsPiiValue(value: unknown): boolean {
  if (typeof value === 'string') {
    return EMAIL_VALUE_PATTERN.test(value) ||
      PHONE_VALUE_PATTERN.test(value) ||
      INTERNATIONAL_PHONE_VALUE_PATTERN.test(value) ||
      KOREAN_ADDRESS_VALUE_PATTERN.test(value) ||
      ENGLISH_ADDRESS_VALUE_PATTERN.test(value);
  }
  if (Array.isArray(value)) return value.some(containsPiiValue);
  if (value && typeof value === 'object') {
    return Object.entries(asRecord(value)).some(
      ([key, entry]) => PRIVATE_REPLAY_KEY_PATTERN.test(key) || containsPiiValue(entry),
    );
  }
  return false;
}

function buildChannelAccountFingerprint(input: {
  organizationId: string;
  channelAccountId: string;
  channelAccountExternalId: string;
}): string {
  return sha256(stableStringify({
    organizationId: input.organizationId,
    channelAccountId: input.channelAccountId,
    channel: 'coupang',
    externalAccountId: input.channelAccountExternalId,
  }));
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(asRecord(value))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function computeReplayFactDigest(facts: {
  listingDailyFacts: unknown[];
  optionDailyFacts: unknown[];
  adTargetFacts: unknown[];
  accountKpiFacts: unknown[];
}): string {
  return sha256(stableStringify(normalizeDigestValue(facts)));
}

function normalizeDigestValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalizeDigestValue);
  if (value && typeof value === 'object') {
    const jsonValue = (value as { toJSON?: () => unknown }).toJSON;
    if (typeof jsonValue === 'function') return normalizeDigestValue(jsonValue.call(value));
    const normalized: JsonRecord = {};
    for (const [key, entry] of Object.entries(asRecord(value))) {
      normalized[key] = normalizeDigestValue(entry);
    }
    return normalized;
  }
  return value;
}

function safeReplayUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  if (url.protocol !== 'https:') throw new Error('replay target URL must use https');
  return `${url.origin}${url.pathname}`;
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function assertExactCount(actual: number, expected: number, label: string): void {
  if (!Number.isSafeInteger(expected) || expected < 1) {
    throw new Error(`Configured expected ${label} count must be a positive integer`);
  }
  if (actual !== expected) {
    throw new Error(`Expected ${expected} ${label}, found ${actual}`);
  }
}

function assertUuid(value: string, label: string): void {
  if (!UUID_PATTERN.test(value)) throw new Error(`${label} must be a UUID`);
}

function requireText(value: string, label: string): string {
  if (!value?.trim()) throw new Error(`${label} is required`);
  return value.trim();
}

function assertPositiveIntegerText(value: string, label: string): void {
  if (!/^[1-9][0-9]*$/.test(value)) throw new Error(`${label} must be a positive integer`);
}

function parseCli(argv: string[]): ParsedCli {
  const command = argv[0] ?? '';
  if (!COMMANDS.has(command)) {
    throw new Error(`command must be one of: ${[...COMMANDS].join(', ')}`);
  }
  const values = new Map<string, string>();
  for (let index = 1; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith('--') || value === undefined) {
      throw new Error(`invalid CLI argument near ${flag ?? '<end>'}`);
    }
    values.set(flag.slice(2), value);
  }
  return { command, values };
}

function cliValue(cli: ParsedCli, name: string, envName?: string): string {
  return requireText(
    cli.values.get(name) ?? (envName ? process.env[envName] : undefined) ?? '',
    `--${name}`,
  );
}

function optionalCliValue(cli: ParsedCli, name: string, envName?: string): string | undefined {
  const value = cli.values.get(name) ?? (envName ? process.env[envName] : undefined);
  return value?.trim() || undefined;
}

function guardFromCli(cli: ParsedCli): RebuildTarget {
  const target = cliValue(cli, 'target', 'REBUILD_TARGET');
  if (target === 'local') {
    return assertLocalRebuildGuard({
      databaseUrl: cliValue(cli, 'database-url', 'DATABASE_URL'),
      confirmation: cliValue(cli, 'confirmation', 'DESTRUCTIVE_RESET'),
      expectedConfirmation: cliValue(
        cli,
        'expected-confirmation',
        'EXPECTED_RESET_CONFIRMATION',
      ),
    });
  }
  return assertSharedRebuildGuard({
    target,
    deploymentTarget: cliValue(cli, 'deployment-target', 'DEPLOYMENT_TARGET'),
    githubEnvironment: cliValue(cli, 'github-environment', 'GITHUB_ENVIRONMENT'),
    confirmation: cliValue(cli, 'confirmation', 'DESTRUCTIVE_RESET'),
    expectedConfirmation: cliValue(
      cli,
      'expected-confirmation',
      'EXPECTED_RESET_CONFIRMATION',
    ),
    githubActions: process.env.GITHUB_ACTIONS ?? '',
  });
}

async function createPrisma(): Promise<PrismaClient> {
  const databaseUrl = requireText(process.env.DATABASE_URL ?? '', 'DATABASE_URL');
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });
  await prisma.$connect();
  return prisma;
}

async function exportCoupang(cli: ParsedCli, target: RebuildTarget): Promise<void> {
  const organizationId = cliValue(cli, 'organization-id', 'REBUILD_ORGANIZATION_ID');
  const originRunId = cliValue(cli, 'origin-run-id', 'GITHUB_RUN_ID');
  const deployedSha = cliValue(cli, 'deployed-sha', 'REBUILD_DEPLOYED_SHA');
  const channelAccountId = cliValue(
    cli,
    'coupang-account-id',
    'REBUILD_COUPANG_ACCOUNT_ID',
  );
  const channelAccountExternalId = cliValue(
    cli,
    'coupang-account-external-id',
    'REBUILD_COUPANG_EXTERNAL_ACCOUNT_ID',
  );
  const output = resolve(cliValue(cli, 'output', 'REBUILD_BUNDLE_PATH'));
  assertUuid(organizationId, 'organizationId');
  assertPositiveIntegerText(originRunId, 'originRunId');

  const prisma = await createPrisma();
  try {
    const scope = buildCoupangReplayScope(organizationId, channelAccountId);
    const runs = await prisma.channelScrapeRun.findMany({
      where: {
        ...scope.scrapeRun,
        status: 'complete',
      },
      orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        source: true,
        pageType: true,
        businessDate: true,
        periodStart: true,
        periodEnd: true,
        period: true,
        targetUrl: true,
        metaJson: true,
        snapshots: {
          orderBy: [{ observedAt: 'asc' }, { id: 'asc' }],
          select: { rawJson: true, normalizedJson: true },
        },
      },
    });
    const [factCounts, factDigestSha256] = await Promise.all([
      readReplayFactCounts(prisma, organizationId, channelAccountId),
      readReplayFactDigest(prisma, organizationId, channelAccountId),
    ]);
    if (runs.length !== factCounts.scrapeRuns) {
      throw new Error(
        `Refusing partial Coupang export: ${runs.length} complete runs of ${factCounts.scrapeRuns} total runs`,
      );
    }
    const snapshotCount = runs.reduce((total, run) => total + run.snapshots.length, 0);
    if (snapshotCount !== factCounts.rawSnapshots) {
      throw new Error(
        `Refusing partial Coupang export: selected ${snapshotCount} of ${factCounts.rawSnapshots} snapshots`,
      );
    }

    const bundle = buildCoupangReplayBundle({
      target,
      originRunId,
      deployedSha,
      organizationId,
      channelAccountId,
      channelAccountExternalId,
      runs,
      factCounts,
      factDigestSha256,
    });
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, `${JSON.stringify(bundle, null, 2)}\n`, { mode: 0o600 });
    await chmod(output, 0o600);
    console.log(JSON.stringify({
      output,
      payloads: bundle.payloads.length,
      expectedReplayCounts: bundle.expectedReplayCounts,
    }));
  } finally {
    await prisma.$disconnect();
  }
}

async function bootstrap(cli: ParsedCli, target: RebuildTarget): Promise<void> {
  const originRunId = cliValue(cli, 'origin-run-id', 'GITHUB_RUN_ID');
  const deployedSha = cliValue(cli, 'deployed-sha', 'REBUILD_DEPLOYED_SHA');
  assertPositiveIntegerText(originRunId, 'originRunId');
  if (!GIT_SHA_PATTERN.test(deployedSha)) throw new Error('deployedSha must be an immutable git SHA');
  const plan = buildSharedBootstrapPlan({
    organizationId: cliValue(cli, 'organization-id', 'REBUILD_ORGANIZATION_ID'),
    organizationName: cliValue(cli, 'organization-name', 'REBUILD_ORGANIZATION_NAME'),
    organizationSlug: cliValue(cli, 'organization-slug', 'REBUILD_ORGANIZATION_SLUG'),
    userId: cliValue(cli, 'user-id', 'REBUILD_USER_ID'),
    userEmail: cliValue(cli, 'user-email', 'REBUILD_USER_EMAIL'),
    userName: cliValue(cli, 'user-name', 'REBUILD_USER_NAME'),
    coupangAccountId: cliValue(cli, 'coupang-account-id', 'REBUILD_COUPANG_ACCOUNT_ID'),
    coupangExternalAccountId: cliValue(
      cli,
      'coupang-external-account-id',
      'REBUILD_COUPANG_EXTERNAL_ACCOUNT_ID',
    ),
    coupangAccountName: cliValue(
      cli,
      'coupang-account-name',
      'REBUILD_COUPANG_ACCOUNT_NAME',
    ),
    rocketAccountId: optionalCliValue(cli, 'rocket-account-id', 'REBUILD_ROCKET_ACCOUNT_ID'),
    rocketExternalAccountId: optionalCliValue(
      cli,
      'rocket-external-account-id',
      'REBUILD_ROCKET_EXTERNAL_ACCOUNT_ID',
    ),
    rocketAccountName: optionalCliValue(
      cli,
      'rocket-account-name',
      'REBUILD_ROCKET_ACCOUNT_NAME',
    ),
  });

  const prisma = await createPrisma();
  try {
    await prisma.$transaction(async (tx) => {
      await tx.organization.upsert({
        where: { id: plan.organization.id },
        update: plan.organization,
        create: plan.organization,
      });
      await tx.user.upsert({
        where: { id: plan.user.id },
        update: plan.user,
        create: plan.user,
      });
      await tx.organizationMembership.upsert({
        where: {
          organizationId_userId: {
            organizationId: plan.membership.organizationId,
            userId: plan.membership.userId,
          },
        },
        update: { ...plan.membership, lastSelectedAt: new Date() },
        create: { ...plan.membership, lastSelectedAt: new Date() },
      });
      for (const account of plan.channelAccounts) {
        await tx.channelAccount.upsert({
          where: { id: account.id },
          update: account,
          create: account,
        });
      }
      const coupangAccount = plan.channelAccounts.find((account) => account.channel === 'coupang');
      if (!coupangAccount) throw new Error('Coupang baseline account is required');
      const channelAccountFingerprint = buildChannelAccountFingerprint({
        organizationId: plan.organization.id,
        channelAccountId: coupangAccount.id,
        channelAccountExternalId: coupangAccount.externalAccountId,
      });
      await tx.systemSetting.upsert({
        where: {
          organizationId_key: {
            organizationId: plan.organization.id,
            key: REBUILD_STATUS_KEY,
          },
        },
        update: {
          value: {
            state: 'snapshot_required',
            target,
            originRunId,
            deployedSha,
            channelAccountFingerprint,
            updatedAt: new Date().toISOString(),
          },
        },
        create: {
          organizationId: plan.organization.id,
          key: REBUILD_STATUS_KEY,
          value: {
            state: 'snapshot_required',
            target,
            originRunId,
            deployedSha,
            channelAccountFingerprint,
            updatedAt: new Date().toISOString(),
          },
        },
      });
    });
    console.log(JSON.stringify({
      state: 'snapshot_required',
      target,
      originRunId,
      deployedSha,
      organizationId: plan.organization.id,
      channelAccounts: plan.channelAccounts.length,
    }));
  } finally {
    await prisma.$disconnect();
  }
}

async function readBundle(cli: ParsedCli, target: RebuildTarget): Promise<CoupangReplayBundle> {
  const bundlePath = resolve(cliValue(cli, 'bundle', 'REBUILD_BUNDLE_PATH'));
  const bundle: unknown = JSON.parse(await readFile(bundlePath, 'utf8'));
  assertReplayBundle(bundle);
  const originRunId = cliValue(cli, 'origin-run-id', 'REBUILD_ORIGIN_RUN_ID');
  const organizationId = cliValue(cli, 'organization-id', 'REBUILD_ORGANIZATION_ID');
  const deployedSha = cliValue(cli, 'deployed-sha', 'REBUILD_DEPLOYED_SHA');
  const channelAccountId = cliValue(cli, 'coupang-account-id', 'REBUILD_COUPANG_ACCOUNT_ID');
  if (
    bundle.target !== target ||
    bundle.originRunId !== originRunId ||
    bundle.organizationId !== organizationId ||
    bundle.deployedSha !== deployedSha ||
    bundle.channelAccountId !== channelAccountId
  ) {
    throw new Error('Rebuild bundle does not match the requested target, origin run, SHA, organization, or account');
  }
  return bundle;
}

async function replayCoupang(cli: ParsedCli, target: RebuildTarget): Promise<void> {
  const bundle = await readBundle(cli, target);
  const channelAccountId = cliValue(
    cli,
    'coupang-account-id',
    'REBUILD_COUPANG_ACCOUNT_ID',
  );
  assertUuid(channelAccountId, 'coupangAccountId');
  const apiUrl = cliValue(cli, 'api-url', 'REBUILD_API_URL').replace(/\/$/, '');
  const expectedApiOrigin = cliValue(cli, 'expected-api-origin', 'REBUILD_EXPECTED_API_ORIGIN');
  assertProtectedApiDestination(apiUrl, expectedApiOrigin);
  const prisma = await createPrisma();
  try {
    await assertCurrentRebuildBinding(prisma, bundle, target);
    const accessToken = await generateOperatorAccessToken(cli);
    const checkpointKey = `${REBUILD_STATUS_KEY}.replay.${bundle.originRunId}`;
    const checkpoint = await prisma.systemSetting.findUnique({
      where: {
        organizationId_key: {
          organizationId: bundle.organizationId,
          key: checkpointKey,
        },
      },
      select: { value: true },
    });
    const completed = new Set(
      Array.isArray(asRecord(checkpoint?.value).completedSourceRunIds)
        ? asRecord(checkpoint?.value).completedSourceRunIds as string[]
        : [],
    );

    for (const payload of bundle.payloads) {
      if (completed.has(payload.sourceRunId)) continue;
      const response = await fetch(`${apiUrl}/api/ads/extension/sync`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          ...payload.body,
          channelAccountId,
          idempotencyKey: `authoritative-rebuild:${bundle.originRunId}:${payload.sourceRunId}`,
        }),
      });
      const responseBody = await response.text();
      if (!response.ok) {
        throw new Error(
          `Coupang replay failed for ${payload.sourceRunId}: HTTP ${response.status} ${responseBody.slice(0, 500)}`,
        );
      }
      completed.add(payload.sourceRunId);
      await prisma.systemSetting.upsert({
        where: {
          organizationId_key: {
            organizationId: bundle.organizationId,
            key: checkpointKey,
          },
        },
        update: {
          value: {
            target,
            originRunId: bundle.originRunId,
            completedSourceRunIds: [...completed],
          },
        },
        create: {
          organizationId: bundle.organizationId,
          key: checkpointKey,
          value: {
            target,
            originRunId: bundle.originRunId,
            completedSourceRunIds: [...completed],
          },
        },
      });
    }

    const [actual, factDigestSha256] = await Promise.all([
      readReplayFactCounts(prisma, bundle.organizationId, bundle.channelAccountId),
      readReplayFactDigest(prisma, bundle.organizationId, bundle.channelAccountId),
    ]);
    assertReplayCounts(actual, bundle.expectedReplayCounts);
    assertReplayFactDigest(factDigestSha256, bundle.expectedFactDigestSha256);
    await assertCurrentRebuildBinding(prisma, bundle, target);
    console.log(JSON.stringify({
      target,
      originRunId: bundle.originRunId,
      replayedPayloads: completed.size,
      counts: actual,
      factDigestSha256,
    }));
  } finally {
    await prisma.$disconnect();
  }
}

async function assertCurrentRebuildBinding(
  prisma: Pick<PrismaClient, 'systemSetting'>,
  bundle: CoupangReplayBundle,
  target: RebuildTarget,
): Promise<{ id: string; updatedAt: Date }> {
  const setting = await prisma.systemSetting.findUnique({
    where: {
      organizationId_key: {
        organizationId: bundle.organizationId,
        key: REBUILD_STATUS_KEY,
      },
    },
    select: { id: true, value: true, updatedAt: true },
  });
  const status = asRecord(setting?.value);
  if (
    !setting ||
    status.state !== 'snapshot_required' ||
    status.target !== target ||
    status.originRunId !== bundle.originRunId ||
    status.deployedSha !== bundle.deployedSha ||
    status.channelAccountFingerprint !== bundle.channelAccountFingerprint
  ) {
    throw new Error(
      'Current database is not the snapshot_required rebuild bound to this target, origin run, SHA, and account',
    );
  }
  return { id: setting.id, updatedAt: setting.updatedAt };
}

async function verifyReady(cli: ParsedCli, target: RebuildTarget): Promise<void> {
  const bundle = await readBundle(cli, target);
  const channelAccountId = cliValue(
    cli,
    'coupang-account-id',
    'REBUILD_COUPANG_ACCOUNT_ID',
  );
  const expected: RebuildReadyExpected = {
    activeMasters: positiveInteger(cliValue(cli, 'expected-active-masters', 'REBUILD_EXPECTED_ACTIVE_MASTERS')),
    listings: positiveInteger(cliValue(cli, 'expected-listings', 'REBUILD_EXPECTED_LISTINGS')),
    channelSkus: positiveInteger(cliValue(cli, 'expected-channel-skus', 'REBUILD_EXPECTED_CHANNEL_SKUS')),
  };

  const prisma = await createPrisma();
  try {
    const result = await prisma.$transaction(async (tx) => {
      const boundSetting = await assertCurrentRebuildBinding(tx, bundle, target);
      const [sellpiaRun, wingRun, actual, replayCounts, replayFactDigest] = await Promise.all([
        tx.sourceImportRun.findFirst({
          where: {
            organizationId: bundle.organizationId,
            sourceType: 'sellpia_inventory',
            status: 'completed',
          },
          orderBy: [{ importedAt: 'desc' }, { createdAt: 'desc' }],
          select: { importedAt: true, createdAt: true },
        }),
        tx.sourceImportRun.findFirst({
          where: {
            organizationId: bundle.organizationId,
            channelAccountId,
            sourceType: 'coupang_wing_catalog',
            status: 'completed',
          },
          orderBy: [{ importedAt: 'desc' }, { createdAt: 'desc' }],
          select: { importedAt: true, createdAt: true },
        }),
        readReadyCounts(tx, bundle.organizationId, channelAccountId),
        readReplayFactCounts(tx, bundle.organizationId, channelAccountId),
        readReplayFactDigest(tx, bundle.organizationId, channelAccountId),
      ]);
      assertReadyCounts(actual, expected);
      const sellpiaAt = sellpiaRun?.importedAt ?? sellpiaRun?.createdAt;
      const wingAt = wingRun?.importedAt ?? wingRun?.createdAt;
      if (!sellpiaAt || !wingAt || wingAt < sellpiaAt) {
        throw new Error('Sellpia must complete before the Wing catalog import');
      }
      assertReplayCounts(replayCounts, bundle.expectedReplayCounts);
      assertReplayFactDigest(replayFactDigest, bundle.expectedFactDigestSha256);

      const transition = await tx.systemSetting.updateMany({
        where: { id: boundSetting.id, updatedAt: boundSetting.updatedAt },
        data: {
          value: {
            state: 'ready',
            target,
            originRunId: bundle.originRunId,
            deployedSha: bundle.deployedSha,
            channelAccountFingerprint: bundle.channelAccountFingerprint,
            imports: actual,
            replay: replayCounts,
            replayFactDigest,
            readyAt: new Date().toISOString(),
          },
        },
      });
      if (transition.count !== 1) {
        throw new Error('Rebuild status changed concurrently; refusing ready transition');
      }
      return { actual, replayCounts, replayFactDigest };
    }, { isolationLevel: 'Serializable' });
    console.log(JSON.stringify({
      state: 'ready',
      target,
      originRunId: bundle.originRunId,
      imports: result.actual,
      replay: result.replayCounts,
      replayFactDigest: result.replayFactDigest,
    }));
  } finally {
    await prisma.$disconnect();
  }
}

async function generateOperatorAccessToken(cli: ParsedCli): Promise<string> {
  const supabaseUrl = cliValue(cli, 'supabase-url', 'SUPABASE_URL');
  const expectedProjectRef = cliValue(
    cli,
    'expected-supabase-project-ref',
    'REBUILD_EXPECTED_SUPABASE_PROJECT_REF',
  );
  assertProtectedSupabaseDestination(supabaseUrl, expectedProjectRef);
  const supabaseSecretKey = cliValue(cli, 'supabase-secret-key', 'SUPABASE_SECRET_KEY');
  const userEmail = cliValue(cli, 'user-email', 'REBUILD_USER_EMAIL');
  const userId = cliValue(cli, 'user-id', 'REBUILD_USER_ID');
  assertUuid(userId, 'userId');
  const supabase = createClient(supabaseUrl, supabaseSecretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: userEmail,
  });
  if (linkError) throw linkError;
  const emailOtp = linkData.properties?.email_otp;
  if (!emailOtp) throw new Error('Supabase did not return an operator email OTP');
  const { data: sessionData, error: verifyError } = await supabase.auth.verifyOtp({
    email: userEmail,
    token: emailOtp,
    type: 'email',
  });
  if (verifyError) throw verifyError;
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error('Supabase did not return an operator access token');
  const subject = decodeJwtSubject(accessToken);
  if (subject !== userId) {
    throw new Error('Supabase operator identity does not match the rebuild baseline user');
  }
  return accessToken;
}

function decodeJwtSubject(token: string): string {
  const encoded = token.split('.')[1];
  if (!encoded) throw new Error('Supabase access token is malformed');
  const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as { sub?: unknown };
  return typeof payload.sub === 'string' ? payload.sub : '';
}

function buildCoupangReplayScope(organizationId: string, channelAccountId: string) {
  assertUuid(organizationId, 'organizationId');
  assertUuid(channelAccountId, 'channelAccountId');
  const base = { organizationId, channel: 'coupang' } as const;

  return {
    scrapeRun: {
      ...base,
      channelAccountId,
    } satisfies Prisma.ChannelScrapeRunWhereInput,
    rawSnapshot: {
      ...base,
      scrapeRun: { is: { channelAccountId } },
    } satisfies Prisma.ChannelScrapeSnapshotWhereInput,
    listingDailyFact: {
      ...base,
      listing: { is: { channelAccountId } },
    } satisfies Prisma.ChannelListingDailySnapshotWhereInput,
    optionDailyFact: {
      ...base,
      listing: { is: { channelAccountId } },
    } satisfies Prisma.ChannelListingOptionDailySnapshotWhereInput,
    adTargetFact: {
      ...base,
      OR: [
        {
          rawSnapshot: {
            is: { scrapeRun: { is: { channelAccountId } } },
          },
        },
        {
          rawSnapshotId: null,
          listing: { is: { channelAccountId } },
        },
      ],
    } satisfies Prisma.ChannelAdTargetDailySnapshotWhereInput,
    accountKpiFact: {
      ...base,
      channelAccountId,
    } satisfies Prisma.ChannelAccountDailyKpiSnapshotWhereInput,
  };
}

export async function readReplayFactCounts(
  prisma: RebuildPrisma,
  organizationId: string,
  channelAccountId: string,
): Promise<ReplayFactCounts> {
  const scope = buildCoupangReplayScope(organizationId, channelAccountId);
  const [scrapeRuns, rawSnapshots, listingDailyFacts, optionDailyFacts, adTargetFacts, accountKpiFacts] =
    await Promise.all([
      prisma.channelScrapeRun.count({ where: scope.scrapeRun }),
      prisma.channelScrapeSnapshot.count({ where: scope.rawSnapshot }),
      prisma.channelListingDailySnapshot.count({ where: scope.listingDailyFact }),
      prisma.channelListingOptionDailySnapshot.count({ where: scope.optionDailyFact }),
      prisma.channelAdTargetDailySnapshot.count({ where: scope.adTargetFact }),
      prisma.channelAccountDailyKpiSnapshot.count({ where: scope.accountKpiFact }),
    ]);
  return {
    scrapeRuns,
    rawSnapshots,
    listingDailyFacts,
    optionDailyFacts,
    adTargetFacts,
    accountKpiFacts,
  };
}

export async function readReplayFactDigest(
  prisma: RebuildPrisma,
  organizationId: string,
  channelAccountId: string,
): Promise<string> {
  const scope = buildCoupangReplayScope(organizationId, channelAccountId);
  const [listingDailyFacts, optionDailyFacts, adTargetFacts, rawAccountKpiFacts] =
    await Promise.all([
      prisma.channelListingDailySnapshot.findMany({
        where: scope.listingDailyFact,
        orderBy: [{ externalId: 'asc' }, { businessDate: 'asc' }],
        select: {
          externalId: true,
          businessDate: true,
          productName: true,
          status: true,
          exposureStatus: true,
          saleStatus: true,
          channelPrice: true,
          reviewCount: true,
          isOfferWinner: true,
          myPrice: true,
          winnerPrice: true,
          winnerGapPrice: true,
          productRank: true,
          categoryRank: true,
          adSpend: true,
          adRevenue: true,
          adImpressions: true,
          adClicks: true,
          adConversions: true,
          adOrders: true,
          adDirectOrders1d: true,
          adIndirectOrders1d: true,
          adDirectQty1d: true,
          adIndirectQty1d: true,
          adDirectRevenue1d: true,
          adIndirectRevenue1d: true,
          adTotalOrders14d: true,
          adDirectOrders14d: true,
          adIndirectOrders14d: true,
          adTotalQty14d: true,
          adDirectQty14d: true,
          adIndirectQty14d: true,
          adTotalRevenue14d: true,
          adDirectRevenue14d: true,
          adIndirectRevenue14d: true,
          trafficVisitors: true,
          trafficViews: true,
          trafficCartAdds: true,
          trafficOrders: true,
          trafficSalesQty: true,
          trafficRevenue: true,
        },
      }),
      prisma.channelListingOptionDailySnapshot.findMany({
        where: scope.optionDailyFact,
        orderBy: [{ externalId: 'asc' }, { externalOptionId: 'asc' }, { businessDate: 'asc' }],
        select: {
          externalId: true,
          externalOptionId: true,
          businessDate: true,
          optionName: true,
          salePrice: true,
          stockQty: true,
          saleStatus: true,
          isActive: true,
          isOfferWinner: true,
          myPrice: true,
          winnerPrice: true,
          winnerGapPrice: true,
        },
      }),
      prisma.channelAdTargetDailySnapshot.findMany({
        where: scope.adTargetFact,
        orderBy: [{ businessDate: 'asc' }, { targetType: 'asc' }, { targetKey: 'asc' }],
        select: {
          businessDate: true,
          externalId: true,
          externalOptionId: true,
          targetType: true,
          targetKey: true,
          campaignId: true,
          campaignName: true,
          adGroup: true,
          keyword: true,
          placement: true,
          status: true,
          onOff: true,
          currentBid: true,
          dailyBudget: true,
          spend: true,
          revenue: true,
          impressions: true,
          clicks: true,
          conversions: true,
          orders: true,
          adSpend: true,
          adRevenue: true,
        },
      }),
      prisma.channelAccountDailyKpiSnapshot.findMany({
        where: scope.accountKpiFact,
        orderBy: [{ source: 'asc' }, { kpiType: 'asc' }, { businessDate: 'asc' }],
        select: {
          source: true,
          kpiType: true,
          businessDate: true,
          periodStart: true,
          periodEnd: true,
          normalizedJson: true,
        },
      }),
    ]);
  const accountKpiFacts = rawAccountKpiFacts.map((row) => ({
    source: row.source,
    kpiType: row.kpiType,
    businessDate: row.businessDate,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    normalized: digestAccountKpis(row.source, row.kpiType, row.normalizedJson),
  }));
  return computeReplayFactDigest({
    listingDailyFacts,
    optionDailyFacts,
    adTargetFacts,
    accountKpiFacts,
  });
}

function digestAccountKpis(source: string, kpiType: string, value: unknown): JsonRecord {
  const normalized = asRecord(value);
  const digest: JsonRecord = {};
  const summary = pickAllowedRecord(normalized.summary, TRAFFIC_SUMMARY_KEYS);
  const adSummary = pickAllowedRecord(normalized.adSummary, AD_SUMMARY_KEYS);
  const type = kpiType.includes('traffic')
    ? 'traffic'
    : source === 'advertising' || source === 'coupang_ads'
      ? 'coupang_ads_daily'
      : 'raw_scrape';
  const kpis = buildReplayKpis(type, source, normalized.kpis);
  const dailyAds = kpiType === 'coupang_ads_daily'
    ? pickAllowedRecord(normalized, ACCOUNT_AD_DAILY_DIGEST_KEYS)
    : {};
  if (Object.keys(summary).length > 0) digest.summary = summary;
  if (Object.keys(adSummary).length > 0) digest.adSummary = adSummary;
  if (Object.keys(kpis).length > 0) digest.kpis = kpis;
  if (Object.keys(dailyAds).length > 0) digest.dailyAds = dailyAds;
  for (const key of ['startDate', 'endDate', 'dateFrom', 'dateTo', 'period']) {
    copyString(normalized, digest, key);
  }
  return digest;
}

async function readReadyCounts(
  prisma: RebuildPrisma,
  organizationId: string,
  channelAccountId: string,
): Promise<RebuildReadyActual> {
  const [completedSellpiaImports, completedWingImports, activeMasters, listings, channelSkus] =
    await Promise.all([
      prisma.sourceImportRun.count({
        where: { organizationId, sourceType: 'sellpia_inventory', status: 'completed' },
      }),
      prisma.sourceImportRun.count({
        where: {
          organizationId,
          channelAccountId,
          sourceType: 'coupang_wing_catalog',
          status: 'completed',
        },
      }),
      prisma.masterProduct.count({ where: { organizationId, isActive: true } }),
      prisma.channelListing.count({ where: { organizationId, channelAccountId, isActive: true } }),
      prisma.channelListingOption.count({
        where: {
          organizationId,
          isActive: true,
          listing: { channelAccountId },
        },
      }),
    ]);
  return {
    completedSellpiaImports,
    completedWingImports,
    activeMasters,
    listings,
    channelSkus,
  };
}

function assertReplayCounts(actual: ReplayFactCounts, expected: ReplayFactCounts): void {
  for (const key of Object.keys(expected) as Array<keyof ReplayFactCounts>) {
    if (actual[key] !== expected[key]) {
      throw new Error(`Expected ${expected[key]} ${key}, found ${actual[key]}`);
    }
  }
}

function assertReplayFactDigest(actual: string, expected: string): void {
  if (actual !== expected) {
    throw new Error(`Replay daily-fact digest mismatch: expected ${expected}, found ${actual}`);
  }
}

function positiveInteger(value: string): number {
  if (!/^[1-9][0-9]*$/.test(value)) throw new Error(`${value} must be a positive integer`);
  return Number(value);
}

async function main(): Promise<void> {
  const cli = parseCli(process.argv.slice(2));
  const target = guardFromCli(cli);
  switch (cli.command) {
    case 'guard': {
      if (target === 'local') {
        console.log(JSON.stringify({ target, guard: 'passed' }));
        return;
      }
      const prisma = await createPrisma();
      try {
        const identity = await assertSharedDatabaseIdentity(prisma, {
          target,
          databaseUrl: cliValue(cli, 'database-url', 'DATABASE_URL'),
          expectedDatabaseHost: cliValue(
            cli,
            'expected-database-host',
            'REBUILD_EXPECTED_DATABASE_HOST',
          ),
          expectedSupabaseProjectRef: cliValue(
            cli,
            'expected-supabase-project-ref',
            'REBUILD_EXPECTED_SUPABASE_PROJECT_REF',
          ),
          organizationId: cliValue(cli, 'organization-id', 'REBUILD_ORGANIZATION_ID'),
          organizationSlug: cliValue(cli, 'organization-slug', 'REBUILD_ORGANIZATION_SLUG'),
          channelAccountId: cliValue(
            cli,
            'coupang-account-id',
            'REBUILD_COUPANG_ACCOUNT_ID',
          ),
          channelAccountExternalId: cliValue(
            cli,
            'coupang-account-external-id',
            'REBUILD_COUPANG_EXTERNAL_ACCOUNT_ID',
          ),
        });
        console.log(JSON.stringify({ ...identity, guard: 'passed' }));
      } finally {
        await prisma.$disconnect();
      }
      return;
    }
    case 'export-coupang':
      await exportCoupang(cli, target);
      return;
    case 'bootstrap':
      await bootstrap(cli, target);
      return;
    case 'replay-coupang':
      await replayCoupang(cli, target);
      return;
    case 'verify-ready':
      await verifyReady(cli, target);
      return;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
