import 'dotenv/config';

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import {
  cp,
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const SCHEMA_VERSION = 'kiditem.dev-data.coupang.v1';
const LOCAL_DATA_ROOT = path.join('.data', 'coupang');
const LEGACY_MARKET_DATA_SEED = 'scripts/seed-channel-market-data';

type Command = 'replay' | 'sanitize' | 'export';
type Lane = 'real' | 'demo';
type ImportMode = 'upsert' | 'scoped-replace' | 'full-reset';

type Args = {
  command: Command;
  values: Map<string, string[]>;
  flags: Set<string>;
};

type BundlePayload = {
  path: string;
  type: string;
  source?: string;
  description?: string;
  sha256?: string;
  rowCount?: number;
};

type BundleReference = {
  path: string;
  type: string;
  description?: string;
  sha256?: string;
  bytes?: number;
};

type BundleManifest = {
  schemaVersion: string;
  datasetId: string;
  lane: Lane;
  createdAt: string;
  description?: string;
  defaultImportMode?: ImportMode;
  scope?: {
    organizationId?: string;
    channel?: 'coupang';
    businessDateFrom?: string;
    businessDateTo?: string;
    sources?: string[];
  };
  payloads: BundlePayload[];
  references?: BundleReference[];
  checksums?: Record<string, string>;
};

type ReplayResult = {
  payload: string;
  type: string;
  ok: boolean;
  response?: unknown;
  error?: string;
};

type CoupangImageSyncRow = {
  inventoryId: string;
  legacyCode?: string | null;
  name: string;
  url: string;
};

type CoupangImageSyncListingSource = {
  externalId: string;
  channelName?: string | null;
  master: {
    name: string;
    legacyCode?: string | null;
    sourceUrl?: string | null;
    options?: Array<{ legacyCode?: string | null }>;
  };
};

export function buildCoupangImageSyncRowsForListings(listings: CoupangImageSyncListingSource[]): {
  rows: CoupangImageSyncRow[];
  skippedDuplicateInventoryId: number;
  skippedMissingSourceUrl: number;
} {
  const rows: CoupangImageSyncRow[] = [];
  const seenInventoryIds = new Set<string>();
  let skippedDuplicateInventoryId = 0;
  let skippedMissingSourceUrl = 0;

  for (const listing of listings) {
    const inventoryId = listing.externalId.trim();
    if (!inventoryId || seenInventoryIds.has(inventoryId)) {
      skippedDuplicateInventoryId += 1;
      continue;
    }

    const sourceUrl = listing.master.sourceUrl?.trim();
    if (!sourceUrl) {
      skippedMissingSourceUrl += 1;
      continue;
    }

    seenInventoryIds.add(inventoryId);
    rows.push({
      inventoryId,
      legacyCode: listing.master.legacyCode ?? listing.master.options?.[0]?.legacyCode ?? null,
      name: listing.channelName ?? listing.master.name,
      url: sourceUrl,
    });
  }

  rows.sort((a, b) => a.inventoryId.localeCompare(b.inventoryId));
  return { rows, skippedDuplicateInventoryId, skippedMissingSourceUrl };
}

function parseArgs(raw = process.argv.slice(2)): Args {
  const command = (raw.shift() ?? 'replay') as Command;
  if (!['replay', 'sanitize', 'export'].includes(command)) {
    throw new Error(`Unknown command: ${command}`);
  }

  const values = new Map<string, string[]>();
  const flags = new Set<string>();
  for (let i = 0; i < raw.length; i += 1) {
    const token = raw[i];
    if (!token.startsWith('--')) {
      throw new Error(`Unexpected argument: ${token}`);
    }
    const stripped = token.slice(2);
    const eq = stripped.indexOf('=');
    if (eq >= 0) {
      pushValue(values, stripped.slice(0, eq), stripped.slice(eq + 1));
      continue;
    }
    const next = raw[i + 1];
    if (!next || next.startsWith('--')) {
      flags.add(stripped);
      continue;
    }
    pushValue(values, stripped, next);
    i += 1;
  }

  return { command, values, flags };
}

function pushValue(values: Map<string, string[]>, key: string, value: string): void {
  values.set(key, [...(values.get(key) ?? []), value]);
}

function value(args: Args, key: string): string | undefined {
  return args.values.get(key)?.at(-1);
}

function values(args: Args, key: string): string[] {
  return args.values.get(key) ?? [];
}

function bool(args: Args, key: string): boolean {
  return args.flags.has(key) || value(args, key) === 'true';
}

function expandHome(input: string): string {
  if (input === '~') return os.homedir();
  if (input.startsWith('~/')) return path.join(os.homedir(), input.slice(2));
  return input;
}

function repoPath(...parts: string[]): string {
  return path.resolve(process.cwd(), ...parts);
}

function localDataRoot(args: Args): string {
  return path.resolve(expandHome(value(args, 'data-root') ?? repoPath(LOCAL_DATA_ROOT)));
}

function lane(args: Args): Lane {
  const raw = value(args, 'lane') ?? 'real';
  if (raw !== 'real' && raw !== 'demo') {
    throw new Error(`Invalid lane: ${raw}`);
  }
  return raw;
}

async function readTextIfExists(file: string): Promise<string | null> {
  if (!existsSync(file)) return null;
  return (await readFile(file, 'utf8')).trim();
}

async function resolveDatasetId(args: Args, required = true): Promise<string> {
  const explicit = value(args, 'dataset');
  if (explicit) {
    assertSafeDatasetId(explicit);
    return explicit;
  }

  const localLatest = await readTextIfExists(path.join(localDataRoot(args), 'latest.txt'));
  if (localLatest) {
    assertSafeDatasetId(localLatest);
    return localLatest;
  }

  if (!required) return '';
  throw new Error('Dataset is required. Pass --dataset or run data:dev:pull/sync first.');
}

function localBundleDir(args: Args, datasetId: string): string {
  return path.join(localDataRoot(args), datasetId);
}

function assertSafeDatasetId(datasetId: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(datasetId)) {
    throw new Error(`Unsafe dataset id: ${datasetId}`);
  }
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, 'utf8')) as T;
}

