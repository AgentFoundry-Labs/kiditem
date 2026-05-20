#!/usr/bin/env tsx
import 'dotenv/config';

import {
  CopyObjectCommand,
  type CopyObjectCommandInput,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'node:url';
import {
  bool,
  parseRawArgs,
  value,
  values,
  type ParsedArgs,
} from './_shared/cli-args';

export const APPLY_STORAGE_CACHE_CONTROL_CONFIRMATION = 'APPLY_STORAGE_CACHE_CONTROL';
export const DEFAULT_CACHE_CONTROL_SECONDS = '31536000';
export const DEFAULT_STORAGE_CACHE_CONTROL_PREFIXES = Object.freeze([
  'thumbnail-generations',
  'thumbnail-inputs',
  'product-images',
  'detail-page-hero-banners',
  'detail-page-hero-products',
  'detail-page-section-images',
  'detail-page-size-guides',
  'content-assets',
]);

const COMMANDS = ['status', 'apply', 'help'] as const;
const IMAGE_EXTENSIONS = new Set(['.avif', '.gif', '.heic', '.heif', '.jpeg', '.jpg', '.png', '.webp']);
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_CONCURRENCY = 2;

type Command = (typeof COMMANDS)[number];
type Driver = 'auto' | 's3' | 'supabase';
type ResolvedDriver = Exclude<Driver, 'auto'>;
type CliArgs = ParsedArgs<Command>;

export type StorageObjectCandidate = {
  key: string;
  size: number;
  contentType?: string | null;
  cacheControl?: string | null;
  contentDisposition?: string | null;
  contentEncoding?: string | null;
  contentLanguage?: string | null;
  expires?: Date;
  metadata?: Record<string, string>;
};

type CliConfig = {
  command: Command;
  bucket: string;
  prefixes: string[];
  prefixSet: Set<string>;
  cacheControlSeconds: string;
  s3CacheControl: string;
  driver: Driver;
  maxObjects: number | null;
  concurrency: number;
  pageSize: number;
  target: string | null;
  confirm: string | null;
  includeNonImages: boolean;
  supabaseUrl: string | null;
  supabaseKey: string | null;
  s3: S3Config | null;
};

type S3Config = {
  bucket: string;
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
};

type ApplyResult = {
  scanned: number;
  eligible: number;
  skipped: number;
  updated: number;
  failed: number;
};

export function normalizeStoragePrefix(raw: string): string {
  const prefix = raw
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .join('/');
  if (!prefix || prefix.split('/').some((part) => part === '.' || part === '..')) {
    throw new Error(`Invalid storage prefix: ${raw}`);
  }
  return prefix;
}

export function s3CacheControlHeader(seconds: string): string {
  return `public, max-age=${seconds}, immutable`;
}

export function isEligibleStorageObject(
  object: Pick<StorageObjectCandidate, 'key' | 'size' | 'contentType'>,
  prefixes: ReadonlySet<string>,
): boolean {
  if (!Number.isFinite(object.size) || object.size <= 0) return false;
  if (!prefixes.has(topLevelPrefix(object.key))) return false;
  const contentType = object.contentType?.toLowerCase() ?? '';
  if (contentType.startsWith('image/')) return true;
  return IMAGE_EXTENSIONS.has(fileExtension(object.key));
}

export function summarizeStorageObjects(objects: readonly StorageObjectCandidate[]): Array<{
  prefix: string;
  objects: number;
  bytes: number;
}> {
  const byPrefix = new Map<string, { prefix: string; objects: number; bytes: number }>();
  for (const object of objects) {
    const prefix = topLevelPrefix(object.key);
    const current = byPrefix.get(prefix) ?? { prefix, objects: 0, bytes: 0 };
    current.objects += 1;
    current.bytes += object.size;
    byPrefix.set(prefix, current);
  }
  return [...byPrefix.values()].sort((a, b) => b.bytes - a.bytes || a.prefix.localeCompare(b.prefix));
}

export function buildCopyObjectInput(input: {
  bucket: string;
  object: StorageObjectCandidate;
  cacheControl: string;
}): CopyObjectCommandInput {
  return {
    Bucket: input.bucket,
    Key: input.object.key,
    CopySource: copySource(input.bucket, input.object.key),
    MetadataDirective: 'REPLACE',
    CacheControl: input.cacheControl,
    ContentType: input.object.contentType ?? undefined,
    ContentDisposition: input.object.contentDisposition ?? undefined,
    ContentEncoding: input.object.contentEncoding ?? undefined,
    ContentLanguage: input.object.contentLanguage ?? undefined,
    Expires: input.object.expires,
    Metadata: input.object.metadata,
  };
}

function parseArgs(argv = process.argv.slice(2)): CliArgs {
  return parseRawArgs(argv, { commands: COMMANDS, defaultCommand: 'status' });
}

function resolveConfig(args: CliArgs): CliConfig {
  const bucket = value(args, 'bucket') ?? process.env.STORAGE_CACHE_CONTROL_BUCKET ?? process.env.S3_BUCKET;
  if (!bucket) {
    throw new Error('Missing --bucket, STORAGE_CACHE_CONTROL_BUCKET, or S3_BUCKET.');
  }

  const rawPrefixes =
    values(args, 'prefix').length > 0
      ? values(args, 'prefix')
      : splitCsv(process.env.STORAGE_CACHE_CONTROL_PREFIXES) ?? [...DEFAULT_STORAGE_CACHE_CONTROL_PREFIXES];
  const prefixes = rawPrefixes.map(normalizeStoragePrefix);
  const cacheControlSeconds = positiveIntegerString(
    value(args, 'cache-control-seconds') ??
      process.env.STORAGE_CACHE_CONTROL_SECONDS ??
      DEFAULT_CACHE_CONTROL_SECONDS,
    'cache-control-seconds',
  );

  const driver = normalizeDriver(value(args, 'driver') ?? process.env.STORAGE_CACHE_CONTROL_DRIVER ?? 'auto');
  const maxObjects = optionalPositiveInteger(value(args, 'max-objects') ?? process.env.STORAGE_CACHE_CONTROL_MAX_OBJECTS, 'max-objects');
  const concurrency = optionalPositiveInteger(value(args, 'concurrency') ?? process.env.STORAGE_CACHE_CONTROL_CONCURRENCY, 'concurrency') ?? DEFAULT_CONCURRENCY;
  const pageSize = optionalPositiveInteger(value(args, 'page-size') ?? process.env.STORAGE_CACHE_CONTROL_PAGE_SIZE, 'page-size') ?? DEFAULT_PAGE_SIZE;

  return {
    command: args.command,
    bucket,
    prefixes,
    prefixSet: new Set(prefixes),
    cacheControlSeconds,
    s3CacheControl: s3CacheControlHeader(cacheControlSeconds),
    driver,
    maxObjects,
    concurrency: Math.min(concurrency, 8),
    pageSize: Math.min(pageSize, 1000),
    target: value(args, 'target') ?? process.env.STORAGE_CACHE_CONTROL_TARGET ?? null,
    confirm: value(args, 'confirm') ?? process.env.STORAGE_CACHE_CONTROL_CONFIRM ?? null,
    includeNonImages: bool(args, 'include-non-images'),
    supabaseUrl: value(args, 'supabase-url') ?? process.env.SUPABASE_URL ?? null,
    supabaseKey: value(args, 'supabase-key') ?? process.env.SUPABASE_SECRET_KEY ?? null,
    s3: s3ConfigFromEnv(args, bucket),
  };
}

function normalizeDriver(raw: string): Driver {
  if (raw === 'auto' || raw === 's3' || raw === 'supabase') return raw;
  throw new Error('--driver must be auto, s3, or supabase.');
}

function s3ConfigFromEnv(args: CliArgs, bucket: string): S3Config | null {
  const endpoint = value(args, 's3-endpoint') ?? process.env.STORAGE_CACHE_CONTROL_S3_ENDPOINT ?? process.env.S3_ENDPOINT;
  const region = value(args, 's3-region') ?? process.env.STORAGE_CACHE_CONTROL_S3_REGION ?? process.env.S3_REGION ?? 'ap-northeast-2';
  const accessKeyId = value(args, 's3-access-key') ?? process.env.STORAGE_CACHE_CONTROL_S3_ACCESS_KEY ?? process.env.S3_ACCESS_KEY;
  const secretAccessKey = value(args, 's3-secret-key') ?? process.env.STORAGE_CACHE_CONTROL_S3_SECRET_KEY ?? process.env.S3_SECRET_KEY;
  if (!endpoint || !accessKeyId || !secretAccessKey) return null;
  return { bucket, endpoint, region, accessKeyId, secretAccessKey };
}

function assertApplyAllowed(config: CliConfig): void {
  if (config.confirm !== APPLY_STORAGE_CACHE_CONTROL_CONFIRMATION) {
    throw new Error(`apply requires --confirm ${APPLY_STORAGE_CACHE_CONTROL_CONFIRMATION}`);
  }
  if (config.target !== 'staging') {
    throw new Error('apply requires --target staging.');
  }
  if (config.supabaseUrl && /\bprod(?:uction)?\b/i.test(config.supabaseUrl)) {
    throw new Error('Refusing to run against a Supabase URL that looks like production.');
  }
}

function resolveDriver(config: CliConfig): ResolvedDriver {
  if (config.driver === 's3') {
    if (!config.s3) throw new Error('S3 driver requires S3 endpoint/access-key/secret-key env or args.');
    return 's3';
  }
  if (config.driver === 'supabase') return 'supabase';
  return config.s3 ? 's3' : 'supabase';
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

function createSupabase(config: CliConfig): SupabaseClient {
  if (!config.supabaseUrl || !config.supabaseKey) {
    throw new Error('Supabase driver requires SUPABASE_URL and SUPABASE_SECRET_KEY, or --supabase-url and --supabase-key.');
  }
  return createClient(config.supabaseUrl, config.supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function listObjects(config: CliConfig, driver: ResolvedDriver): Promise<StorageObjectCandidate[]> {
  if (driver === 's3') {
    return listS3Objects(createS3Client(config.s3!), config);
  }
  return listSupabaseObjects(createSupabase(config), config);
}

async function listS3Objects(s3: S3Client, config: CliConfig): Promise<StorageObjectCandidate[]> {
  const objects: StorageObjectCandidate[] = [];
  for (const prefix of config.prefixes) {
    let token: string | undefined;
    do {
      const response = await s3.send(new ListObjectsV2Command({
        Bucket: config.bucket,
        Prefix: `${prefix}/`,
        ContinuationToken: token,
        MaxKeys: config.pageSize,
      }));
      for (const item of response.Contents ?? []) {
        if (!item.Key) continue;
        objects.push({ key: item.Key, size: item.Size ?? 0 });
        if (config.maxObjects && objects.length >= config.maxObjects) return objects;
      }
      token = response.NextContinuationToken;
    } while (token);
  }
  return objects;
}

async function listSupabaseObjects(client: SupabaseClient, config: CliConfig): Promise<StorageObjectCandidate[]> {
  const bucket = client.storage.from(config.bucket);
  const objects: StorageObjectCandidate[] = [];

  async function walk(prefix: string): Promise<void> {
    for (let offset = 0; ; offset += config.pageSize) {
      const { data, error } = await bucket.list(prefix, {
        limit: config.pageSize,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      });
      if (error) throw error;
      const rows = data ?? [];
      for (const row of rows) {
        const key = `${prefix}/${row.name}`.replace(/^\/+/, '');
        const metadata = objectMetadata(row.metadata);
        if (isSupabaseFile(row, metadata)) {
          objects.push({
            key,
            size: numberFromMetadata(metadata.size),
            contentType: stringFromMetadata(metadata.mimetype ?? metadata.mimeType ?? metadata.contentType),
            cacheControl: stringFromMetadata(metadata.cacheControl ?? metadata.cache_control),
          });
          if (config.maxObjects && objects.length >= config.maxObjects) return;
        } else {
          await walk(key);
          if (config.maxObjects && objects.length >= config.maxObjects) return;
        }
      }
      if (rows.length < config.pageSize) return;
    }
  }

  for (const prefix of config.prefixes) {
    await walk(prefix);
    if (config.maxObjects && objects.length >= config.maxObjects) break;
  }
  return objects;
}

function isSupabaseFile(row: { id?: string | null; name: string }, metadata: Record<string, unknown>): boolean {
  return Boolean(row.id) || metadata.size !== undefined || IMAGE_EXTENSIONS.has(fileExtension(row.name));
}

function objectMetadata(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
}

async function applyCacheControl(config: CliConfig, driver: ResolvedDriver, objects: StorageObjectCandidate[]): Promise<ApplyResult> {
  const eligible = filterEligible(config, objects);
  if (driver === 's3') {
    return applyS3CacheControl(createS3Client(config.s3!), config, eligible, objects.length);
  }
  return applySupabaseCacheControl(createSupabase(config), config, eligible, objects.length);
}

async function applyS3CacheControl(
  s3: S3Client,
  config: CliConfig,
  eligible: StorageObjectCandidate[],
  scanned: number,
): Promise<ApplyResult> {
  let skipped = 0;
  let updated = 0;
  let failed = 0;

  await mapLimit(eligible, config.concurrency, async (object) => {
    try {
      const head = await s3.send(new HeadObjectCommand({ Bucket: config.bucket, Key: object.key }));
      const hydrated: StorageObjectCandidate = {
        ...object,
        contentType: head.ContentType ?? object.contentType,
        cacheControl: head.CacheControl ?? null,
        contentDisposition: head.ContentDisposition ?? null,
        contentEncoding: head.ContentEncoding ?? null,
        contentLanguage: head.ContentLanguage ?? null,
        expires: head.Expires,
        metadata: head.Metadata,
      };
      if (hydrated.cacheControl === config.s3CacheControl) {
        skipped += 1;
        return;
      }
      await s3.send(new CopyObjectCommand(buildCopyObjectInput({
        bucket: config.bucket,
        object: hydrated,
        cacheControl: config.s3CacheControl,
      })));
      updated += 1;
    } catch (error) {
      failed += 1;
      console.error(`failed ${object.key}: ${errorMessage(error)}`);
    }
  });

  return { scanned, eligible: eligible.length, skipped, updated, failed };
}

async function applySupabaseCacheControl(
  client: SupabaseClient,
  config: CliConfig,
  eligible: StorageObjectCandidate[],
  scanned: number,
): Promise<ApplyResult> {
  const bucket = client.storage.from(config.bucket);
  let updated = 0;
  let failed = 0;

  await mapLimit(eligible, config.concurrency, async (object) => {
    try {
      const downloaded = await bucket.download(object.key);
      if (downloaded.error) throw downloaded.error;
      const body = await downloaded.data.arrayBuffer();
      const contentType = object.contentType ?? downloaded.data.type ?? contentTypeForKey(object.key);
      const uploaded = await bucket.update(object.key, body, {
        cacheControl: config.cacheControlSeconds,
        contentType,
        upsert: true,
      });
      if (uploaded.error) throw uploaded.error;
      updated += 1;
    } catch (error) {
      failed += 1;
      console.error(`failed ${object.key}: ${errorMessage(error)}`);
    }
  });

  return { scanned, eligible: eligible.length, skipped: 0, updated, failed };
}

function filterEligible(config: CliConfig, objects: readonly StorageObjectCandidate[]): StorageObjectCandidate[] {
  if (config.includeNonImages) {
    return objects.filter((object) => object.size > 0 && config.prefixSet.has(topLevelPrefix(object.key)));
  }
  return objects.filter((object) => isEligibleStorageObject(object, config.prefixSet));
}

async function mapLimit<T>(items: readonly T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      await worker(items[index]);
    }
  });
  await Promise.all(workers);
}

function topLevelPrefix(key: string): string {
  return key.split('/')[0] ?? '';
}

function fileExtension(key: string): string {
  const last = key.toLowerCase().split('/').at(-1) ?? '';
  const index = last.lastIndexOf('.');
  return index >= 0 ? last.slice(index) : '';
}

function contentTypeForKey(key: string): string | undefined {
  switch (fileExtension(key)) {
    case '.avif':
      return 'image/avif';
    case '.gif':
      return 'image/gif';
    case '.heic':
      return 'image/heic';
    case '.heif':
      return 'image/heif';
    case '.jpeg':
    case '.jpg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    default:
      return undefined;
  }
}

function copySource(bucket: string, key: string): string {
  return `/${encodeURIComponent(bucket)}/${key.split('/').map(encodeURIComponent).join('/')}`;
}

function splitCsv(raw: string | undefined): string[] | null {
  if (!raw) return null;
  const items = raw.split(',').map((item) => item.trim()).filter(Boolean);
  return items.length > 0 ? items : null;
}

function optionalPositiveInteger(raw: string | undefined, label: string): number | null {
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`--${label} must be a positive integer.`);
  }
  return parsed;
}

