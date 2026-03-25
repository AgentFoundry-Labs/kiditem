# Phase 1: Schema Foundations - Research

**Researched:** 2026-03-26
**Domain:** Prisma schema migration — adding nullable columns to existing PostgreSQL table
**Confidence:** HIGH

## Summary

Phase 1 adds two nullable columns to the `products` table in `prisma/schema.prisma`: `draftContent` (JSONB) and `pipelineStep` (String). Both follow exact patterns already established in the schema (`rawData`/`processedData` for JSONB, `status` for String). The live DB has 1,131 rows — 1,120 with `status = 'active'` and 11 with `status = 'draft'` — none have `processed_data` set, so backward compat risk is zero for that path. The schema change is additive-only (no renamed or removed fields), meaning `npm run db:push` will issue a clean `ALTER TABLE ... ADD COLUMN` with no destructive migration.

The project uses **Prisma v7.5.0** with `prisma.config.ts` (not `schema.prisma` `url` block — the v7 pattern). Running `npm run db:push` at root applies the schema. Running `npm run db:generate` (alias `db:generate` at root) regenerates the client for TypeScript.

**Primary recommendation:** Add the two fields verbatim to the Product model following the `rawData`/`processedData` and `status` patterns. Add `@@index([pipelineStep])` for future agent queue queries. Regenerate client. Verify TypeScript compilation with `cd apps/server && npx tsc --noEmit`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** `product.status` keeps existing values unchanged (`draft`, `processing`, `processed`, `listed`, `discontinued`). No new status values added.
- **D-02:** `pipelineStep` is a separate nullable String column that tracks the sub-step within the pipeline: `null | content_ready | images_generating`. It is independent from `status`.
- **D-03:** During Step 1 processing, `status` becomes `processing` while `pipelineStep` remains `null`. When Step 1 completes, `status` returns to `draft` and `pipelineStep` becomes `content_ready`.
- **D-04:** During Step 2 (image generation), `status` becomes `processing` and `pipelineStep` becomes `images_generating`. When Step 2 completes, `status` becomes `draft` (or `processed`) and `pipelineStep` returns to `null`.

### Claude's Discretion
- **D-05:** Choose the most practical data shape for `draftContent`. Recommendation: store as `DetailPageData`-compatible shape so the editor can render it directly via the existing template preview pipeline. Include a `heroImageUrl` field for user's hero image selection.
- General Prisma patterns: follow existing `rawData`/`processedData` convention (`Json? @map("draft_content")`)
- Column defaults, indexes: Claude decides based on query patterns

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SCHM-01 | Product에 draftContent (JSONB) 컬럼 추가하여 Step 1 결과를 별도 저장할 수 있다 | `Json? @map("draft_content")` pattern verified in existing schema; live DB confirms `ALTER TABLE ADD COLUMN` is additive-safe |
| SCHM-02 | Product에 pipelineStep (String) 컬럼 추가하여 파이프라인 진행 단계를 추적할 수 있다 | `String?` pattern verified; `@@index` on status already exists as model; index on pipelineStep recommended for agent polling queries |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Native PG enum 금지** — `pipelineStep` MUST be `String?`, not a PostgreSQL enum, even though it has only 3 valid values (`null`, `content_ready`, `images_generating`). Validation lives at app level.
- **`@@map("snake_case")`** — DB column name must be `draft_content` and `pipeline_step`.
- **`@map("snake_case")`** — field-level map required on every column.
- **No migration file for dev** — use `npm run db:push` (not `db:migrate`) for development schema application.
- **After schema change: `npm run db:push` + `npx prisma generate`** — both commands required in sequence.
- **Python agents use raw snake_case column names** — `draft_content`, `pipeline_step` via asyncpg.
- **NestJS services use camelCase via Prisma client** — `draftContent`, `pipelineStep`.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Prisma | 7.5.0 | Schema definition + DB client | Already in use; `prisma.config.ts` pattern |
| @prisma/client | 7.5.0 | Generated TypeScript client | Auto-generated from schema |
| PostgreSQL | (running in Docker) | JSONB storage | `raw_data`/`processed_data` already JSONB |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| tsx | (in devDeps) | Run `prisma/seed.ts` | Only for seeding, not schema |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `Json?` for draftContent | Separate table | Separate table is overkill — processedData is already Json?, same lifecycle |
| `String?` for pipelineStep | Native PG enum | Forbidden by project rules (production cast errors experienced) |

**Commands:**
```bash
npm run db:push         # at repo root — applies schema to live DB
npm run db:generate     # at repo root — regenerates Prisma client
cd apps/server && npx tsc --noEmit  # TypeScript compilation check
```