async function writeJson(file: string, data: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

async function sha256(file: string): Promise<string> {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

function assertSafeRelativePath(relativePath: string): void {
  if (path.isAbsolute(relativePath) || relativePath.includes('..')) {
    throw new Error(`Unsafe bundle path: ${relativePath}`);
  }
}

function referenceTypeFor(file: string): string {
  const baseName = path.basename(file).toLowerCase();
  if (/^kiditem[_-]list\b/.test(baseName)) return 'kiditem_list';
  if (/^wing-inventory-matched\b/.test(baseName)) return 'wing_inventory_matched';

  const ext = path.extname(file).toLowerCase();
  if (['.xls', '.xlsx', '.csv', '.tsv'].includes(ext)) return 'inventory_reference';
  return 'reference';
}

async function loadManifest(bundleDir: string): Promise<BundleManifest> {
  const manifest = await readJson<BundleManifest>(path.join(bundleDir, 'manifest.json'));
  if (manifest.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(
      `Unsupported schemaVersion ${manifest.schemaVersion}. Expected ${SCHEMA_VERSION}.`,
    );
  }
  if (!manifest.datasetId) throw new Error('manifest.datasetId is required');
  assertSafeDatasetId(manifest.datasetId);
  if (manifest.lane !== 'real' && manifest.lane !== 'demo') {
    throw new Error(`Invalid manifest.lane: ${manifest.lane}`);
  }
  if (!Array.isArray(manifest.payloads) || manifest.payloads.length === 0) {
    throw new Error('manifest.payloads must contain at least one payload');
  }
  return manifest;
}

async function verifyBundle(bundleDir: string, manifest: BundleManifest): Promise<void> {
  for (const artifact of [...manifest.payloads, ...(manifest.references ?? [])]) {
    assertSafeRelativePath(artifact.path);
    const file = path.join(bundleDir, artifact.path);
    const expected = artifact.sha256 ?? manifest.checksums?.[artifact.path];
    if (!existsSync(file)) throw new Error(`Missing bundle artifact: ${artifact.path}`);
    if (!expected) continue;
    const actual = await sha256(file);
    if (actual !== expected) {
      throw new Error(`Checksum mismatch for ${artifact.path}: ${actual} != ${expected}`);
    }
  }
}

function sourceForPayload(payload: BundlePayload, body: Record<string, unknown>): string {
  if (payload.type === 'ad_campaign') return 'advertising';
  if (payload.type === 'traffic') return 'wing';
  if (payload.type === 'coupang_ads_daily') return 'coupang_ads';
  if (payload.type === 'coupang_image_sync') return 'wing_image_sync';
  if (payload.type === 'raw_scrape') {
    return String(payload.source ?? body.source ?? 'unknown');
  }
  return String(payload.source ?? body.source ?? 'unknown');
}

function normalizePayload(payload: BundlePayload, body: unknown): Record<string, unknown> {
  if (Array.isArray(body)) {
    return {
      type: payload.type,
      source: payload.source,
      data: body,
      timestamp: new Date().toISOString(),
    };
  }
  if (!body || typeof body !== 'object') {
    throw new Error(`${payload.path} must be a JSON object or array`);
  }
  const out = { ...(body as Record<string, unknown>) };
  out.type = String(out.type ?? payload.type);
  if (payload.source && out.source === undefined) out.source = payload.source;
  return out;
}

async function createPrisma(): Promise<PrismaClient> {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for scoped replace/full reset.');
  }
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  await prisma.$connect();
  return prisma;
}

async function resolveOrganizationId(
  prisma: PrismaClient,
  args: Args,
  manifest: BundleManifest,
): Promise<string> {
  const explicit =
    value(args, 'organization-id') ??
    manifest.scope?.organizationId ??
    process.env.KIDITEM_DEV_ORGANIZATION_ID;
  if (explicit) return explicit;

  const userId =
    value(args, 'dev-user-id') ??
    process.env.KIDITEM_DEV_USER_ID ??
    process.env.DEV_DEFAULT_USER_ID;
  if (userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          where: { status: 'active' },
          orderBy: [{ lastSelectedAt: 'desc' }, { joinedAt: 'asc' }],
          take: 1,
          select: { organizationId: true },
        },
      },
    });
    const orgId = user?.memberships[0]?.organizationId;
    if (orgId) return orgId;
  }

  throw new Error(
    'Organization scope is required. Pass --organization-id, set KIDITEM_DEV_ORGANIZATION_ID, or set a dev user env that resolves to an active OrganizationMembership.',
  );
}

