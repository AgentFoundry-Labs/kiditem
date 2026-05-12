#!/usr/bin/env tsx
import 'dotenv/config';

import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import {
  bool,
  parseRawArgs,
  pushValue,
  requiredValue,
  value,
  type ParsedArgs,
} from './_shared/cli-args';
import { fileSize, readJson, sha256, writeJson } from './_shared/fs';

const execFileAsync = promisify(execFile);

export const STAGING_DB_BASELINE_SCHEMA_VERSION = 'kiditem.staging-db-baseline.v1';
const DEFAULT_OBJECT_PREFIX = 'staging-db-baselines';
const DEFAULT_OUTPUT_ROOT = path.join('.data', 'staging-db-baseline');
const DUMP_FILE_NAME = 'public.dump.pgcustom';
const MANIFEST_FILE_NAME = 'manifest.json';
const CHECKSUMS_FILE_NAME = 'checksums.sha256';
const RESTORE_CONFIRMATION = 'RESET_STAGING_DB';
export const PUBLIC_SCHEMA_RESET_SQL = `
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
`;
export const PUBLIC_SCHEMA_GRANTS_SQL = `
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
    EXECUTE 'ALTER SCHEMA public OWNER TO postgres';
    EXECUTE 'GRANT ALL ON SCHEMA public TO postgres';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA public TO anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA public TO authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT ALL ON SCHEMA public TO service_role';
  END IF;
END $$;
`;

const COMMANDS = ['status', 'export', 'export-baseline', 'verify', 'restore', 'restore-baseline', 'help'] as const;
type Command = (typeof COMMANDS)[number];

type CliArgs = ParsedArgs<Command>;

export type BaselineObjectKeys = {
  dump: string;
  manifest: string;
  checksums: string;
};

export type BaselineManifest = {
  schemaVersion: typeof STAGING_DB_BASELINE_SCHEMA_VERSION;
  environment: 'staging';
  profileId: string;
  schemaGitSha: string;
  prismaSchemaHash: string;
  createdAt: string;
  sanitized: boolean;
  dump: {
    path: string;
    sha256: string;
    bytes: number;
    format: 'pgcustom';
  };
  rowCounts: Record<string, number>;
  excludedSchemas: string[];
  notes: string;
};

export type BaselineManifestExpectation = {
  profileId?: string;
  dumpPath?: string;
};

type S3Config = {
  bucket: string;
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
};

type VerifiedBaseline = {
  manifest: BaselineManifest;
  outputDir: string;
  dumpPath: string;
  checksums: Record<string, string>;
};

function parseArgs(argv = process.argv.slice(2)): CliArgs {
  return parseRawArgs(argv, { commands: COMMANDS, defaultCommand: 'status' });
}

export function safeProfileId(input: string): string {
  const profileId = input.trim();
  if (profileId === 'latest') {
    throw new Error('Use a pinned profileId, not "latest".');
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(profileId)) {
    throw new Error(`Unsafe profileId: ${input}`);
  }
  return profileId;
}

function normalizeObjectPrefix(input = DEFAULT_OBJECT_PREFIX): string {
  const trimmed = input.trim().replace(/^\/+|\/+$/g, '');
  if (!trimmed) throw new Error('Object prefix cannot be empty.');
  for (const segment of trimmed.split('/')) safeProfileId(segment);
  return trimmed;
}

export function baselineObjectKeys(
  profileIdInput: string,
  objectPrefix = DEFAULT_OBJECT_PREFIX,
): BaselineObjectKeys {
  const profileId = safeProfileId(profileIdInput);
  const prefix = normalizeObjectPrefix(objectPrefix);
  const base = `${prefix}/${profileId}`;
  return {
    dump: `${base}/${DUMP_FILE_NAME}`,
    manifest: `${base}/${MANIFEST_FILE_NAME}`,
    checksums: `${base}/${CHECKSUMS_FILE_NAME}`,
  };
}

