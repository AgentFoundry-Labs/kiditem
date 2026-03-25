# Phase 1: Schema Foundations - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Add `draftContent` (JSONB) and `pipelineStep` (String) columns to the Product model in Prisma schema. Generate Prisma client and verify backward compatibility with existing products.

</domain>

<decisions>
## Implementation Decisions

### Status / PipelineStep Interaction
- **D-01:** `product.status` keeps existing values unchanged (`draft`, `processing`, `processed`, `listed`, `discontinued`). No new status values added.
- **D-02:** `pipelineStep` is a separate nullable String column that tracks the sub-step within the pipeline: `null | content_ready | images_generating`. It is independent from `status`.
- **D-03:** During Step 1 processing, `status` becomes `processing` while `pipelineStep` remains `null`. When Step 1 completes, `status` returns to `draft` and `pipelineStep` becomes `content_ready`.
- **D-04:** During Step 2 (image generation), `status` becomes `processing` and `pipelineStep` becomes `images_generating`. When Step 2 completes, `status` becomes `draft` (or `processed`) and `pipelineStep` returns to `null`.

### draftContent Structure
- **D-05:** Claude's Discretion — choose the most practical data shape for `draftContent`. Recommendation: store as `DetailPageData`-compatible shape so the editor can render it directly via the existing template preview pipeline. Include a `heroImageUrl` field for user's hero image selection. This avoids a conversion layer in the frontend.

### Claude's Discretion
- General Prisma patterns: follow existing `rawData`/`processedData` convention (`Json? @map("draft_content")`)
- Column defaults, indexes: Claude decides based on query patterns

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Schema
- `prisma/schema.prisma` — Product model (lines 61-107), existing JSONB fields pattern
- `prisma/CLAUDE.md` — Prisma v7 conventions, naming rules, native enum prohibition

### Pipeline Data Types
- `agents/src/agents/content/template_pipeline.py` — `GeneratedContent` and `DetailPageData` types that define what draftContent must be compatible with
- `packages/templates/src/bold-vertical/index.tsx` — `DetailPageData` interface consumed by templates

### Existing Status Usage
- `apps/server/src/products/products.service.ts` — Existing status queries to maintain backward compatibility
- `apps/web/src/app/sourcing/page.tsx` — Frontend status filtering

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `rawData Json? @map("raw_data")` / `processedData Json? @map("processed_data")` — exact pattern to replicate for `draftContent`
- `status String @default("draft")` — existing String column pattern for `pipelineStep`
- `@@index` on status — may want index on `pipelineStep` for filtering

### Established Patterns
- camelCase Prisma fields → `@map("snake_case")` DB columns
- Nullable JSONB: `Json?` with no default
- UUID PK: `@default(uuid()) @db.Uuid`
- Timestamptz for all timestamps

### Integration Points
- Python agents access via asyncpg raw SQL using snake_case column names (`draft_content`, `pipeline_step`)
- NestJS services use Prisma client with camelCase (`draftContent`, `pipelineStep`)
- After schema change: `npm run db:push` + `npx prisma generate`

</code_context>

<specifics>
## Specific Ideas

No specific requirements — follows existing patterns exactly.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-schema-foundations*
*Context gathered: 2026-03-26*