function parseBusinessDate(input: string | undefined, label: string): Date {
  if (!input || !/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    throw new Error(`${label} must be YYYY-MM-DD`);
  }
  return new Date(`${input}T00:00:00.000Z`);
}

async function cleanupLegacySeedRows(prisma: PrismaClient, organizationId: string) {
  const account = await prisma.$executeRaw`
    DELETE FROM channel_account_daily_kpi_snapshots
    WHERE organization_id = ${organizationId}::uuid
      AND (
        normalized_json->>'seededBy' = ${LEGACY_MARKET_DATA_SEED}
        OR raw_json->>'seededBy' = ${LEGACY_MARKET_DATA_SEED}
      )
  `;
  const targets = await prisma.$executeRaw`
    DELETE FROM channel_ad_target_daily_snapshots
    WHERE organization_id = ${organizationId}::uuid
      AND meta_json->>'seededBy' = ${LEGACY_MARKET_DATA_SEED}
  `;
  const listing = await prisma.$executeRaw`
    DELETE FROM channel_listing_daily_snapshots
    WHERE organization_id = ${organizationId}::uuid
      AND meta_json->>'seededBy' = ${LEGACY_MARKET_DATA_SEED}
  `;
  const snapshots = await prisma.$executeRaw`
    DELETE FROM channel_scrape_snapshots
    WHERE organization_id = ${organizationId}::uuid
      AND normalized_json->>'seededBy' = ${LEGACY_MARKET_DATA_SEED}
  `;
  const runs = await prisma.$executeRaw`
    DELETE FROM channel_scrape_runs
    WHERE organization_id = ${organizationId}::uuid
      AND meta_json->>'seededBy' = ${LEGACY_MARKET_DATA_SEED}
  `;
  return { account, targets, listing, snapshots, runs };
}

