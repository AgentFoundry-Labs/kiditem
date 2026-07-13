#!/usr/bin/env tsx
import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertLocalDevelopmentDatabase } from './bootstrap-authoritative-inventory-dev';

const SCHEMA_VERSION = 'kiditem.authoritative-inventory-rebuild.v1';
const REBUILD_STATUS_KEY = 'inventory.rebuild.status';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PRIVATE_REPLAY_KEY_PATTERN = /(?:auth(?:orization)?|password|passcode|secret|token|credential|cookie|session|e-?mail|phone|address|buyer|customer|receiver|recipient|order|review)/i;
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
  organizationId: string;
  createdAt: string;
  expectedReplayCounts: ReplayFactCounts;
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
  organizationId: string;
  runs: ReplaySourceRun[];
  factCounts: ReplayFactCounts;
  createdAt?: string;
}): CoupangReplayBundle {
  assertPositiveIntegerText(input.originRunId, 'originRunId');
  assertUuid(input.organizationId, 'organizationId');

  return {
    schemaVersion: SCHEMA_VERSION,
    target: input.target,
    originRunId: input.originRunId,
    organizationId: input.organizationId,
    createdAt: input.createdAt ?? new Date().toISOString(),
    expectedReplayCounts: input.factCounts,
    payloads: input.runs.map((run) => ({
      sourceRunId: run.id,
      body: buildReplayBody(run),
    })),
  };
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
  const data = run.snapshots.map((snapshot) => sanitizeReplayRecord(snapshot.rawJson));
  const normalizedRows = run.snapshots.map((snapshot) =>
    snapshot.normalizedJson == null ? {} : sanitizeReplayRecord(snapshot.normalizedJson));
  const hasNormalizedRows = run.snapshots.some((snapshot) => snapshot.normalizedJson != null);
  const type = replayType(run);
  const body: JsonRecord = {
    type,
    source: type === 'coupang_ads_daily' ? 'coupang_ads' : run.source,
    data,
  };

  if (hasNormalizedRows) body.normalizedRows = normalizedRows;
  copyRecord(meta, body, 'kpis');
  copyRecord(meta, body, 'summary');
  copyRecord(meta, body, 'adSummary');
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

function copyRecord(source: JsonRecord, target: JsonRecord, key: string): void {
  const value = sanitizeReplayRecord(source[key]);
  if (Object.keys(value).length > 0) target[key] = value;
}

function copyString(source: JsonRecord, target: JsonRecord, key: string): void {
  if (typeof source[key] === 'string' && source[key]) target[key] = source[key];
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function sanitizeReplayRecord(value: unknown): JsonRecord {
  const record = asRecord(value);
  const sanitized: JsonRecord = {};
  for (const [key, entry] of Object.entries(record)) {
    if (PRIVATE_REPLAY_KEY_PATTERN.test(key)) continue;
    sanitized[key] = sanitizeReplayValue(entry);
  }
  return sanitized;
}

function sanitizeReplayValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeReplayValue);
  if (value && typeof value === 'object') return sanitizeReplayRecord(value);
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
  const output = resolve(cliValue(cli, 'output', 'REBUILD_BUNDLE_PATH'));
  assertUuid(organizationId, 'organizationId');
  assertPositiveIntegerText(originRunId, 'originRunId');

  const prisma = await createPrisma();
  try {
    const runs = await prisma.channelScrapeRun.findMany({
      where: {
        organizationId,
        channel: 'coupang',
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
    const factCounts = await readReplayFactCounts(prisma, organizationId);
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
      organizationId,
      runs,
      factCounts,
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
  assertPositiveIntegerText(originRunId, 'originRunId');
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
            updatedAt: new Date().toISOString(),
          },
        },
      });
    });
    console.log(JSON.stringify({
      state: 'snapshot_required',
      target,
      originRunId,
      organizationId: plan.organization.id,
      channelAccounts: plan.channelAccounts.length,
    }));
  } finally {
    await prisma.$disconnect();
  }
}