**Version verification:** Confirmed — `@prisma/client: ^7.5.0` and `prisma: ^7.5.0` in `apps/server/package.json`.

## Architecture Patterns

### Exact Schema Diff to Apply

The Product model currently ends at line 107 in `prisma/schema.prisma`. The two new fields slot in between `processedData` and `detailPageUrl`:

```prisma
// Add after line 76 (processedData):
  draftContent   Json?    @map("draft_content")
  pipelineStep   String?  @map("pipeline_step")
```

And a new `@@index` in the index block:
```prisma
  @@index([pipelineStep])
```

### Recommended Project Structure
No structural changes to file layout. Only `prisma/schema.prisma` is modified.

### Pattern 1: Nullable JSONB Column (replicates `rawData`/`processedData`)
**What:** `Json?` with `@map("snake_case")` and no default value
**When to use:** When a column stores structured JSON that may be absent
**Example:**
```prisma
// Source: existing prisma/schema.prisma lines 75-76
rawData        Json?    @map("raw_data")
processedData  Json?    @map("processed_data")
draftContent   Json?    @map("draft_content")   // ← new, same pattern
```

### Pattern 2: Nullable String Enum Column (replicates `status`)
**What:** `String?` with `@map("snake_case")` and no default (nullable)
**When to use:** When a column holds a finite set of string values but must be null by default
**Example:**
```prisma
// Source: existing prisma/schema.prisma line 66 (status has @default("draft"))
// pipelineStep has NO default — it starts null on existing rows
pipelineStep   String?  @map("pipeline_step")
```

### Pattern 3: Index on Filterable String Column
**What:** `@@index([fieldName])` at model level
**When to use:** When agents or NestJS services will filter/query by this column
**Example:**
```prisma
// Source: existing prisma/schema.prisma lines 103-105
@@index([companyId])
@@index([status])
@@index([pipelineStep])   // ← new — agents will poll WHERE pipeline_step = 'content_ready'
```

### Anti-Patterns to Avoid
- **Adding `@default("")` to `pipelineStep`:** An empty string is not the same as `null`. Null correctly means "no pipeline step in progress." Keep it nullable with no default.
- **Adding `@default("{}")` to `draftContent`:** Null means "not yet generated." An empty object would break frontend checks like `if (product.draftContent)`.
- **Native PG enum for pipelineStep:** Forbidden. Use `String?` + app-level validation only.
- **Modifying `processedData`:** Out of scope. This column stays unchanged and is only ever written by Step 2 (future phases).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSONB column addition | Raw SQL `ALTER TABLE` | `npm run db:push` | Prisma handles idempotency, introspection, client regen |
| TypeScript type for new fields | Manual interface | Regenerated `@prisma/client` | Auto-generated from schema; always in sync |
| DB column nullability check | Custom migration guard | `Json?` / `String?` in schema | Prisma generates `NOT NULL`-free DDL for nullable fields |

**Key insight:** Both columns are additive nullable additions — `db:push` generates a safe `ALTER TABLE ADD COLUMN` with no data loss risk and no default value coercion on existing rows.

## Runtime State Inventory

> Included because this is a schema change phase — existing rows must remain valid.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | 1,131 products in `products` table; 0 have `processed_data` set; 730 have `raw_data` set | None — both new columns are nullable, existing rows get NULL for both new columns automatically |
| Live service config | `kiditem-server` Docker container running NestJS; `kiditem-postgres` PostgreSQL running | After `db:push`: rebuild Docker server (`docker compose up -d --build server`) to pick up regenerated Prisma client |
| OS-registered state | None | None |
| Secrets/env vars | `DATABASE_URL=postgresql://kiditem:kiditem@localhost:5433/kiditem` in `apps/server/.env` — unchanged | None — no column rename |
| Build artifacts | `apps/server/dist/` — compiled NestJS; Prisma client in `node_modules/.prisma/client/` | After `prisma generate`: rebuilt by `docker compose up -d --build server` |

**Key finding:** No existing products have `processedData` set (confirmed: `COUNT(processed_data) = 0`). The backward compatibility requirement ("existing products with `processedData` set load in the editor without error") is trivially satisfied — no such products exist — but the code path in `products.controller.ts` `preview()` endpoint still handles `processedData || rawData` correctly for future use.

## Common Pitfalls

### Pitfall 1: Prisma Client Not Regenerated After Schema Change
**What goes wrong:** TypeScript compiler sees old types; `product.draftContent` shows as "does not exist on type Product"
**Why it happens:** `db:push` updates the DB but does NOT automatically regenerate the client
**How to avoid:** Always run `npm run db:generate` immediately after `npm run db:push`. In Docker: also run `docker compose up -d --build server` so the container picks up regenerated client.
**Warning signs:** TypeScript errors referencing `draftContent` or `pipelineStep` not existing on `Prisma.Product`