async function scopedReplace(
  prisma: PrismaClient,
  organizationId: string,
  manifest: BundleManifest,
  sources: string[],
) {
  const channel = manifest.scope?.channel ?? 'coupang';
  const from = parseBusinessDate(manifest.scope?.businessDateFrom, 'scope.businessDateFrom');
  const to = parseBusinessDate(manifest.scope?.businessDateTo, 'scope.businessDateTo');

  const adTargets = await prisma.channelAdTargetDailySnapshot.deleteMany({
    where: { organizationId, channel, businessDate: { gte: from, lte: to } },
  });
  const optionDaily = await prisma.channelListingOptionDailySnapshot.deleteMany({
    where: { organizationId, channel, businessDate: { gte: from, lte: to } },
  });
  const listingDaily = await prisma.channelListingDailySnapshot.deleteMany({
    where: { organizationId, channel, businessDate: { gte: from, lte: to } },
  });
  const accountKpi = await prisma.channelAccountDailyKpiSnapshot.deleteMany({
    where: { organizationId, channel, businessDate: { gte: from, lte: to } },
  });
  const snapshots = await prisma.channelScrapeSnapshot.deleteMany({
    where: {
      organizationId,
      channel,
      source: { in: sources },
      businessDate: { gte: from, lte: to },
    },
  });
  const runs = await prisma.channelScrapeRun.deleteMany({
    where: {
      organizationId,
      channel,
      source: { in: sources },
      businessDate: { gte: from, lte: to },
    },
  });

  return {
    adTargets: adTargets.count,
    optionDaily: optionDaily.count,
    listingDaily: listingDaily.count,
    accountKpi: accountKpi.count,
    snapshots: snapshots.count,
    runs: runs.count,
  };
}

async function postToServer(
  args: Args,
  payload: Record<string, unknown>,
): Promise<unknown> {
  return requestApi(args, '/api/ads/extension/sync', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

function apiUrl(args: Args): string {
  return value(args, 'api-url') ?? process.env.KIDITEM_API_URL ?? 'http://localhost:4000';
}

function apiHeaders(args: Args): Record<string, string> {
  const accessToken = value(args, 'access-token') ?? process.env.KIDITEM_API_ACCESS_TOKEN;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (!accessToken) {
    throw new Error(
      'API replay requires --access-token or KIDITEM_API_ACCESS_TOKEN. Dev header auth is removed.',
    );
  }
  headers.Authorization = accessToken.startsWith('Bearer ') ? accessToken : `Bearer ${accessToken}`;
  return headers;
}

async function requestApi(
  args: Args,
  route: string,
  init: RequestInit,
): Promise<unknown> {
  const response = await fetch(`${apiUrl(args).replace(/\/$/, '')}${route}`, {
    ...init,
    headers: {
      ...apiHeaders(args),
      ...(init.headers ?? {}),
    },
  });
  const json = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

function coupangImageSyncRowsFromPayload(body: Record<string, unknown>): CoupangImageSyncRow[] {
  const rawRows = Array.isArray(body.rows)
    ? body.rows
    : Array.isArray(body.data)
      ? body.data
      : null;
  if (!rawRows) {
    throw new Error('coupang_image_sync payload requires rows or data array.');
  }

  return rawRows.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new Error(`coupang_image_sync row ${index} must be an object.`);
    }
    const row = item as Record<string, unknown>;
    const inventoryId = typeof row.inventoryId === 'string' ? row.inventoryId.trim() : '';
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    const url = typeof row.url === 'string' ? row.url.trim() : '';
    const legacyCode =
      typeof row.legacyCode === 'string'
        ? row.legacyCode.trim()
        : row.legacyCode === null
          ? null
          : undefined;
    if (!inventoryId) throw new Error(`coupang_image_sync row ${index} is missing inventoryId.`);
    if (!name) throw new Error(`coupang_image_sync row ${index} is missing name.`);
    if (!url) throw new Error(`coupang_image_sync row ${index} is missing url.`);
    return { inventoryId, legacyCode, name, url };
  });
}