export function buildChecksumsFile(checksums: Record<string, string>): string {
  return Object.entries(checksums)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([file, digest]) => `${digest}  ${file}`)
    .join('\n')
    .concat('\n');
}

export function parseChecksumsFile(contents: string): Record<string, string> {
  const checksums: Record<string, string> = {};
  for (const rawLine of contents.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = line.match(/^([a-fA-F0-9]{64})\s+(.+)$/);
    if (!match) throw new Error(`Malformed checksum line: ${rawLine}`);
    checksums[match[2]] = match[1].toLowerCase();
  }
  return checksums;
}

export function validateBaselineManifest(
  input: unknown,
  expectation: BaselineManifestExpectation = {},
): BaselineManifest {
  if (!input || typeof input !== 'object') throw new Error('manifest must be an object');
  const manifest = input as BaselineManifest;
  if (manifest.schemaVersion !== STAGING_DB_BASELINE_SCHEMA_VERSION) {
    throw new Error(`Unsupported manifest schemaVersion: ${String(manifest.schemaVersion)}`);
  }
  if (manifest.environment !== 'staging') throw new Error('manifest.environment must be staging');
  safeProfileId(manifest.profileId);
  if (expectation.profileId && manifest.profileId !== expectation.profileId) {
    throw new Error(`manifest.profileId must match ${expectation.profileId}`);
  }
  if (!manifest.schemaGitSha) throw new Error('manifest.schemaGitSha is required');
  assertSha256(manifest.prismaSchemaHash, 'manifest.prismaSchemaHash');
  if (!Date.parse(manifest.createdAt)) throw new Error('manifest.createdAt must be an ISO timestamp');
  if (manifest.sanitized !== true) throw new Error('manifest.sanitized must be true');
  if (!manifest.dump || typeof manifest.dump !== 'object') throw new Error('manifest.dump is required');
  if (!manifest.dump.path.endsWith(`/${DUMP_FILE_NAME}`)) throw new Error('manifest.dump.path must point to public.dump.pgcustom');
  if (!manifest.dump.path.endsWith(`/${manifest.profileId}/${DUMP_FILE_NAME}`)) {
    throw new Error('manifest.dump.path must include the manifest.profileId');
  }
  if (expectation.dumpPath && manifest.dump.path !== expectation.dumpPath) {
    throw new Error(`manifest.dump.path must match ${expectation.dumpPath}`);
  }
  assertSha256(manifest.dump.sha256, 'manifest.dump.sha256');
  if (!Number.isFinite(manifest.dump.bytes) || manifest.dump.bytes < 0) {
    throw new Error('manifest.dump.bytes must be a non-negative number');
  }
  if (manifest.dump.format !== 'pgcustom') throw new Error('manifest.dump.format must be pgcustom');
  if (!manifest.rowCounts || typeof manifest.rowCounts !== 'object') {
    throw new Error('manifest.rowCounts is required');
  }
  if (!Array.isArray(manifest.excludedSchemas) || !manifest.excludedSchemas.includes('auth') || !manifest.excludedSchemas.includes('storage')) {
    throw new Error('manifest.excludedSchemas must include auth and storage');
  }
  return manifest;
}

function assertSha256(valueToCheck: unknown, label: string): void {
  if (typeof valueToCheck !== 'string' || !/^[a-f0-9]{64}$/i.test(valueToCheck)) {
    throw new Error(`${label} must be a 64-char sha256 hex digest`);
  }
}

export function assertRestoreConfirmation(confirm: string | undefined): void {
  if (confirm !== RESTORE_CONFIRMATION) {
    throw new Error(`Restore requires --confirm ${RESTORE_CONFIRMATION}`);
  }
}

export function assertSanitizedExportAcknowledged(sanitized: string | undefined): void {
  if (sanitized !== 'true') {
    throw new Error('Export requires --sanitized true to acknowledge the baseline contains no production/customer raw data.');
  }
}

