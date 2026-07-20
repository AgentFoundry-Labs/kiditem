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
const POSTGRES_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GIT_SHA_PATTERN = /^[0-9a-f]{40}$/i;
const PRIVATE_REPLAY_KEY_PATTERN = /(?:auth(?:orization)?|password|passcode|secret|token|credential|cookie|session|e-?mail|phone|address|street|postal|zip|buyer|customer|receiver|recipient|memo|note|review|(?:^|[_-])(?:name|full.?name|first.?name|last.?name|home)(?:[_-]|$)|이름|성명|배송|주소|연락처|전화|이메일|수령|구매자|고객|메모|요청사항)/i;
const EMAIL_VALUE_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE_VALUE_PATTERN = /(?:^|\D)(?:\+?82[-.\s]?)?0?1[016789][-.\s]?\d{3,4}[-.\s]?\d{4}(?:\D|$)/;
const INTERNATIONAL_PHONE_VALUE_PATTERN = /(?:^|\D)\+[1-9]\d{0,2}(?:[\s().-]*\d){7,14}(?:\D|$)/;
const KOREAN_ADDRESS_VALUE_PATTERN = /(?:서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)(?:특별시|광역시|특별자치시|특별자치도|도)?\s+(?:[^\s]+(?:시|군|구)\s+)?[^\s]+(?:로|길|동|읍|면)(?:\s+\d[\d-]*)?/;
const ENGLISH_ADDRESS_VALUE_PATTERN = /(?:\bP\.?O\.?\s+Box\s+\d+\b|\b\d{1,6}\s+(?:[A-Z0-9.'-]+\s+){1,7}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Way|Parkway|Pkwy|Highway|Hwy)\b)/i;
const BODY_KEYS = new Set([
  'type', 'source', 'data', 'normalizedRows', 'kpis', 'summary', 'adSummary',
  'campaignName', 'campaignReportScope', 'dashboardOnOff', 'dashboardStatus',
  'period', 'timestamp', 'dateFrom', 'dateTo', 'url',
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
  'vendor_item_id', 'itemId', '_kpiOnly', '_campaignOnly', '_observedMetrics',
  'pageType', 'campaignName', 'campaignId', 'campaignIdentity',
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
const BOOLEAN_ROW_KEYS = new Set(['isWinner', '_kpiOnly', '_campaignOnly']);
const OBSERVED_METRIC_KEYS = new Set([
  'adSpend', 'adRevenue', 'impressions', 'clicks', 'conversions', 'orders',
]);
const NUMBERISH_ROW_KEYS = new Set([
  'myPrice', 'winnerPrice', 'visitors', 'views', 'cartAdds', 'orders', 'salesQty',
  'revenue', 'conversionRate', 'currentBid', 'dailyBudget', 'runningAdSpend',
  'spend', 'impressions', 'clicks', 'conversions', 'roas', 'ctr',
  'adEfficiencyTarget', 'adSpend', 'adRevenue', 'rowCount',
]);
const COMMANDS = new Set([
  'guard',
  'export-staging-accounts',
  'restore-staging-accounts',
  'preflight-bootstrap',
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
export type BootstrapPreflightManifest = {
  schemaVersion: 'kiditem.authoritative-bootstrap-preflight.v1';
  target: SharedRebuildTarget;
  originRunId: string;
  deployedSha: string;
  organizationId: string;
  userId: string;
  userFingerprint: string;
  channelAccountIds: string[];
  planSha256: string;
  sourceManifestSha256: string;
};

export type StagingAccountBaseline = {
  organizations: Array<{
    id: string;
    name: string;
    slug: string;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
  }>;
  users: Array<{
    id: string;
    email: string;
    name: string;
    role: string;
    type: 'human';
    team: string | null;
    avatarUrl: string | null;
    isActive: boolean;
    lastLoginAt: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  memberships: Array<{
    id: string;
    organizationId: string;
    userId: string;
    role: string;
    status: string;
    invitedById: string | null;
    joinedAt: string;
    lastSelectedAt: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
};

export type StagingAccountBaselineManifest = {
  schemaVersion: 'kiditem.staging-account-baseline.v1';
  target: 'staging';
  originRunId: string;
  deployedSha: string;
  exportedAt: string;
  baseline: StagingAccountBaseline;
  payloadSha256: string;
};

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

type RebuildImportRunEvidence = {
  id: string;
  status: string;
  fileHash: string | null;
  rowCount: number;
  importedAt: Date | null;
};

export function assertRebuildImportPrerequisites(input: {
  sellpiaRuns: RebuildImportRunEvidence[];
  wingRuns: RebuildImportRunEvidence[];
  expected: {
    sellpiaFileHash: string;
    sellpiaRowCount: number;
    wingFileHash: string;
    wingRowCount: number;
  };
}): { sellpiaRunId: string; wingRunId: string } {
  if (input.sellpiaRuns.length !== 1 || input.wingRuns.length !== 1) {
    throw new Error('Rebuild requires exactly one matching Sellpia and Wing import run');
  }
  const sellpia = input.sellpiaRuns[0];
  const wing = input.wingRuns[0];
  if (sellpia.status !== 'completed' || wing.status !== 'completed') {
    throw new Error('Rebuild import runs must be completed');
  }
  for (const hash of [input.expected.sellpiaFileHash, input.expected.wingFileHash]) {
    if (!/^[0-9a-f]{64}$/i.test(hash)) throw new Error('Expected import file hash is invalid');
  }
  if (
    sellpia.fileHash !== input.expected.sellpiaFileHash ||
    wing.fileHash !== input.expected.wingFileHash
  ) {
    throw new Error('Rebuild import file hash does not match reviewed source artifact');
  }
  if (
    sellpia.rowCount !== input.expected.sellpiaRowCount ||
    wing.rowCount !== input.expected.wingRowCount
  ) {
    throw new Error('Rebuild import row count does not match reviewed source artifact');
  }
  if (
    !sellpia.importedAt || !wing.importedAt ||
    sellpia.importedAt.getTime() >= wing.importedAt.getTime()
  ) {
    throw new Error('Rebuild import order must be completed Sellpia before Wing');
  }
  return { sellpiaRunId: sellpia.id, wingRunId: wing.id };
}

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

function assertIsoTimestamp(value: string, label: string): void {
  if (!value || new Date(value).toISOString() !== value) {
    throw new Error(`${label} must be an ISO timestamp`);
  }
}

function assertUnique(values: string[], label: string): void {
  if (new Set(values).size !== values.length) {
    throw new Error(`Staging account baseline contains duplicate ${label}`);
  }
}

function assertPostgresUuid(value: string, label: string): void {
  if (!POSTGRES_UUID_PATTERN.test(value)) {
    throw new Error(`${label} must be a PostgreSQL UUID`);
  }
}

function validateStagingAccountBaseline(baseline: StagingAccountBaseline): void {
  if (
    baseline.organizations.length === 0 ||
    baseline.users.length === 0 ||
    baseline.memberships.length === 0
  ) {
    throw new Error('Staging account baseline requires organizations, users, and memberships');
  }

  const organizationIds = new Set<string>();
  for (const organization of baseline.organizations) {
    assertPostgresUuid(organization.id, 'organization.id');
    requireText(organization.name, 'organization.name');
    requireText(organization.slug, 'organization.slug');
    assertIsoTimestamp(organization.createdAt, 'organization.createdAt');
    assertIsoTimestamp(organization.updatedAt, 'organization.updatedAt');
    organizationIds.add(organization.id);
  }
  assertUnique(baseline.organizations.map(({ id }) => id), 'organization ID');
  assertUnique(baseline.organizations.map(({ slug }) => slug), 'organization slug');

  const userIds = new Set<string>();
  for (const user of baseline.users) {
    assertPostgresUuid(user.id, 'user.id');
    requireText(user.email, 'user.email');
    requireText(user.name, 'user.name');
    requireText(user.role, 'user.role');
    if (user.type !== 'human') {
      throw new Error('Staging account baseline may preserve only human users');
    }
    assertIsoTimestamp(user.createdAt, 'user.createdAt');
    assertIsoTimestamp(user.updatedAt, 'user.updatedAt');
    if (user.lastLoginAt) assertIsoTimestamp(user.lastLoginAt, 'user.lastLoginAt');
    userIds.add(user.id);
  }
  assertUnique(baseline.users.map(({ id }) => id), 'user ID');
  assertUnique(baseline.users.map(({ email }) => email.toLowerCase()), 'user email');

  for (const membership of baseline.memberships) {
    assertPostgresUuid(membership.id, 'membership.id');
    assertPostgresUuid(membership.organizationId, 'membership.organizationId');
    assertPostgresUuid(membership.userId, 'membership.userId');
    requireText(membership.role, 'membership.role');
    requireText(membership.status, 'membership.status');
    if (!organizationIds.has(membership.organizationId)) {
      throw new Error('Staging account baseline membership references an absent organization');
    }
    if (!userIds.has(membership.userId)) {
      throw new Error('Staging account baseline membership references an absent user');
    }
    if (membership.invitedById && !userIds.has(membership.invitedById)) {
      throw new Error('Staging account baseline membership inviter references an absent user');
    }
    assertIsoTimestamp(membership.joinedAt, 'membership.joinedAt');
    assertIsoTimestamp(membership.createdAt, 'membership.createdAt');
    assertIsoTimestamp(membership.updatedAt, 'membership.updatedAt');
    if (membership.lastSelectedAt) {
      assertIsoTimestamp(membership.lastSelectedAt, 'membership.lastSelectedAt');
    }
  }
  assertUnique(baseline.memberships.map(({ id }) => id), 'membership ID');
  assertUnique(
    baseline.memberships.map(({ organizationId, userId }) => `${organizationId}\0${userId}`),
    'organization/user membership',
  );
}

function sortStagingAccountBaseline(baseline: StagingAccountBaseline): StagingAccountBaseline {
  return {
    organizations: [...baseline.organizations].sort((a, b) => a.id.localeCompare(b.id)),
    users: [...baseline.users].sort((a, b) => a.id.localeCompare(b.id)),
    memberships: [...baseline.memberships].sort((a, b) => a.id.localeCompare(b.id)),
  };
}

function stagingAccountPayload(input: Omit<StagingAccountBaselineManifest, 'schemaVersion' | 'payloadSha256'>) {
  return {
    target: input.target,
    originRunId: input.originRunId,
    deployedSha: input.deployedSha,
    exportedAt: input.exportedAt,
    baseline: input.baseline,
  };
}

export function buildStagingAccountBaselineManifest(input: {
  target: 'staging';
  originRunId: string;
  deployedSha: string;
  exportedAt?: string;
  baseline: StagingAccountBaseline;
}): StagingAccountBaselineManifest {
  if (input.target !== 'staging') {
    throw new Error('Account-only rebuild baseline is staging-only');
  }
  assertPositiveIntegerText(input.originRunId, 'originRunId');
  if (!GIT_SHA_PATTERN.test(input.deployedSha)) {
    throw new Error('Staging account baseline deployed SHA must be immutable');
  }
  const exportedAt = input.exportedAt ?? new Date().toISOString();
  assertIsoTimestamp(exportedAt, 'exportedAt');
  const baseline = sortStagingAccountBaseline(input.baseline);
  validateStagingAccountBaseline(baseline);
  const payload = stagingAccountPayload({
    target: input.target,
    originRunId: input.originRunId,
    deployedSha: input.deployedSha,
    exportedAt,
    baseline,
  });
  return {
    schemaVersion: 'kiditem.staging-account-baseline.v1',
    ...payload,
    payloadSha256: sha256(stableStringify(payload)),
  };
}

export function assertStagingAccountBaselineManifest(
  manifest: StagingAccountBaselineManifest,
  binding: { target: 'staging'; originRunId: string; deployedSha: string },
): void {
  if (
    manifest.schemaVersion !== 'kiditem.staging-account-baseline.v1' ||
    manifest.target !== binding.target ||
    manifest.originRunId !== binding.originRunId ||
    manifest.deployedSha !== binding.deployedSha
  ) {
    throw new Error('Staging account baseline binding does not match this reset run');
  }
  assertPositiveIntegerText(manifest.originRunId, 'originRunId');
  if (!GIT_SHA_PATTERN.test(manifest.deployedSha)) {
    throw new Error('Staging account baseline deployed SHA must be immutable');
  }
  assertIsoTimestamp(manifest.exportedAt, 'exportedAt');
  validateStagingAccountBaseline(manifest.baseline);
  const actualHash = sha256(stableStringify(stagingAccountPayload(manifest)));
  if (manifest.payloadSha256 !== actualHash) {
    throw new Error('Staging account baseline integrity check failed');
  }
}

export function buildBootstrapPreflightManifest(input: {
  target: SharedRebuildTarget;
  originRunId: string;
  deployedSha: string;
  plan: SharedBootstrapPlan;
  sourceManifest?: RebuildSourceManifest;
}): BootstrapPreflightManifest {
  assertPositiveIntegerText(input.originRunId, 'originRunId');
  if (!GIT_SHA_PATTERN.test(input.deployedSha)) {
    throw new Error('Bootstrap preflight deployed SHA must be immutable');
  }
  return {
    schemaVersion: 'kiditem.authoritative-bootstrap-preflight.v1',
    target: input.target,
    originRunId: input.originRunId,
    deployedSha: input.deployedSha,
    organizationId: input.plan.organization.id,
    userId: input.plan.user.id,
    userFingerprint: sha256(`${input.plan.user.id}\0${input.plan.user.email.toLowerCase()}`),
    channelAccountIds: input.plan.channelAccounts.map(({ id }) => id),
    planSha256: sha256(stableStringify(input.plan)),
    sourceManifestSha256: sha256(stableStringify(input.sourceManifest ?? null)),
  };
}

export function assertBootstrapPreflightManifest(
  manifest: BootstrapPreflightManifest,
  input: {
    target: SharedRebuildTarget;
    originRunId: string;
    deployedSha: string;
    plan: SharedBootstrapPlan;
    sourceManifest?: RebuildSourceManifest;
  },
): void {
  const expected = buildBootstrapPreflightManifest(input);
  if (stableStringify(manifest) !== stableStringify(expected)) {
    throw new Error('Bootstrap preflight manifest does not match the protected baseline binding');
  }
}

export type RebuildSourceManifest = {
  sellpiaFileHash: string;
  sellpiaRowCount: number;
  wingFileHash: string;
  wingRowCount: number;
};

type RebuildImportBinding = {
  sellpiaRunId: string;
  wingRunId: string;
};

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
  const requestedScope = boundedReplayScope(
    meta.requestedCampaignReportScope ?? meta.campaignReportScope,
  );
  if (requestedScope && requestedScope !== 'legacy_raw_only') {
    body.campaignReportScope = requestedScope;
  }
  copyString(meta, body, 'dashboardOnOff');
  copyString(meta, body, 'dashboardStatus');
  if (run.period) body.period = run.period;
  if (run.businessDate) body.timestamp = run.businessDate.toISOString();
  if (run.periodStart) body.dateFrom = dateOnly(run.periodStart);
  if (run.periodEnd) body.dateTo = dateOnly(run.periodEnd);
  if (run.targetUrl) body.url = safeReplayUrl(run.targetUrl);
  return body;
}

function boundedReplayScope(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const scope = value.trim();
  return scope.length > 0 && scope.length <= 64 ? scope : null;
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
    if (body.campaignReportScope !== undefined) {
      const scope = boundedReplayScope(body.campaignReportScope);
      if (scope === null || scope !== body.campaignReportScope) {
        throw new Error('Replay body.campaignReportScope must be a trimmed nonempty string up to 64 characters');
      }
    }
    assertOptionalScalar(body.dashboardOnOff, ['string'], 'body.dashboardOnOff');
    assertOptionalScalar(body.dashboardStatus, ['string'], 'body.dashboardStatus');
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
      if (key === '_observedMetrics') {
        assertObservedMetrics(entry, `${label}[${index}]._observedMetrics`);
        continue;
      }
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

function assertObservedMetrics(value: unknown, label: string): void {
  const metrics = assertPlainRecord(value, label);
  assertAllowedRecord(metrics, OBSERVED_METRIC_KEYS, label);
  for (const [key, observed] of Object.entries(metrics)) {
    if (typeof observed !== 'boolean') {
      throw new Error(`Replay ${label}.${key} must be boolean`);
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

async function readStagingAccountBaseline(
  prisma: RebuildPrisma,
): Promise<StagingAccountBaseline> {
  const unsupportedHumanUsers = await prisma.user.count({
    where: {
      type: 'human',
      OR: [
        { password: { not: null } },
        { agentInstanceId: { not: null } },
      ],
    },
  });
  if (unsupportedHumanUsers > 0) {
    throw new Error(
      'Staging account export refuses human users with legacy passwords or agent identities',
    );
  }

  const [organizations, users, memberships] = await Promise.all([
    prisma.organization.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { id: 'asc' },
    }),
    prisma.user.findMany({
      where: { type: 'human' },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        type: true,
        team: true,
        avatarUrl: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { id: 'asc' },
    }),
    prisma.organizationMembership.findMany({
      where: { user: { type: 'human' } },
      select: {
        id: true,
        organizationId: true,
        userId: true,
        role: true,
        status: true,
        invitedById: true,
        joinedAt: true,
        lastSelectedAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { id: 'asc' },
    }),
  ]);

  return {
    organizations: organizations.map((organization) => ({
      ...organization,
      createdAt: organization.createdAt.toISOString(),
      updatedAt: organization.updatedAt.toISOString(),
    })),
    users: users.map((user) => ({
      ...user,
      type: 'human' as const,
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    })),
    memberships: memberships.map((membership) => ({
      ...membership,
      joinedAt: membership.joinedAt.toISOString(),
      lastSelectedAt: membership.lastSelectedAt?.toISOString() ?? null,
      createdAt: membership.createdAt.toISOString(),
      updatedAt: membership.updatedAt.toISOString(),
    })),
  };
}

async function exportStagingAccounts(cli: ParsedCli, target: RebuildTarget): Promise<void> {
  if (target !== 'staging') {
    throw new Error('Account-only baseline export is allowed only for staging');
  }
  const originRunId = cliValue(cli, 'origin-run-id', 'GITHUB_RUN_ID');
  const deployedSha = cliValue(cli, 'deployed-sha', 'REBUILD_DEPLOYED_SHA');
  const output = resolve(cliValue(cli, 'output', 'REBUILD_ACCOUNT_BASELINE_PATH'));
  const prisma = await createPrisma();
  try {
    const manifest = buildStagingAccountBaselineManifest({
      target,
      originRunId,
      deployedSha,
      baseline: await readStagingAccountBaseline(prisma),
    });
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
    await chmod(output, 0o600);
    console.log(JSON.stringify({
      output,
      organizations: manifest.baseline.organizations.length,
      users: manifest.baseline.users.length,
      memberships: manifest.baseline.memberships.length,
      payloadSha256: manifest.payloadSha256,
    }));
  } finally {
    await prisma.$disconnect();
  }
}

function requiredDate(value: string): Date {
  assertIsoTimestamp(value, 'restored timestamp');
  return new Date(value);
}

function optionalDate(value: string | null): Date | null {
  return value === null ? null : requiredDate(value);
}

async function restoreStagingAccounts(cli: ParsedCli, target: RebuildTarget): Promise<void> {
  if (target !== 'staging') {
    throw new Error('Account-only baseline restore is allowed only for staging');
  }
  const originRunId = cliValue(cli, 'origin-run-id', 'GITHUB_RUN_ID');
  const deployedSha = cliValue(cli, 'deployed-sha', 'REBUILD_DEPLOYED_SHA');
  const input = resolve(cliValue(cli, 'input', 'REBUILD_ACCOUNT_BASELINE_PATH'));
  const manifest = JSON.parse(
    await readFile(input, 'utf8'),
  ) as StagingAccountBaselineManifest;
  assertStagingAccountBaselineManifest(manifest, { target, originRunId, deployedSha });

  const prisma = await createPrisma();
  try {
    await prisma.$transaction(async (tx) => {
      const [organizations, users, memberships, channelAccounts] = await Promise.all([
        tx.organization.count(),
        tx.user.count(),
        tx.organizationMembership.count(),
        tx.channelAccount.count(),
      ]);
      if (organizations || users || memberships || channelAccounts) {
        throw new Error('Staging account restore requires empty account and channel tables');
      }

      await tx.organization.createMany({
        data: manifest.baseline.organizations.map((organization) => ({
          ...organization,
          createdAt: requiredDate(organization.createdAt),
          updatedAt: requiredDate(organization.updatedAt),
        })),
      });
      await tx.user.createMany({
        data: manifest.baseline.users.map((user) => ({
          ...user,
          lastLoginAt: optionalDate(user.lastLoginAt),
          createdAt: requiredDate(user.createdAt),
          updatedAt: requiredDate(user.updatedAt),
        })),
      });
      await tx.organizationMembership.createMany({
        data: manifest.baseline.memberships.map((membership) => ({
          ...membership,
          joinedAt: requiredDate(membership.joinedAt),
          lastSelectedAt: optionalDate(membership.lastSelectedAt),
          createdAt: requiredDate(membership.createdAt),
          updatedAt: requiredDate(membership.updatedAt),
        })),
      });
    });

    const [restored, channelAccounts] = await Promise.all([
      readStagingAccountBaseline(prisma),
      prisma.channelAccount.count(),
    ]);
    if (stableStringify(restored) !== stableStringify(manifest.baseline)) {
      throw new Error('Restored staging account baseline does not match the exported rows');
    }
    if (channelAccounts !== 0) {
      throw new Error('Staging account restore must not recreate ChannelAccount rows');
    }
    console.log(JSON.stringify({
      restored: true,
      organizations: restored.organizations.length,
      users: restored.users.length,
      memberships: restored.memberships.length,
      channelAccounts,
    }));
  } finally {
    await prisma.$disconnect();
  }
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

function bootstrapPlanFromCli(cli: ParsedCli): SharedBootstrapPlan {
  return buildSharedBootstrapPlan({
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
}

function sourceManifestFromCli(cli: ParsedCli): RebuildSourceManifest {
  const sellpiaFileHash = cliValue(
    cli,
    'sellpia-file-sha256',
    'REBUILD_SELLPIA_FILE_SHA256',
  ).toLowerCase();
  const wingFileHash = cliValue(
    cli,
    'wing-file-sha256',
    'REBUILD_WING_FILE_SHA256',
  ).toLowerCase();
  for (const [label, hash] of [
    ['Sellpia', sellpiaFileHash],
    ['Wing', wingFileHash],
  ] as const) {
    if (!/^[0-9a-f]{64}$/.test(hash)) {
      throw new Error(`${label} source SHA-256 must be exactly 64 hexadecimal characters`);
    }
  }
  return {
    sellpiaFileHash,
    sellpiaRowCount: positiveInteger(
      cliValue(cli, 'sellpia-row-count', 'REBUILD_SELLPIA_ROW_COUNT'),
    ),
    wingFileHash,
    wingRowCount: positiveInteger(
      cliValue(cli, 'wing-row-count', 'REBUILD_WING_ROW_COUNT'),
    ),
  };
}

async function preflightBootstrap(
  cli: ParsedCli,
  target: RebuildTarget,
): Promise<void> {
  if (target === 'local') {
    throw new Error('Bootstrap preflight is required only at a shared GitHub Environment boundary');
  }
  const originRunId = cliValue(cli, 'origin-run-id', 'GITHUB_RUN_ID');
  const deployedSha = cliValue(cli, 'deployed-sha', 'REBUILD_DEPLOYED_SHA');
  const output = resolve(
    cliValue(cli, 'output', 'REBUILD_BOOTSTRAP_PREFLIGHT_PATH'),
  );
  const plan = bootstrapPlanFromCli(cli);
  const sourceManifest = sourceManifestFromCli(cli);
  const prisma = await createPrisma();
  try {
    const [organizations, users, memberships, accounts] = await Promise.all([
      prisma.organization.findMany({
        select: { id: true, name: true, slug: true, isActive: true },
        orderBy: { id: 'asc' },
      }),
      prisma.user.findMany({
        select: { id: true, email: true, name: true, role: true, type: true, isActive: true },
        orderBy: { id: 'asc' },
      }),
      prisma.organizationMembership.findMany({
        where: { status: 'active' },
        select: { organizationId: true, userId: true, role: true, status: true },
        orderBy: [{ organizationId: 'asc' }, { userId: 'asc' }],
      }),
      prisma.channelAccount.findMany({
        where: { channel: { in: ['coupang', 'rocket'] } },
        select: {
          id: true,
          organizationId: true,
          channel: true,
          name: true,
          externalAccountId: true,
          status: true,
          isPrimary: true,
          config: true,
        },
        orderBy: { id: 'asc' },
      }),
    ]);
    const expected = {
      organizations: [plan.organization].sort((a, b) => a.id.localeCompare(b.id)),
      users: [plan.user].sort((a, b) => a.id.localeCompare(b.id)),
      memberships: [plan.membership],
      accounts: [...plan.channelAccounts].sort((a, b) => a.id.localeCompare(b.id)),
    };
    const actual = { organizations, users, memberships, accounts };
    if (stableStringify(actual) !== stableStringify(expected)) {
      throw new Error(
        'Protected bootstrap rows do not exactly match the reviewed organization/user/membership/account baseline',
      );
    }

    const supabaseUrl = cliValue(cli, 'supabase-url', 'SUPABASE_URL');
    const expectedProjectRef = cliValue(
      cli,
      'expected-supabase-project-ref',
      'REBUILD_EXPECTED_SUPABASE_PROJECT_REF',
    );
    assertProtectedSupabaseDestination(supabaseUrl, expectedProjectRef);
    const supabase = createClient(
      supabaseUrl,
      cliValue(cli, 'supabase-secret-key', 'SUPABASE_SECRET_KEY'),
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const { data, error } = await supabase.auth.admin.getUserById(plan.user.id);
    if (error) throw error;
    if (
      data.user?.id !== plan.user.id ||
      data.user.email?.trim().toLowerCase() !== plan.user.email.trim().toLowerCase()
    ) {
      throw new Error('Protected Supabase auth user ID/email does not match the baseline');
    }

    const manifest = buildBootstrapPreflightManifest({
      target,
      originRunId,
      deployedSha,
      plan,
      sourceManifest,
    });
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
    await chmod(output, 0o600);
    console.log(JSON.stringify({
      organizationId: manifest.organizationId,
      userId: manifest.userId,
      userFingerprint: manifest.userFingerprint,
      channelAccountIds: manifest.channelAccountIds,
      planSha256: manifest.planSha256,
      sourceManifestSha256: manifest.sourceManifestSha256,
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
  const plan = bootstrapPlanFromCli(cli);
  const sourceManifest = sourceManifestFromCli(cli);
  if (target !== 'local') {
    const preflightPath = resolve(
      cliValue(cli, 'preflight', 'REBUILD_BOOTSTRAP_PREFLIGHT_PATH'),
    );
    const manifest = JSON.parse(
      await readFile(preflightPath, 'utf8'),
    ) as BootstrapPreflightManifest;
    assertBootstrapPreflightManifest(manifest, {
      target,
      originRunId,
      deployedSha,
      plan,
      sourceManifest,
    });
  }

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
            sourceManifest,
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
            sourceManifest,
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
  const sourceManifest = sourceManifestFromCli(cli);
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
    await bindRebuildImports(prisma, bundle, target, sourceManifest);
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
    await assertCurrentRebuildBinding(prisma, bundle, target, sourceManifest);
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
  sourceManifest?: RebuildSourceManifest,
): Promise<{ id: string; updatedAt: Date; status: JsonRecord }> {
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
    status.channelAccountFingerprint !== bundle.channelAccountFingerprint ||
    (sourceManifest !== undefined &&
      stableStringify(status.sourceManifest) !== stableStringify(sourceManifest))
  ) {
    throw new Error(
      'Current database is not the snapshot_required rebuild bound to this target, origin run, SHA, and account',
    );
  }
  return { id: setting.id, updatedAt: setting.updatedAt, status };
}

async function readRebuildImportEvidence(
  prisma: RebuildPrisma,
  bundle: CoupangReplayBundle,
  sourceManifest: RebuildSourceManifest,
): Promise<{
  evidence: RebuildImportBinding;
  sellpiaRuns: RebuildImportRunEvidence[];
  wingRuns: RebuildImportRunEvidence[];
}> {
  const [sellpiaRuns, wingRuns] = await Promise.all([
    prisma.sourceImportRun.findMany({
      where: {
        organizationId: bundle.organizationId,
        sourceType: 'sellpia_inventory',
        fileHash: sourceManifest.sellpiaFileHash,
      },
      select: { id: true, status: true, fileHash: true, rowCount: true, importedAt: true },
    }),
    prisma.sourceImportRun.findMany({
      where: {
        organizationId: bundle.organizationId,
        channelAccountId: bundle.channelAccountId,
        sourceType: 'coupang_wing_catalog',
        fileHash: sourceManifest.wingFileHash,
      },
      select: { id: true, status: true, fileHash: true, rowCount: true, importedAt: true },
    }),
  ]);
  return {
    evidence: assertRebuildImportPrerequisites({
      sellpiaRuns,
      wingRuns,
      expected: sourceManifest,
    }),
    sellpiaRuns,
    wingRuns,
  };
}

function assertStoredImportBinding(
  status: JsonRecord,
  evidence: RebuildImportBinding,
): void {
  if (stableStringify(status.importBinding) !== stableStringify(evidence)) {
    throw new Error('Rebuild import run binding does not match the exact reviewed source runs');
  }
}

async function bindRebuildImports(
  prisma: PrismaClient,
  bundle: CoupangReplayBundle,
  target: RebuildTarget,
  sourceManifest: RebuildSourceManifest,
): Promise<RebuildImportBinding> {
  return prisma.$transaction(async (tx) => {
    const bound = await assertCurrentRebuildBinding(tx, bundle, target, sourceManifest);
    const { evidence } = await readRebuildImportEvidence(tx, bundle, sourceManifest);
    if (bound.status.importBinding !== undefined) {
      assertStoredImportBinding(bound.status, evidence);
      return evidence;
    }
    const transition = await tx.systemSetting.updateMany({
      where: { id: bound.id, updatedAt: bound.updatedAt },
      data: {
        value: {
          state: 'snapshot_required',
          target,
          originRunId: bundle.originRunId,
          deployedSha: bundle.deployedSha,
          channelAccountFingerprint: bundle.channelAccountFingerprint,
          sourceManifest,
          importBinding: evidence,
          updatedAt: new Date().toISOString(),
        },
      },
    });
    if (transition.count !== 1) {
      throw new Error('Rebuild status changed concurrently; refusing import binding');
    }
    return evidence;
  }, { isolationLevel: 'Serializable' });
}

async function verifyReady(cli: ParsedCli, target: RebuildTarget): Promise<void> {
  const bundle = await readBundle(cli, target);
  const sourceManifest = sourceManifestFromCli(cli);
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
      const boundSetting = await assertCurrentRebuildBinding(
        tx,
        bundle,
        target,
        sourceManifest,
      );
      const [{ evidence, sellpiaRuns, wingRuns }, actualCounts, replayCounts, replayFactDigest] =
        await Promise.all([
          readRebuildImportEvidence(tx, bundle, sourceManifest),
          readReadyCounts(tx, bundle.organizationId, channelAccountId),
          readReplayFactCounts(tx, bundle.organizationId, channelAccountId),
          readReplayFactDigest(tx, bundle.organizationId, channelAccountId),
        ]);
      assertStoredImportBinding(boundSetting.status, evidence);
      const actual = {
        ...actualCounts,
        completedSellpiaImports: sellpiaRuns.length,
        completedWingImports: wingRuns.length,
      };
      assertReadyCounts(actual, expected);
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
            sourceManifest,
            importBinding: evidence,
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
      if (target === 'local' || target === 'staging') {
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
    case 'export-staging-accounts':
      await exportStagingAccounts(cli, target);
      return;
    case 'restore-staging-accounts':
      await restoreStagingAccounts(cli, target);
      return;
    case 'preflight-bootstrap':
      await preflightBootstrap(cli, target);
      return;
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