async function postCoupangImageSyncToServer(
  args: Args,
  body: Record<string, unknown>,
): Promise<unknown> {
  const rows = coupangImageSyncRowsFromPayload(body);
  const started = await requestApi(args, '/api/coupang-image-sync/from-rows', {
    method: 'POST',
    body: JSON.stringify({ rows }),
  }) as { jobId?: unknown };

  const jobId = typeof started.jobId === 'string' ? started.jobId : '';
  if (!jobId) return { started, rows: rows.length };
  if (bool(args, 'no-wait')) return { jobId, rows: rows.length, queued: true };

  const timeoutMs = Number(value(args, 'image-sync-timeout-ms') ?? 15 * 60 * 1000);
  const pollMs = Number(value(args, 'image-sync-poll-ms') ?? 1000);
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await sleep(pollMs);
    const status = await requestApi(
      args,
      `/api/coupang-image-sync/${encodeURIComponent(jobId)}`,
      { method: 'GET' },
    ) as { status?: unknown; error?: unknown };

    if (status.status === 'done') return { jobId, rows: rows.length, status };
    if (status.status === 'failed') {
      throw new Error(`Coupang image sync job failed: ${String(status.error ?? 'unknown')}`);
    }
  }

  throw new Error(`Coupang image sync job ${jobId} did not finish within ${timeoutMs}ms.`);
}