async function readBundle(cli: ParsedCli, target: RebuildTarget): Promise<CoupangReplayBundle> {
  const bundlePath = resolve(cliValue(cli, 'bundle', 'REBUILD_BUNDLE_PATH'));
  const bundle = JSON.parse(await readFile(bundlePath, 'utf8')) as CoupangReplayBundle;
  const originRunId = cliValue(cli, 'origin-run-id', 'REBUILD_ORIGIN_RUN_ID');
  const organizationId = cliValue(cli, 'organization-id', 'REBUILD_ORGANIZATION_ID');
  if (
    bundle.schemaVersion !== SCHEMA_VERSION ||
    bundle.target !== target ||
    bundle.originRunId !== originRunId ||
    bundle.organizationId !== organizationId ||
    !Array.isArray(bundle.payloads)
  ) {
    throw new Error('Rebuild bundle does not match the requested target, origin run, or organization');
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
  const accessToken = await generateOperatorAccessToken(cli);
  const prisma = await createPrisma();
  try {
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
        body: JSON.stringify({ ...payload.body, channelAccountId }),
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

    const actual = await readReplayFactCounts(prisma, bundle.organizationId);
    assertReplayCounts(actual, bundle.expectedReplayCounts);
    console.log(JSON.stringify({
      target,
      originRunId: bundle.originRunId,
      replayedPayloads: completed.size,
      counts: actual,
    }));
  } finally {
    await prisma.$disconnect();
  }
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
    const [sellpiaRun, wingRun, actual, replayCounts] = await Promise.all([
      prisma.sourceImportRun.findFirst({
        where: {
          organizationId: bundle.organizationId,
          sourceType: 'sellpia_inventory',
          status: 'completed',
        },
        orderBy: [{ importedAt: 'desc' }, { createdAt: 'desc' }],
        select: { importedAt: true, createdAt: true },
      }),
      prisma.sourceImportRun.findFirst({
        where: {
          organizationId: bundle.organizationId,
          channelAccountId,
          sourceType: 'coupang_wing_catalog',
          status: 'completed',
        },
        orderBy: [{ importedAt: 'desc' }, { createdAt: 'desc' }],
        select: { importedAt: true, createdAt: true },
      }),
      readReadyCounts(prisma, bundle.organizationId, channelAccountId),
      readReplayFactCounts(prisma, bundle.organizationId),
    ]);
    assertReadyCounts(actual, expected);
    const sellpiaAt = sellpiaRun?.importedAt ?? sellpiaRun?.createdAt;
    const wingAt = wingRun?.importedAt ?? wingRun?.createdAt;
    if (!sellpiaAt || !wingAt || wingAt < sellpiaAt) {
      throw new Error('Sellpia must complete before the Wing catalog import');
    }
    assertReplayCounts(replayCounts, bundle.expectedReplayCounts);

    await prisma.systemSetting.update({
      where: {
        organizationId_key: {
          organizationId: bundle.organizationId,
          key: REBUILD_STATUS_KEY,
        },
      },
      data: {
        value: {
          state: 'ready',
          target,
          originRunId: bundle.originRunId,
          imports: actual,
          replay: replayCounts,
          readyAt: new Date().toISOString(),
        },
      },
    });
    console.log(JSON.stringify({
      state: 'ready',
      target,
      originRunId: bundle.originRunId,
      imports: actual,
      replay: replayCounts,
    }));
  } finally {
    await prisma.$disconnect();
  }
}

async function generateOperatorAccessToken(cli: ParsedCli): Promise<string> {
  const supabaseUrl = cliValue(cli, 'supabase-url', 'SUPABASE_URL');
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

async function readReplayFactCounts(
  prisma: PrismaClient,
  organizationId: string,
): Promise<ReplayFactCounts> {
  const [scrapeRuns, rawSnapshots, listingDailyFacts, optionDailyFacts, adTargetFacts, accountKpiFacts] =
    await Promise.all([
      prisma.channelScrapeRun.count({ where: { organizationId, channel: 'coupang' } }),
      prisma.channelScrapeSnapshot.count({ where: { organizationId, channel: 'coupang' } }),
      prisma.channelListingDailySnapshot.count({ where: { organizationId, channel: 'coupang' } }),
      prisma.channelListingOptionDailySnapshot.count({ where: { organizationId, channel: 'coupang' } }),
      prisma.channelAdTargetDailySnapshot.count({ where: { organizationId, channel: 'coupang' } }),
      prisma.channelAccountDailyKpiSnapshot.count({ where: { organizationId, channel: 'coupang' } }),
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

async function readReadyCounts(
  prisma: PrismaClient,
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

function positiveInteger(value: string): number {
  if (!/^[1-9][0-9]*$/.test(value)) throw new Error(`${value} must be a positive integer`);
  return Number(value);
}

async function main(): Promise<void> {
  const cli = parseCli(process.argv.slice(2));
  const target = guardFromCli(cli);
  switch (cli.command) {
    case 'guard':
      console.log(JSON.stringify({ target, guard: 'passed' }));
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
