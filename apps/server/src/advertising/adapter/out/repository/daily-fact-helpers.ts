// Shared metaJson / metric / observed-field helpers for the three
// daily-fact repository adapters (channel-listing-daily, channel-option-
// daily, channel-target-daily). Kept inside `adapter/out/repository/` so
// ports/services never see this code path.
//
// metaJson namespacing rule:
//   Multiple payloads can land on the same `(organizationId, listingId,
//   businessDate)` (or other daily-fact unique key) row. To preserve each
//   caller's audit data without a fetch-merge-update transaction
//   proliferating, callers nest their metaJson under a `source` key:
//     metaJson: { source: 'advertising.campaign', data: {...} }
//   On create the helper writes `{ [source]: data }`. On update the
//   helper applies an atomic Postgres jsonb merge so independent source
//   keys do not clobber each other even when sync and upload jobs touch
//   the same daily-fact row concurrently.

import { Prisma } from '@prisma/client';
import type {
  MetaJsonInput,
  NamespacedMetaJson,
} from '../../../application/port/out/daily-fact-meta';

export type DailyFactTable =
  | 'channel_listing_daily_snapshots'
  | 'channel_listing_option_daily_snapshots'
  | 'channel_ad_target_daily_snapshots';

export function pickObservedFields<T extends object, K extends keyof T>(
  source: T,
  keys: ReadonlyArray<K>,
): Partial<Pick<T, K>> {
  const out: Partial<Pick<T, K>> = {};
  for (const key of keys) {
    const value = source[key];
    if (value !== null && value !== undefined) {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Convert an `ad`/`traffic`/`target` metric block into the shape consumed
 * by upsert `create`. Missing keys → `0` on create (matches the
 * `Int @default(0)` columns).
 */
export function spreadMetricsForCreate<K extends string>(
  block: Partial<Record<K, number | null | undefined>> | undefined,
  keys: ReadonlyArray<K>,
): Record<K, number> {
  const out = {} as Record<K, number>;
  for (const k of keys) {
    const v = block?.[k];
    out[k] = typeof v === 'number' && Number.isFinite(v) ? v : 0;
  }
  return out;
}

export function spreadMetricsForUpdate<K extends string>(
  block: Partial<Record<K, number | null | undefined>> | undefined,
  keys: ReadonlyArray<K>,
): Partial<Record<K, number>> {
  const out: Partial<Record<K, number>> = {};
  if (!block) return out;
  for (const k of keys) {
    const v = block[k];
    if (typeof v === 'number' && Number.isFinite(v)) {
      out[k] = v;
    }
  }
  return out;
}

function buildNamespacedMetaPatchJson(input: NamespacedMetaJson): string {
  return JSON.stringify({ [input.source]: input.data });
}

function isNamespacedMetaJson(
  input: MetaJsonInput,
): input is NamespacedMetaJson {
  return input !== undefined && input !== null;
}

/**
 * `metaJson` value for the upsert `create` path. Always namespaces under
 * `input.source`. Returns `Prisma.DbNull` for null/undefined to avoid
 * writing a non-null empty object.
 */
export function buildNamespacedMetaForCreate(
  input: MetaJsonInput,
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (input === undefined || input === null) return Prisma.DbNull;
  return {
    [input.source]: input.data,
  } as unknown as Prisma.InputJsonValue;
}

export async function mergeNamespacedMetaJson(
  tx: Prisma.TransactionClient,
  table: DailyFactTable,
  id: string,
  organizationId: string,
  metaJson: MetaJsonInput,
): Promise<void> {
  if (!isNamespacedMetaJson(metaJson)) return;
  const patchJson = buildNamespacedMetaPatchJson(metaJson);
  if (table === 'channel_listing_daily_snapshots') {
    await tx.$executeRaw(Prisma.sql`
      UPDATE channel_listing_daily_snapshots
      SET meta_json = COALESCE(meta_json, '{}'::jsonb) || ${patchJson}::jsonb
      WHERE id = ${id}::uuid
        AND organization_id = ${organizationId}::uuid
    `);
    return;
  }
  if (table === 'channel_listing_option_daily_snapshots') {
    await tx.$executeRaw(Prisma.sql`
      UPDATE channel_listing_option_daily_snapshots
      SET meta_json = COALESCE(meta_json, '{}'::jsonb) || ${patchJson}::jsonb
      WHERE id = ${id}::uuid
        AND organization_id = ${organizationId}::uuid
    `);
    return;
  }
  await tx.$executeRaw(Prisma.sql`
    UPDATE channel_ad_target_daily_snapshots
    SET meta_json = COALESCE(meta_json, '{}'::jsonb) || ${patchJson}::jsonb
    WHERE id = ${id}::uuid
      AND organization_id = ${organizationId}::uuid
  `);
}