### Pitfall 2: Forgetting `@map` Causes Column Name Mismatch
**What goes wrong:** Python agents using asyncpg raw SQL write to `draft_content` but Prisma created a column named `draftContent` (camelCase)
**Why it happens:** Without `@map("draft_content")`, Prisma uses the camelCase field name as the DB column name
**How to avoid:** Both new fields MUST have `@map("draft_content")` and `@map("pipeline_step")`
**Warning signs:** Python agent SQL errors like `column "draft_content" does not exist`

### Pitfall 3: Using `@default(null)` Explicitly
**What goes wrong:** Prisma v7 does not accept `@default(null)` syntax — it's implicit for `?` fields
**Why it happens:** Trying to be explicit about null default
**How to avoid:** Write `Json?` and `String?` with no `@default()` clause. The `?` suffix is sufficient.
**Warning signs:** `prisma db push` error: "Invalid default value for type"

### Pitfall 4: Docker Container Has Stale Prisma Client
**What goes wrong:** NestJS running inside Docker uses old generated client; `product.draftContent` is `undefined` at runtime even after schema push
**Why it happens:** The Docker image bakes in the Prisma client at build time
**How to avoid:** After schema change + generate, run `docker compose up -d --build server`
**Warning signs:** HTTP 500 errors from NestJS when accessing new fields; no TypeScript error (because local client was regenerated but Docker container uses old image)

## Code Examples

Verified patterns from the existing codebase:

### Complete Product Model Diff (what the final schema looks like)
```prisma
// Source: prisma/schema.prisma — Product model (modified)
model Product {
  id          String   @id @default(uuid()) @db.Uuid
  companyId   String   @map("company_id") @db.Uuid
  name        String
  description String   @default("")
  status      String   @default("draft")
  category    String?
  tags        Json     @default("[]")
  thumbnailUrl String? @map("thumbnail_url")

  sourceUrl      String?  @map("source_url")
  sourcePlatform String?  @map("source_platform")
  costCny        Decimal? @map("cost_cny") @db.Decimal(12, 2)
  marginRate     Decimal? @map("margin_rate") @db.Decimal(5, 4)
  rawData        Json?    @map("raw_data")
  processedData  Json?    @map("processed_data")
  draftContent   Json?    @map("draft_content")     // SCHM-01 ← new
  pipelineStep   String?  @map("pipeline_step")     // SCHM-02 ← new
  detailPageUrl  String?  @map("detail_page_url")

  // ... (rest unchanged)

  @@index([companyId])
  @@index([status])
  @@index([abcGrade])
  @@index([pipelineStep])    // ← new index
  @@map("products")
}
```

### Python Agent SQL Using New Columns (for context)
```python
# Source: agents pattern (asyncpg raw SQL, snake_case column names)
await pool.execute(
    "UPDATE products SET draft_content = $1, pipeline_step = $2, status = $3 WHERE id = $4",
    json.dumps(draft_content_dict),
    'content_ready',
    'draft',
    product_id,
)
```

### NestJS Prisma Client Usage (for context)
```typescript
// Source: NestJS pattern (camelCase Prisma fields)
const product = await this.prisma.product.findUnique({ where: { id } });
// product.draftContent  — Json | null
// product.pipelineStep  — string | null
```

### draftContent Shape (DetailPageData-compatible)
The `draftContent` JSONB column must be compatible with the `DetailPageData` schema defined in `packages/templates/src/schemas.ts`. The existing `parseDetailPageData()` function in that file handles snake_case → camelCase transformation, so `draftContent` is stored in snake_case JSON keys (matching Python output) and parsed with `parseDetailPageData()` on the frontend.

Key fields confirmed present in `DetailPageDataSchema`:
- `title`, `description`, `hookText`, `hookTitleSub`, `hookSubtext`
- `images`, `heroBanner`, `sizeImages`, `detailImages`
- `keyPoints`, `specs`, `features`, `materials`
- `themeColorMain`, `themeColorBgLight`, (5 more theme fields)
- `layout` (LayoutConfig with enabled/disabled sections)

The `heroImageUrl` field (D-05 discretion) does NOT exist in the current `DetailPageDataSchema`. It should be stored as a top-level key in the `draftContent` JSON object but is NOT part of `DetailPageData` itself — it is metadata for the editor to know which source image the user selected. Consider storing it as `draftContent.heroImageUrl` outside the DetailPageData shape, or in the `_debug` dict (already present in Python `_assemble()`).