export function isDefinitelyProductionDatabaseUrl(databaseUrl: string): boolean {
  try {
    const url = new URL(databaseUrl);
    return /\bprod(?:uction)?\b/i.test(`${url.hostname} ${url.pathname}`);
  } catch {
    return /\bprod(?:uction)?\b/i.test(databaseUrl);
  }
}

function repoRoot(): string {
  return path.resolve(__dirname, '..');
}

function outputDirFor(profileId: string, args: CliArgs): string {
  return path.resolve(
    repoRoot(),
    value(args, 'output-dir') ?? path.join(DEFAULT_OUTPUT_ROOT, safeProfileId(profileId)),
  );
}

async function removeKnownOutputFiles(...files: string[]): Promise<void> {
  for (const file of files) {
    try {
      await unlink(file);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code !== 'ENOENT') throw error;
    }
  }
}

async function prismaSchemaHash(): Promise<string> {
  const root = repoRoot();
  const files = [
    'prisma/schema.prisma',
    'prisma.config.ts',
    ...(await readdir(path.join(root, 'prisma/models')))
      .filter((name) => name.endsWith('.prisma'))
      .sort()
      .map((name) => `prisma/models/${name}`),
  ];
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(file);
    hash.update('\0');
    hash.update(await readFile(path.join(root, file)));
    hash.update('\0');
  }
  return hash.digest('hex');
}

async function gitSha(): Promise<string> {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot() });
  return stdout.trim();
}

function databaseUrl(args: CliArgs): string | null {
  return value(args, 'database-url') ?? process.env.DATABASE_URL ?? null;
}

async function publicTableNames(dbUrl: string): Promise<string[]> {
  const query = `
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `;
  const { stdout } = await execFileAsync('psql', [dbUrl, '-X', '-A', '-t', '-c', query], {
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

async function publicRowCounts(dbUrl: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const tableName of await publicTableNames(dbUrl)) {
    const { stdout } = await execFileAsync(
      'psql',
      [dbUrl, '-X', '-A', '-t', '-c', `SELECT count(*)::bigint FROM public.${quoteIdent(tableName)};`],
      { maxBuffer: 1024 * 1024 },
    );
    counts[tableName] = Number(stdout.trim());
  }
  return counts;
}

function quoteIdent(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function s3ConfigFromEnv(): S3Config {
  const bucket = process.env.STAGING_DB_BASELINE_BUCKET;
  const endpoint = process.env.STAGING_DB_BASELINE_S3_ENDPOINT;
  const region = process.env.STAGING_DB_BASELINE_S3_REGION || process.env.S3_REGION || 'ap-northeast-2';
  const accessKeyId = process.env.STAGING_DB_BASELINE_S3_ACCESS_KEY;
  const secretAccessKey = process.env.STAGING_DB_BASELINE_S3_SECRET_KEY;

  const missing = [
    ['STAGING_DB_BASELINE_BUCKET', bucket],
    ['STAGING_DB_BASELINE_S3_ENDPOINT', endpoint],
    ['STAGING_DB_BASELINE_S3_ACCESS_KEY', accessKeyId],
    ['STAGING_DB_BASELINE_S3_SECRET_KEY', secretAccessKey],
  ]
    .filter(([, val]) => !val)
    .map(([name]) => name);
  if (missing.length > 0) throw new Error(`Missing Supabase Storage S3 env: ${missing.join(', ')}`);

  return {
    bucket: bucket!,
    endpoint: endpoint!,
    region,
    accessKeyId: accessKeyId!,
    secretAccessKey: secretAccessKey!,
  };
}

function createS3Client(config: S3Config): S3Client {
  const clientConfig: S3ClientConfig = {
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  };
  return new S3Client(clientConfig);
}

async function objectExists(s3: S3Client, bucket: string, key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (error) {
    const name = (error as { name?: string }).name;
    if (name === 'NotFound' || name === 'NoSuchKey' || name === 'NotFoundError') return false;
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 404) return false;
    throw error;
  }
}

async function uploadFile(s3: S3Client, bucket: string, key: string, file: string, contentType: string): Promise<void> {
  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: createReadStream(file),
    ContentType: contentType,
  }));
}

