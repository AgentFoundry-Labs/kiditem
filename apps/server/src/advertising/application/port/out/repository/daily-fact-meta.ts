// Shared metaJson namespacing input of the daily-fact writers
// (`daily-fact-helpers`, the old target-day row shape). Concurrent payloads
// preserve each other's audit data via the writer's atomic jsonb merge.
//
// - `undefined` (or omitted) → leave column untouched on update; write
//   `Prisma.DbNull` on create.
// - explicit `null` → wipe the metaJson column entirely (rare; reserved
//   for tests/admin tooling).
// - `{ source, data }` → write `{ [source]: data }` on create; on update
//   atomically merge the new source key into the existing object. The Wing
//   traffic source also records `traffic.currentSource` at the row root.

export interface NamespacedMetaJson {
  source: string;
  data: Record<string, unknown>;
}

export type MetaJsonInput = NamespacedMetaJson | null | undefined;
