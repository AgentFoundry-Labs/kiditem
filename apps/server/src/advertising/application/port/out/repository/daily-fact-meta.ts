// Shared metaJson namespacing input for the three daily-fact ports
// (channel-listing-daily, channel-option-daily, channel-target-daily).
// Each port accepts the same `MetaJsonInput` so concurrent payloads
// preserve each other's audit data via the adapter's atomic jsonb merge.
//
// - `undefined` (or omitted) → leave column untouched on update; write
//   `Prisma.DbNull` on create.
// - explicit `null` → wipe the metaJson column entirely (rare; reserved
//   for tests/admin tooling).
// - `{ source, data }` → write `{ [source]: data }` on create; on update
//   atomically merge the new source key into the existing object.

export interface NamespacedMetaJson {
  source: string;
  data: Record<string, unknown>;
}

export type MetaJsonInput = NamespacedMetaJson | null | undefined;