async function commandReplay(args: Args): Promise<unknown> {
  const datasetId = await resolveDatasetId(args);
  const bundleDir = localBundleDir(args, datasetId);
  const manifest = await loadManifest(bundleDir);
  await verifyBundle(bundleDir, manifest);

  const bodies = [];
  const sources = new Set<string>(manifest.scope?.sources ?? []);
  for (const payload of manifest.payloads) {
    const body = normalizePayload(payload, await readJson(path.join(bundleDir, payload.path)));
    bodies.push({ payload, body });
    sources.add(sourceForPayload(payload, body));
  }

  const mode = (value(args, 'mode') ?? manifest.defaultImportMode ?? 'scoped-replace') as ImportMode;
  if (!['upsert', 'scoped-replace', 'full-reset'].includes(mode)) {
    throw new Error(`Invalid replay mode: ${mode}`);
  }
  if (mode === 'full-reset') {
    throw new Error('full-reset is intentionally not automated. Reset Docker volume manually, then replay.');
  }

  if (bool(args, 'dry-run')) {
    return { datasetId, mode, payloads: bodies.length, sources: [...sources] };
  }

  let cleanup: unknown = null;
  if (mode === 'scoped-replace') {
    if (!bool(args, 'yes')) {
      throw new Error('scoped-replace requires --yes so the data replacement is explicit.');
    }
    const prisma = await createPrisma();
    try {
      const organizationId = await resolveOrganizationId(prisma, args, manifest);
      cleanup = {
        legacySeed: await cleanupLegacySeedRows(prisma, organizationId),
        scoped: await scopedReplace(prisma, organizationId, manifest, [...sources]),
      };
    } finally {
      await prisma.$disconnect();
    }
  }

  const results: ReplayResult[] = [];
  for (const { payload, body } of bodies) {
    try {
      const response =
        payload.type === 'coupang_image_sync'
          ? await postCoupangImageSyncToServer(args, body)
          : await postToServer(args, body);
      results.push({ payload: payload.path, type: payload.type, ok: true, response });
    } catch (error) {
      results.push({
        payload: payload.path,
        type: payload.type,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
      break;
    }
  }

  const report = {
    datasetId,
    mode,
    cleanup,
    results,
    replayedAt: new Date().toISOString(),
  };
  const reportPath = path.join(localDataRoot(args), `replay-report-${datasetId}.json`);
  await writeJson(reportPath, report);
  if (results.some((result) => !result.ok)) process.exitCode = 1;
  return { reportPath, ...report };
}

function sanitizeValue(key: string, valueToSanitize: unknown): unknown {
  if (Array.isArray(valueToSanitize)) return valueToSanitize.map((item) => sanitizeValue(key, item));
  if (valueToSanitize && typeof valueToSanitize === 'object') {
    return Object.fromEntries(
      Object.entries(valueToSanitize as Record<string, unknown>).map(([childKey, childValue]) => [
        childKey,
        sanitizeValue(childKey, childValue),
      ]),
    );
  }
  if (typeof valueToSanitize === 'string') {
    if (/url|href/i.test(key)) return '';
    if (/productName|campaignName|keyword|adGroup|seller|vendorName|brand/i.test(key)) {
      const suffix = createHash('sha1').update(valueToSanitize).digest('hex').slice(0, 8);
      return `DEMO-${suffix}`;
    }
  }
  return valueToSanitize;
}

async function commandSanitize(args: Args): Promise<unknown> {
  const datasetId = await resolveDatasetId(args);
  const sourceDir = localBundleDir(args, datasetId);
  const sourceManifest = await loadManifest(sourceDir);
  await verifyBundle(sourceDir, sourceManifest);

  const targetDataset = value(args, 'target-dataset') ?? `${datasetId}-demo`;
  assertSafeDatasetId(targetDataset);
  const targetDir = localBundleDir(args, targetDataset);
  await rm(targetDir, { recursive: true, force: true });
  await mkdir(targetDir, { recursive: true });

  const payloads: BundlePayload[] = [];
  const checksums: Record<string, string> = {};
  for (const payload of sourceManifest.payloads) {
    assertSafeRelativePath(payload.path);
    const sanitized = sanitizeValue(payload.path, await readJson(path.join(sourceDir, payload.path)));
    const targetPayload = payload.path.replace(/\.json$/, '.demo.json');
    await writeJson(path.join(targetDir, targetPayload), sanitized);
    const digest = await sha256(path.join(targetDir, targetPayload));
    payloads.push({ ...payload, path: targetPayload, sha256: digest });
    checksums[targetPayload] = digest;
  }

  const manifest: BundleManifest = {
    ...sourceManifest,
    datasetId: targetDataset,
    lane: 'demo',
    createdAt: new Date().toISOString(),
    description: `Sanitized demo copy of ${sourceManifest.datasetId}`,
    payloads,
    references: [],
    checksums,
  };
  await writeJson(path.join(targetDir, 'manifest.json'), manifest);
  return { sanitized: datasetId, targetDataset, targetDir };
}

async function exportCoupangImageSyncRowsFromDb(args: Args): Promise<{
  body: Record<string, unknown>;
  rowCount: number;
  sourceListingCount: number;
  skippedDuplicateInventoryId: number;
  skippedMissingSourceUrl: number;
}> {
  const prisma = await createPrisma();
  try {
    const organizationId = await resolveOrganizationId(prisma, args, {
      schemaVersion: SCHEMA_VERSION,
      datasetId: value(args, 'dataset') ?? 'image-sync-export',
      lane: lane(args),
      createdAt: new Date().toISOString(),
      payloads: [],
    });

    const listings = await prisma.channelListing.findMany({
      where: {
        organizationId,
        channel: 'coupang',
        isDeleted: false,
        master: {
          organizationId,
          isDeleted: false,
          sourcePlatform: 'coupang',
          sourceUrl: { not: null },
          images: {
            some: {
              organizationId,
              source: 'coupang-wing',
              isDeleted: false,
            },
          },
        },
      },
      orderBy: [{ externalId: 'asc' }, { id: 'asc' }],
      select: {
        externalId: true,
        channelName: true,
        master: {
          select: {
            name: true,
            legacyCode: true,
            sourceUrl: true,
            options: {
              where: {
                organizationId,
                isDeleted: false,
                isActive: true,
                legacyCode: { not: null },
              },
              orderBy: { updatedAt: 'desc' },
              take: 1,
              select: { legacyCode: true },
            },
          },
        },
      },
    });

    const { rows, skippedDuplicateInventoryId, skippedMissingSourceUrl } =
      buildCoupangImageSyncRowsForListings(listings);
    if (rows.length === 0 && !bool(args, 'allow-empty-image-sync')) {
      throw new Error('No replayable Coupang image sync rows found. Pass --allow-empty-image-sync to export an empty payload.');
    }

    return {
      body: {
        type: 'coupang_image_sync',
        source: 'wing_image_sync',
        timestamp: new Date().toISOString(),
        data: rows,
        meta: {
          exportedFrom: 'channel_listings',
          source: 'coupang-wing',
          sourceListingCount: listings.length,
          rowCount: rows.length,
          skippedDuplicateInventoryId,
          skippedMissingSourceUrl,
        },
      },
      rowCount: rows.length,
      sourceListingCount: listings.length,
      skippedDuplicateInventoryId,
      skippedMissingSourceUrl,
    };
  } finally {
    await prisma.$disconnect();
  }
}

async function commandExport(args: Args): Promise<unknown> {
  const datasetId = value(args, 'dataset');
  if (!datasetId) throw new Error('export requires --dataset');
  assertSafeDatasetId(datasetId);
  const laneValue = lane(args);
  const payloadFiles = [...values(args, 'payload')];
  const generatedPayloads: Array<{
    fileName: string;
    body: Record<string, unknown>;
    rowCount: number;
    description: string;
  }> = [];
  const payloadDir = value(args, 'payload-dir');
  if (payloadDir) {
    const entries = await readdir(expandHome(payloadDir));
    for (const entry of entries) {
      if (entry.endsWith('.json')) payloadFiles.push(path.join(expandHome(payloadDir), entry));
    }
  }
  if (bool(args, 'image-sync-from-db') || bool(args, 'include-image-sync-from-db')) {
    const exported = await exportCoupangImageSyncRowsFromDb(args);
    generatedPayloads.push({
      fileName: 'coupang-image-sync-from-db.json',
      body: exported.body,
      rowCount: exported.rowCount,
      description: `Replay rows derived from ${exported.sourceListingCount} image-ready Coupang ChannelListing rows`,
    });
  }
  const referenceFiles = [
    ...values(args, 'reference'),
    ...values(args, 'references'),
  ];
  for (const namedReference of ['kiditem-list', 'wing-inventory-matched']) {
    const inputFile = value(args, namedReference);
    if (inputFile) referenceFiles.push(inputFile);
  }
  for (const referenceDir of [...values(args, 'reference-dir'), ...values(args, 'references-dir')]) {
    const expandedReferenceDir = expandHome(referenceDir);
    const entries = await readdir(expandedReferenceDir);
    for (const entry of entries) {
      if (entry.startsWith('.')) continue;
      referenceFiles.push(path.join(expandedReferenceDir, entry));
    }
  }
  if (payloadFiles.length === 0 && generatedPayloads.length === 0) {
    throw new Error('export requires --payload or --payload-dir with JSON files.');
  }

  const targetDir = localBundleDir(args, datasetId);
  await rm(targetDir, { recursive: true, force: true });
  await mkdir(path.join(targetDir, 'payloads'), { recursive: true });

  const payloads: BundlePayload[] = [];
  const references: BundleReference[] = [];
  const checksums: Record<string, string> = {};
  const artifactPaths = new Set<string>();
  for (const inputFile of payloadFiles) {
    const absoluteInput = path.resolve(expandHome(inputFile));
    const fileStat = await stat(absoluteInput);
    if (!fileStat.isFile()) throw new Error(`Not a file: ${absoluteInput}`);
    const body = await readJson<Record<string, unknown> | unknown[]>(absoluteInput);
    const type = Array.isArray(body) ? value(args, 'type') : String((body as Record<string, unknown>).type ?? value(args, 'type') ?? '');
    if (!type) throw new Error(`Cannot infer payload type for ${absoluteInput}; pass --type.`);
    const targetPayload = path.join('payloads', path.basename(absoluteInput));
    if (artifactPaths.has(targetPayload)) throw new Error(`Duplicate bundle path: ${targetPayload}`);
    artifactPaths.add(targetPayload);
    await cp(absoluteInput, path.join(targetDir, targetPayload));
    const digest = await sha256(path.join(targetDir, targetPayload));
    const rowCount = Array.isArray(body)
      ? body.length
      : Array.isArray((body as Record<string, unknown>).data)
        ? ((body as { data: unknown[] }).data.length)
        : undefined;
    payloads.push({ path: targetPayload, type, sha256: digest, rowCount });
    checksums[targetPayload] = digest;
  }
  for (const generated of generatedPayloads) {
    const targetPayload = path.join('payloads', generated.fileName);
    if (artifactPaths.has(targetPayload)) throw new Error(`Duplicate bundle path: ${targetPayload}`);
    artifactPaths.add(targetPayload);
    await writeJson(path.join(targetDir, targetPayload), generated.body);
    const digest = await sha256(path.join(targetDir, targetPayload));
    payloads.push({
      path: targetPayload,
      type: String(generated.body.type),
      source: String(generated.body.source),
      description: generated.description,
      sha256: digest,
      rowCount: generated.rowCount,
    });
    checksums[targetPayload] = digest;
  }
  if (referenceFiles.length > 0) {
    await mkdir(path.join(targetDir, 'references'), { recursive: true });
  }
  for (const inputFile of referenceFiles) {
    const absoluteInput = path.resolve(expandHome(inputFile));
    const fileStat = await stat(absoluteInput);
    if (!fileStat.isFile()) throw new Error(`Not a file: ${absoluteInput}`);
    const targetReference = path.join('references', path.basename(absoluteInput));
    if (artifactPaths.has(targetReference)) throw new Error(`Duplicate bundle path: ${targetReference}`);
    artifactPaths.add(targetReference);
    await cp(absoluteInput, path.join(targetDir, targetReference));
    const digest = await sha256(path.join(targetDir, targetReference));
    references.push({
      path: targetReference,
      type: referenceTypeFor(absoluteInput),
      description: path.basename(absoluteInput),
      sha256: digest,
      bytes: fileStat.size,
    });
    checksums[targetReference] = digest;
  }

  const from = value(args, 'from');
  const to = value(args, 'to');
  if (!from || !to) {
    throw new Error('export requires --from and --to so scoped-replace has an explicit date range.');
  }
  const manifest: BundleManifest = {
    schemaVersion: SCHEMA_VERSION,
    datasetId,
    lane: laneValue,
    createdAt: new Date().toISOString(),
    defaultImportMode: 'scoped-replace',
    scope: {
      channel: 'coupang',
      businessDateFrom: from,
      businessDateTo: to,
    },
    payloads,
    references: references.length > 0 ? references : undefined,
    checksums,
  };
  await writeJson(path.join(targetDir, 'manifest.json'), manifest);
  return { exported: datasetId, targetDir, payloadCount: payloads.length, referenceCount: references.length };
}

export async function runCoupangDevData(rawArgs: string[]): Promise<unknown> {
  const args = parseArgs(rawArgs);
  switch (args.command) {
    case 'replay':
      return commandReplay(args);
    case 'sanitize':
      return commandSanitize(args);
    case 'export':
      return commandExport(args);
  }
  throw new Error(`Unsupported Coupang dev data command: ${args.command}`);
}