**Recommendation:** Store `heroImageUrl` as a sibling key to the DetailPageData fields in the JSONB blob. The `parseDetailPageData()` function ignores unknown keys (Zod `.parse()` strips extras by default), so it won't break template rendering.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `schema.prisma` `url = env("DATABASE_URL")` | `prisma.config.ts` with `defineConfig()` | Prisma v7 | `npm run db:push` works from root without `--schema` flag |
| `prisma migrate dev` for all changes | `prisma db push` for dev | Project convention | No migration files created; DB directly updated |

**Deprecated/outdated:**
- `prisma.schema` `datasource db { url = env(...) }`: project uses v7 `prisma.config.ts` pattern. Commands still work the same way from the root.

## Open Questions

1. **`heroImageUrl` storage location in draftContent**
   - What we know: D-05 says include it; `DetailPageDataSchema` has no such field
   - What's unclear: Whether it should live inside the DetailPageData blob or outside it
   - Recommendation: Store as `draftContent.hero_image_url` at the top level of the JSONB, alongside but outside the DetailPageData shape. Frontend reads it separately before passing to `parseDetailPageData()`. This avoids modifying the template schema in Phase 1.

2. **`draftContent` field placement in the Product model**
   - What we know: CONTEXT.md says slot it near `processedData` (line ~76)
   - What's unclear: Whether to group all three Json fields together or separate `draftContent` near `processedData`
   - Recommendation: Place `draftContent` immediately after `processedData` (line 77), keeping all JSONB pipeline fields grouped.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PostgreSQL | `db:push` target DB | ✓ | `kiditem-postgres` Docker healthy | — |
| NestJS Docker | Prisma client consumer | ✓ | `kiditem-server` Up 6 hours | `npm run dev:server` (local) |
| `prisma` CLI | `db:push` + `generate` | ✓ | ^7.5.0 (apps/server) | — |
| `tsx` | seed script | ✓ | in devDeps | — |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None.

## Validation Architecture

> No automated test framework detected in the project (no jest.config, no vitest.config, no test scripts in package.json beyond what NestJS scaffolds). The NestJS server package.json only has `build`, `start`, `start:dev`, `start:prod`, `lint` scripts — no `test` script.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None detected — NestJS default jest not configured |
| Config file | None |
| Quick run command | `cd apps/server && npx tsc --noEmit` (TypeScript compilation as proxy for correctness) |
| Full suite command | `cd apps/server && npx tsc --noEmit && npm run build` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SCHM-01 | `products` table has nullable `draft_content` JSONB column | Schema verify | `docker exec kiditem-postgres psql -U kiditem -d kiditem -c "\d products"` | ✓ (manual) |
| SCHM-01 | `product.draftContent` accessible in TypeScript without error | Compilation | `cd apps/server && npx tsc --noEmit` | ✓ (after regen) |
| SCHM-02 | `products` table has nullable `pipeline_step` text column | Schema verify | `docker exec kiditem-postgres psql -U kiditem -d kiditem -c "\d products"` | ✓ (manual) |
| SCHM-02 | `product.pipelineStep` accessible in TypeScript without error | Compilation | `cd apps/server && npx tsc --noEmit` | ✓ (after regen) |

### Sampling Rate
- **Per task commit:** `cd apps/server && npx tsc --noEmit`
- **Per wave merge:** `cd apps/server && npx tsc --noEmit && npm run build`
- **Phase gate:** DB column verification + TypeScript compilation green before `/gsd:verify-work`

### Wave 0 Gaps
None — no test files needed for a schema-only phase. TypeScript compilation is the verification proxy.

## Sources

### Primary (HIGH confidence)
- `prisma/schema.prisma` — existing Product model, exact patterns for `Json?`, `String?`, `@@index`, `@map`
- `prisma/CLAUDE.md` — Prisma v7 conventions, `db:push` vs `db:migrate`, native enum prohibition
- `prisma/config.ts` — v7 `defineConfig()` config pattern verified in codebase
- Live DB introspection — confirmed `products` table columns and existing row counts

### Secondary (MEDIUM confidence)
- `packages/templates/src/schemas.ts` — `DetailPageDataSchema` field list (used to spec `draftContent` shape)
- `agents/src/agents/content/template_pipeline.py` — `DetailPageData`/`GeneratedContent` types; confirmed `heroImageUrl` is not in current schema

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Prisma v7.5.0 confirmed in package.json; patterns verified in existing schema
- Architecture: HIGH — exact column patterns copied from existing schema; DB state confirmed via live introspection
- Pitfalls: HIGH — all pitfalls sourced from observed codebase patterns (Docker rebuild requirement, `@map` requirement)

**Research date:** 2026-03-26
**Valid until:** 2026-04-25 (stable — Prisma schema conventions change slowly)
