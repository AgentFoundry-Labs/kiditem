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

const SCHEMA_VERSION = 'kiditem.dev-data.coupang.v1';
const LOCAL_DATA_ROOT = path.join('.data', 'coupang');
const LEGACY_MARKET_DATA_SEED = 'scripts/seed-channel-market-data';
const CANONICAL_DRIVE_FOLDER_URL =
  'https://drive.google.com/drive/folders/1sIuAiZAX6wAFOoEmmJGe6p0b5xwey1AO?usp=drive_link';

type Command = 'status' | 'pull' | 'replay' | 'sanitize' | 'export';
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

type BundleManifest = {
  schemaVersion: string;
  datasetId: string;
  lane: Lane;
  createdAt: string;
  description?: string;
  defaultImportMode?: ImportMode;
  scope?: {
    companyId?: string;
    channel?: 'coupang';
    businessDateFrom?: string;
    businessDateTo?: string;
    sources?: string[];
  };
  payloads: BundlePayload[];
  checksums?: Record<string, string>;
};

type ReplayResult = {
  payload: string;
  type: string;
  ok: boolean;
  response?: unknown;
  error?: string;
};

function parseArgs(): Args {
  const raw = process.argv.slice(2);
  const command = (raw.shift() ?? 'status') as Command;
  if (!['status', 'pull', 'replay', 'sanitize', 'export'].includes(command)) {
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

function driveRoot(args: Args): string {
  const root =
    value(args, 'drive-root') ?? process.env.KIDITEM_DEV_DATA_DRIVE_DIR;
  if (!root) {
    throw new Error(
      `Google Drive root is required. Open ${CANONICAL_DRIVE_FOLDER_URL}, sync it with Google Drive for Desktop, then set KIDITEM_DEV_DATA_DRIVE_DIR or pass --drive-root.`,
    );
  }
  return path.resolve(expandHome(root));
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
  if (explicit) return explicit;

  const localLatest = await readTextIfExists(path.join(localDataRoot(args), 'latest.txt'));
  if (localLatest) return localLatest;

  if (!required) return '';
  throw new Error('Dataset is required. Pass --dataset or pull a latest bundle first.');
}

function driveBundleDir(root: string, laneValue: Lane, datasetId: string): string {
  return path.join(root, `coupang-${laneValue}`, datasetId);
}

function localBundleDir(args: Args, datasetId: string): string {
  return path.join(localDataRoot(args), datasetId);
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

async function loadManifest(bundleDir: string): Promise<BundleManifest> {
  const manifest = await readJson<BundleManifest>(path.join(bundleDir, 'manifest.json'));
  if (manifest.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(
      `Unsupported schemaVersion ${manifest.schemaVersion}. Expected ${SCHEMA_VERSION}.`,
    );
  }
  if (!manifest.datasetId) throw new Error('manifest.datasetId is required');
  if (!Array.isArray(manifest.payloads) || manifest.payloads.length === 0) {
    throw new Error('manifest.payloads must contain at least one payload');
  }
  return manifest;
}

async function verifyBundle(bundleDir: string, manifest: BundleManifest): Promise<void> {
  for (const payload of manifest.payloads) {
    assertSafeRelativePath(payload.path);
    const file = path.join(bundleDir, payload.path);
    const expected = payload.sha256 ?? manifest.checksums?.[payload.path];
    if (!existsSync(file)) throw new Error(`Missing payload: ${payload.path}`);
    if (!expected) continue;
    const actual = await sha256(file);
    if (actual !== expected) {
      throw new Error(`Checksum mismatch for ${payload.path}: ${actual} != ${expected}`);
    }
  }
}

function sourceForPayload(payload: BundlePayload, body: Record<string, unknown>): string {
  if (payload.type === 'ad_campaign') return 'advertising';
  if (payload.type === 'traffic') return 'wing';
  if (payload.type === 'coupang_ads_daily') return 'coupang_ads';
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

async function resolveCompanyId(
  prisma: PrismaClient,
  args: Args,
  manifest: BundleManifest,
): Promise<string> {
  const explicit =
    value(args, 'company-id') ??
    manifest.scope?.companyId ??
    process.env.KIDITEM_DEV_COMPANY_ID;
  if (explicit) return explicit;

  const userId =
    value(args, 'dev-user-id') ??
    process.env.KIDITEM_DEV_USER_ID ??
    process.env.DEV_DEFAULT_USER_ID;
  if (userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { companyId: true },
    });
    if (user?.companyId) return user.companyId;
  }

  throw new Error(
    'Company scope is required. Pass --company-id, set KIDITEM_DEV_COMPANY_ID, or set a dev user env.',
  );
}

function parseBusinessDate(input: string | undefined, label: string): Date {
  if (!input || !/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    throw new Error(`${label} must be YYYY-MM-DD`);
  }
  return new Date(`${input}T00:00:00.000Z`);
}

async function cleanupLegacySeedRows(prisma: PrismaClient, companyId: string) {
  const account = await prisma.$executeRaw`
    DELETE FROM channel_account_daily_kpi_snapshots
    WHERE company_id = ${companyId}::uuid
      AND (
        normalized_json->>'seededBy' = ${LEGACY_MARKET_DATA_SEED}
        OR raw_json->>'seededBy' = ${LEGACY_MARKET_DATA_SEED}
      )
  `;
  const targets = await prisma.$executeRaw`
    DELETE FROM channel_ad_target_daily_snapshots
    WHERE company_id = ${companyId}::uuid
      AND meta_json->>'seededBy' = ${LEGACY_MARKET_DATA_SEED}
  `;
  const listing = await prisma.$executeRaw`
    DELETE FROM channel_listing_daily_snapshots
    WHERE company_id = ${companyId}::uuid
      AND meta_json->>'seededBy' = ${LEGACY_MARKET_DATA_SEED}
  `;
  const snapshots = await prisma.$executeRaw`
    DELETE FROM channel_scrape_snapshots
    WHERE company_id = ${companyId}::uuid
      AND normalized_json->>'seededBy' = ${LEGACY_MARKET_DATA_SEED}
  `;
  const runs = await prisma.$executeRaw`
    DELETE FROM channel_scrape_runs
    WHERE company_id = ${companyId}::uuid
      AND meta_json->>'seededBy' = ${LEGACY_MARKET_DATA_SEED}
  `;
  return { account, targets, listing, snapshots, runs };
}

async function scopedReplace(
  prisma: PrismaClient,
  companyId: string,
  manifest: BundleManifest,
  sources: string[],
) {
  const channel = manifest.scope?.channel ?? 'coupang';
  const from = parseBusinessDate(manifest.scope?.businessDateFrom, 'scope.businessDateFrom');
  const to = parseBusinessDate(manifest.scope?.businessDateTo, 'scope.businessDateTo');

  const adTargets = await prisma.channelAdTargetDailySnapshot.deleteMany({
    where: { companyId, channel, businessDate: { gte: from, lte: to } },
  });
  const optionDaily = await prisma.channelListingOptionDailySnapshot.deleteMany({
    where: { companyId, channel, businessDate: { gte: from, lte: to } },
  });
  const listingDaily = await prisma.channelListingDailySnapshot.deleteMany({
    where: { companyId, channel, businessDate: { gte: from, lte: to } },
  });
  const accountKpi = await prisma.channelAccountDailyKpiSnapshot.deleteMany({
    where: { companyId, channel, businessDate: { gte: from, lte: to } },
  });
  const snapshots = await prisma.channelScrapeSnapshot.deleteMany({
    where: {
      companyId,
      channel,
      source: { in: sources },
      businessDate: { gte: from, lte: to },
    },
  });
  const runs = await prisma.channelScrapeRun.deleteMany({
    where: {
      companyId,
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
  const apiUrl = value(args, 'api-url') ?? process.env.KIDITEM_API_URL ?? 'http://localhost:4000';
  const devUserId =
    value(args, 'dev-user-id') ??
    process.env.KIDITEM_DEV_USER_ID ??
    process.env.DEV_DEFAULT_USER_ID;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (devUserId) headers['x-dev-user-id'] = devUserId;

  const response = await fetch(`${apiUrl.replace(/\/$/, '')}/api/ads/extension/sync`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

async function commandStatus(args: Args): Promise<void> {
  const root = localDataRoot(args);
  await mkdir(root, { recursive: true });
  const latest = await readTextIfExists(path.join(root, 'latest.txt'));
  const configuredDriveRoot =
    value(args, 'drive-root') ?? process.env.KIDITEM_DEV_DATA_DRIVE_DIR ?? null;
  const dirs = (await readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  console.log(JSON.stringify({
    root,
    latest,
    datasets: dirs,
    canonicalDriveFolderUrl: CANONICAL_DRIVE_FOLDER_URL,
    configuredDriveRoot,
  }, null, 2));
}

async function commandPull(args: Args): Promise<void> {
  const laneValue = lane(args);
  const root = driveRoot(args);
  const datasetId =
    value(args, 'dataset') ??
    (await readTextIfExists(path.join(root, `coupang-${laneValue}`, 'latest.txt')));
  if (!datasetId) {
    throw new Error(`No dataset provided and no latest.txt in coupang-${laneValue}`);
  }

  const source = driveBundleDir(root, laneValue, datasetId);
  const target = localBundleDir(args, datasetId);
  if (!existsSync(source)) throw new Error(`Drive bundle not found: ${source}`);
  await rm(target, { recursive: true, force: true });
  await mkdir(path.dirname(target), { recursive: true });
  await cp(source, target, { recursive: true });

  const manifest = await loadManifest(target);
  await verifyBundle(target, manifest);
  await writeFile(path.join(localDataRoot(args), 'latest.txt'), `${datasetId}\n`, 'utf8');
  console.log(JSON.stringify({ pulled: datasetId, lane: laneValue, from: source, to: target }, null, 2));
}

async function commandReplay(args: Args): Promise<void> {
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
    console.log(JSON.stringify({ datasetId, mode, payloads: bodies.length, sources: [...sources] }, null, 2));
    return;
  }

  let cleanup: unknown = null;
  if (mode === 'scoped-replace') {
    if (!bool(args, 'yes')) {
      throw new Error('scoped-replace requires --yes so the data replacement is explicit.');
    }
    const prisma = await createPrisma();
    try {
      const companyId = await resolveCompanyId(prisma, args, manifest);
      cleanup = {
        legacySeed: await cleanupLegacySeedRows(prisma, companyId),
        scoped: await scopedReplace(prisma, companyId, manifest, [...sources]),
      };
    } finally {
      await prisma.$disconnect();
    }
  }

  const results: ReplayResult[] = [];
  for (const { payload, body } of bodies) {
    try {
      const response = await postToServer(args, body);
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
  console.log(JSON.stringify({ reportPath, ...report }, null, 2));
  if (results.some((result) => !result.ok)) process.exitCode = 1;
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

async function commandSanitize(args: Args): Promise<void> {
  const datasetId = await resolveDatasetId(args);
  const sourceDir = localBundleDir(args, datasetId);
  const sourceManifest = await loadManifest(sourceDir);
  await verifyBundle(sourceDir, sourceManifest);

  const targetDataset = value(args, 'target-dataset') ?? `${datasetId}-demo`;
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
    checksums,
  };
  await writeJson(path.join(targetDir, 'manifest.json'), manifest);
  console.log(JSON.stringify({ sanitized: datasetId, targetDataset, targetDir }, null, 2));
}

async function commandExport(args: Args): Promise<void> {
  const datasetId = value(args, 'dataset');
  if (!datasetId) throw new Error('export requires --dataset');
  const laneValue = lane(args);
  const payloadFiles = [...values(args, 'payload')];
  const payloadDir = value(args, 'payload-dir');
  if (payloadDir) {
    const entries = await readdir(expandHome(payloadDir));
    for (const entry of entries) {
      if (entry.endsWith('.json')) payloadFiles.push(path.join(expandHome(payloadDir), entry));
    }
  }
  if (payloadFiles.length === 0) {
    throw new Error('export requires --payload or --payload-dir with JSON files.');
  }

  const targetDir = localBundleDir(args, datasetId);
  await rm(targetDir, { recursive: true, force: true });
  await mkdir(path.join(targetDir, 'payloads'), { recursive: true });

  const payloads: BundlePayload[] = [];
  const checksums: Record<string, string> = {};
  for (const inputFile of payloadFiles) {
    const absoluteInput = path.resolve(expandHome(inputFile));
    const fileStat = await stat(absoluteInput);
    if (!fileStat.isFile()) throw new Error(`Not a file: ${absoluteInput}`);
    const body = await readJson<Record<string, unknown> | unknown[]>(absoluteInput);
    const type = Array.isArray(body) ? value(args, 'type') : String((body as Record<string, unknown>).type ?? value(args, 'type') ?? '');
    if (!type) throw new Error(`Cannot infer payload type for ${absoluteInput}; pass --type.`);
    const targetPayload = path.join('payloads', path.basename(absoluteInput));
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
    checksums,
  };
  await writeJson(path.join(targetDir, 'manifest.json'), manifest);
  console.log(JSON.stringify({ exported: datasetId, targetDir, payloadCount: payloads.length }, null, 2));
}

async function main(): Promise<void> {
  const args = parseArgs();
  switch (args.command) {
    case 'status':
      await commandStatus(args);
      break;
    case 'pull':
      await commandPull(args);
      break;
    case 'replay':
      await commandReplay(args);
      break;
    case 'sanitize':
      await commandSanitize(args);
      break;
    case 'export':
      await commandExport(args);
      break;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