async function downloadObject(s3: S3Client, bucket: string, key: string, file: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const body = response.Body;
  if (!(body instanceof Readable)) throw new Error(`Unexpected S3 response body for ${key}`);
  await pipeline(body, createWriteStream(file));
}

async function runPgDump(dbUrl: string, dumpPath: string): Promise<void> {
  await mkdir(path.dirname(dumpPath), { recursive: true });
  await execFileAsync('pg_dump', [
    dbUrl,
    '--format=custom',
    '--no-owner',
    '--no-privileges',
    '--schema=public',
    '--file',
    dumpPath,
  ], { maxBuffer: 10 * 1024 * 1024 });
}

async function runPgRestore(dbUrl: string, dumpPath: string): Promise<void> {
  await resetPublicSchema(dbUrl);
  await execFileAsync('pg_restore', [
    '--exit-on-error',
    '--single-transaction',
    '--clean',
    '--if-exists',
    '--no-owner',
    '--no-privileges',
    '--schema=public',
    '--dbname',
    dbUrl,
    dumpPath,
  ], { maxBuffer: 10 * 1024 * 1024 });
  await ensurePublicSchemaGrants(dbUrl);
}

async function resetPublicSchema(dbUrl: string): Promise<void> {
  await execFileAsync('psql', [
    dbUrl,
    '-X',
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    PUBLIC_SCHEMA_RESET_SQL,
  ], { maxBuffer: 10 * 1024 * 1024 });
  await ensurePublicSchemaGrants(dbUrl);
}

async function ensurePublicSchemaGrants(dbUrl: string): Promise<void> {
  await execFileAsync('psql', [
    dbUrl,
    '-X',
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    PUBLIC_SCHEMA_GRANTS_SQL,
  ], { maxBuffer: 10 * 1024 * 1024 });
}

async function writeCurrentDbRecord(manifest: BaselineManifest, recordDirInput?: string): Promise<string | null> {
  const recordDir = recordDirInput ?? process.env.STAGING_DB_BASELINE_RECORD_DIR;
  if (!recordDir) return null;
  const resolved = path.resolve(recordDir);
  const historyDir = path.join(resolved, 'db-history');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const historyPath = path.join(historyDir, `${stamp}-${manifest.profileId}.json`);
  const currentPath = path.join(resolved, 'current-db.json');
  await writeJson(historyPath, manifest);
  await writeJson(currentPath, manifest);
  return currentPath;
}

async function commandStatus(args: CliArgs): Promise<void> {
  const dbUrl = databaseUrl(args);
  const rowCounts = dbUrl && !bool(args, 'skip-db') ? await publicRowCounts(dbUrl) : null;
  const report = {
    schemaVersion: 'kiditem.staging-db-status.v1',
    environment: 'staging',
    schemaGitSha: await gitSha(),
    prismaSchemaHash: await prismaSchemaHash(),
    rowCounts,
    checkedAt: new Date().toISOString(),
  };
  console.log(JSON.stringify(report, null, 2));
}