function positiveIntegerString(raw: string, label: string): string {
  optionalPositiveInteger(raw, label);
  return raw;
}

function numberFromMetadata(raw: unknown): number {
  const parsed = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function stringFromMetadata(raw: unknown): string | null {
  return typeof raw === 'string' && raw.trim() ? raw : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = units.shift()!;
  while (value >= 1024 && units.length > 0) {
    value /= 1024;
    unit = units.shift()!;
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${unit}`;
}

function printSummary(title: string, objects: readonly StorageObjectCandidate[]): void {
  const totalBytes = objects.reduce((sum, object) => sum + object.size, 0);
  console.log(`${title}: ${objects.length} objects, ${formatBytes(totalBytes)}`);
  for (const row of summarizeStorageObjects(objects)) {
    console.log(`  ${row.prefix}: ${row.objects} objects, ${formatBytes(row.bytes)}`);
  }
}

function printHelp(): void {
  console.log(`
Usage:
  tsx scripts/storage-cache-control.ts status --bucket <bucket>
  tsx scripts/storage-cache-control.ts apply --bucket <bucket> --target staging --confirm ${APPLY_STORAGE_CACHE_CONTROL_CONFIRMATION}

Common options:
  --prefix <prefix>                 Repeatable. Defaults to generated image prefixes.
  --driver auto|s3|supabase          Defaults to auto. S3 is preferred when S3 credentials exist.
  --cache-control-seconds <seconds>  Defaults to ${DEFAULT_CACHE_CONTROL_SECONDS}.
  --max-objects <n>                  Limit scanned objects for smoke tests.
  --concurrency <n>                  Defaults to ${DEFAULT_CONCURRENCY}, max 8.

Env:
  SUPABASE_URL, SUPABASE_SECRET_KEY
  STORAGE_CACHE_CONTROL_BUCKET or S3_BUCKET
  STORAGE_CACHE_CONTROL_S3_ENDPOINT, STORAGE_CACHE_CONTROL_S3_REGION,
  STORAGE_CACHE_CONTROL_S3_ACCESS_KEY, STORAGE_CACHE_CONTROL_S3_SECRET_KEY
`);
}

async function main(): Promise<void> {
  const args = parseArgs();
  if (args.command === 'help') {
    printHelp();
    return;
  }

  const config = resolveConfig(args);
  const driver = resolveDriver(config);
  console.log(`storage-cache-control ${config.command}: bucket=${config.bucket} driver=${driver}`);
  console.log(`prefixes=${config.prefixes.join(', ')}`);

  const objects = await listObjects(config, driver);
  const eligible = filterEligible(config, objects);
  printSummary('scanned', objects);
  printSummary('eligible', eligible);

  if (config.command === 'status') {
    if (driver === 'supabase') {
      console.log('note: Supabase Storage API status lists files but cannot reliably inspect existing Cache-Control per object.');
    }
    return;
  }

  assertApplyAllowed(config);
  const result = await applyCacheControl(config, driver, objects);
  console.log(
    `apply result: scanned=${result.scanned} eligible=${result.eligible} updated=${result.updated} skipped=${result.skipped} failed=${result.failed}`,
  );
  if (result.failed > 0) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(errorMessage(error));
    process.exit(1);
  });
}