async function commandExport(args: CliArgs): Promise<void> {
  const profileId = safeProfileId(requiredValue(args, 'profile-id', 'STAGING_DB_BASELINE_PROFILE_ID'));
  const dbUrl = requiredDatabaseUrl(args);
  assertNonProductionTarget(dbUrl, args);
  assertSanitizedExportAcknowledged(value(args, 'sanitized') ?? process.env.STAGING_DB_BASELINE_SANITIZED);

  const objectPrefix = value(args, 'object-prefix') || process.env.STAGING_DB_BASELINE_PREFIX || DEFAULT_OBJECT_PREFIX;
  const keys = baselineObjectKeys(profileId, objectPrefix);
  const outputDir = outputDirFor(profileId, args);
  const dumpPath = path.join(outputDir, DUMP_FILE_NAME);
  const manifestPath = path.join(outputDir, MANIFEST_FILE_NAME);
  const checksumsPath = path.join(outputDir, CHECKSUMS_FILE_NAME);
  await mkdir(outputDir, { recursive: true });
  await removeKnownOutputFiles(dumpPath, manifestPath, checksumsPath);

  const s3Config = s3ConfigFromEnv();
  const s3 = createS3Client(s3Config);
  for (const [label, key] of Object.entries(keys)) {
    if (await objectExists(s3, s3Config.bucket, key)) {
      throw new Error(`Baseline profile already has a ${label} object in storage: ${key}`);
    }
  }

  await runPgDump(dbUrl, dumpPath);
  const manifest: BaselineManifest = {
    schemaVersion: STAGING_DB_BASELINE_SCHEMA_VERSION,
    environment: 'staging',
    profileId,
    schemaGitSha: await gitSha(),
    prismaSchemaHash: await prismaSchemaHash(),
    createdAt: new Date().toISOString(),
    sanitized: true,
    dump: {
      path: keys.dump,
      sha256: await sha256(dumpPath),
      bytes: await fileSize(dumpPath),
      format: 'pgcustom',
    },
    rowCounts: await publicRowCounts(dbUrl),
    excludedSchemas: ['auth', 'storage'],
    notes: 'public schema only; Supabase auth/storage schemas are excluded and must be bootstrapped separately.',
  };
  await writeJson(manifestPath, manifest);

  const checksums = {
    [keys.dump]: manifest.dump.sha256,
    [keys.manifest]: await sha256(manifestPath),
  };
  await writeFile(checksumsPath, buildChecksumsFile(checksums), 'utf8');

  await uploadFile(s3, s3Config.bucket, keys.dump, dumpPath, 'application/octet-stream');
  await uploadFile(s3, s3Config.bucket, keys.checksums, checksumsPath, 'text/plain; charset=utf-8');
  await uploadFile(s3, s3Config.bucket, keys.manifest, manifestPath, 'application/json');

  const recordPath = await writeCurrentDbRecord(manifest, value(args, 'record-dir'));
  console.log(JSON.stringify({
    exported: profileId,
    bucket: s3Config.bucket,
    keys,
    outputDir,
    currentDbRecord: recordPath,
    manifest,
  }, null, 2));
}

async function verifyBaseline(args: CliArgs): Promise<VerifiedBaseline> {
  const profileId = safeProfileId(requiredValue(args, 'profile-id', 'STAGING_DB_BASELINE_PROFILE_ID'));
  const objectPrefix = value(args, 'object-prefix') || process.env.STAGING_DB_BASELINE_PREFIX || DEFAULT_OBJECT_PREFIX;
  const keys = baselineObjectKeys(profileId, objectPrefix);
  const outputDir = outputDirFor(profileId, args);
  const manifestPath = path.join(outputDir, MANIFEST_FILE_NAME);
  const checksumsPath = path.join(outputDir, CHECKSUMS_FILE_NAME);
  const dumpPath = path.join(outputDir, DUMP_FILE_NAME);
  await mkdir(outputDir, { recursive: true });
  await removeKnownOutputFiles(manifestPath, checksumsPath, dumpPath);

  const s3Config = s3ConfigFromEnv();
  const s3 = createS3Client(s3Config);

  await downloadObject(s3, s3Config.bucket, keys.manifest, manifestPath);
  await downloadObject(s3, s3Config.bucket, keys.checksums, checksumsPath);
  await downloadObject(s3, s3Config.bucket, keys.dump, dumpPath);

  const manifest = validateBaselineManifest(await readJson<unknown>(manifestPath), {
    profileId,
    dumpPath: keys.dump,
  });
  const checksums = parseChecksumsFile(await readFile(checksumsPath, 'utf8'));
  const manifestSha = await sha256(manifestPath);
  const expectedManifestSha = checksums[keys.manifest];
  if (!expectedManifestSha) {
    throw new Error(`Checksum file is missing manifest entry: ${keys.manifest}`);
  }
  if (expectedManifestSha !== manifestSha) {
    throw new Error(`Manifest checksum mismatch: ${manifestSha} != ${expectedManifestSha}`);
  }
  const dumpSha = await sha256(dumpPath);
  if (manifest.dump.sha256 !== dumpSha) {
    throw new Error(`Dump checksum mismatch: ${dumpSha} != ${manifest.dump.sha256}`);
  }
  const expectedDumpSha = checksums[keys.dump];
  if (!expectedDumpSha) {
    throw new Error(`Checksum file is missing dump entry: ${keys.dump}`);
  }
  if (expectedDumpSha !== dumpSha) {
    throw new Error(`Dump checksum file mismatch: ${dumpSha} != ${expectedDumpSha}`);
  }
  return { manifest, outputDir, dumpPath, checksums };
}

async function commandVerify(args: CliArgs): Promise<void> {
  const verified = await verifyBaseline(args);
  console.log(JSON.stringify({
    verified: verified.manifest.profileId,
    outputDir: verified.outputDir,
    dumpPath: verified.dumpPath,
    manifest: verified.manifest,
  }, null, 2));
}

async function commandRestore(args: CliArgs): Promise<void> {
  assertRestoreConfirmation(value(args, 'confirm'));
  const dbUrl = requiredDatabaseUrl(args);
  assertNonProductionTarget(dbUrl, args);
  const verified = await verifyBaseline(args);
  await runPgRestore(dbUrl, verified.dumpPath);
  const rowCounts = await publicRowCounts(dbUrl);
  const restoredManifest: BaselineManifest = {
    ...verified.manifest,
    rowCounts,
    notes: `${verified.manifest.notes} Restored at ${new Date().toISOString()}.`,
  };
  const recordPath = await writeCurrentDbRecord(restoredManifest, value(args, 'record-dir'));
  console.log(JSON.stringify({
    restored: verified.manifest.profileId,
    outputDir: verified.outputDir,
    currentDbRecord: recordPath,
    rowCounts,
  }, null, 2));
}

function requiredDatabaseUrl(args: CliArgs): string {
  const resolved = databaseUrl(args);
  if (!resolved) throw new Error('Missing DATABASE_URL or --database-url');
  return resolved;
}

function assertNonProductionTarget(dbUrl: string, args: CliArgs): void {
  const target = value(args, 'target') ?? process.env.STAGING_DB_BASELINE_TARGET;
  if (target !== 'staging') {
    throw new Error('Set --target staging or STAGING_DB_BASELINE_TARGET=staging before mutating a database.');
  }
  if (isDefinitelyProductionDatabaseUrl(dbUrl)) {
    throw new Error('Refusing to operate on a database URL that looks like production.');
  }
}

function printHelp(): void {
  console.log(`Usage:
  tsx scripts/staging-db-baseline.ts status [--skip-db]
  tsx scripts/staging-db-baseline.ts export --profile-id <pinned-id> --target staging --sanitized true
  tsx scripts/staging-db-baseline.ts verify --profile-id <pinned-id>
  tsx scripts/staging-db-baseline.ts restore --profile-id <pinned-id> --target staging --confirm ${RESTORE_CONFIRMATION}

Required env for storage:
  STAGING_DB_BASELINE_BUCKET
  STAGING_DB_BASELINE_S3_ENDPOINT
  STAGING_DB_BASELINE_S3_REGION
  STAGING_DB_BASELINE_S3_ACCESS_KEY
  STAGING_DB_BASELINE_S3_SECRET_KEY

Required env for DB operations:
  DATABASE_URL
`);
}

async function main(): Promise<void> {
  const args = parseArgs();
  switch (args.command) {
    case 'help':
      printHelp();
      return;
    case 'status':
      await commandStatus(args);
      return;
    case 'export':
    case 'export-baseline':
      await commandExport(args);
      return;
    case 'verify':
      await commandVerify(args);
      return;
    case 'restore':
    case 'restore-baseline':
      await commandRestore(args);
      return;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
