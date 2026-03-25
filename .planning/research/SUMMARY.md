# Project Research Summary

**Project:** KidItem v1.0 — Multi-step AI Content Pipeline with Human Editing Gate
**Domain:** Human-in-the-loop AI content generation pipeline (e-commerce seller tool)
**Researched:** 2026-03-25
**Confidence:** HIGH

## Executive Summary

KidItem's current one-shot `TemplatePipeline` runs LLM copywriting and FAL.AI image generation in a single Python agent task with no opportunity for user review. This milestone refactors it into a two-step pipeline: Step 1 generates Korean content and theme colors (no FAL.AI spend), Step 2 lets the user edit text/colors/hero image in the existing editor, and Step 3 fires FAL.AI image generation only after explicit user confirmation. This is the standard multi-stage approval pattern used by eBay AI Descriptions, Shopify Magic, and every production AI content pipeline — skipping it leads directly to wasted FAL.AI spend ($0.03-0.08/image, 20-40s latency) and user frustration when wrong images are used.

The recommended approach is a DB-native state machine using two new Prisma columns (`draftContent`, `pipelineStep`) that enforce hard separation between intermediate content state and final processed state. Two new Python agents (`content_step1`, `content_step2`) replace the monolithic ContentAgent for template mode. A single new NestJS endpoint (`PUT /api/products/:id/draft-content`) handles user edit persistence, and the existing editor page is extended with a structured form panel (not GrapesJS canvas editing). Only one new frontend dependency is needed: `react-colorful@5.6.1` (2.8 KB, zero deps) for color pickers.

The dominant risk is state overwrite: both pipeline steps writing to the same `processed_data` column causes silent loss of user edits. The second critical risk is hero image selection living only in React state and being lost before image generation triggers. Both risks are addressed at the schema level (Phase 1) before any agent or frontend work begins. Four additional pitfalls — agent reading stale DB state at runtime, status state machine inadequacy, FAL.AI using wrong source image, and GrapesJS HTML as a data store — all have established prevention patterns documented in PITFALLS.md.

---

## Key Findings

### Recommended Stack

The existing stack (Next.js 14, NestJS 11, PostgreSQL + Prisma, Python agents with asyncpg, Zustand, Radix UI, GrapesJS) requires only one new dependency. All pipeline state tracking, intermediate data storage, and agent coordination reuse existing infrastructure.

**Core technologies:**
- `react-colorful@5.6.1`: Theme color pickers in Step 2 editor — 2.8 KB, zero deps, ships `HexColorPicker` + `HexColorInput`, works inside existing `@radix-ui/react-popover`
- `products.draftContent Json?` (new Prisma field): Intermediate state storage for Step 1 output + user edits — avoids new table, follows existing `processed_data` pattern
- `products.pipelineStep String?` (new Prisma field): Status machine for multi-step pipeline state — values: `null | content_ready | images_generating`
- Existing `agent_tasks` + 3-second polling: Pipeline stage status tracking — no new infrastructure needed
- Existing `renderTemplateToHtml()`: Live template preview during editing — stateless function, re-render on field change without API round-trip

**What to avoid:**
- `react-color` (casesandberg): Unmaintained since 2020
- New `pipeline_stages` table: Over-engineering; a String column on `products` is sufficient
- New Zustand slice for pipeline state: Pipeline state lives in DB, not client
- GrapesJS canvas for Step 2 editing: GrapesJS edits HTML, not `DetailPageData` struct

### Expected Features

**Must have (table stakes — v1 launch):**
- Content-only generation mode (`generation_mode: 'content_only'`) — gates FAL.AI cost behind user confirmation
- Content draft status + polling — frontend knows when to transition to editor
- Structured field editor panel — title, hook_text, description_ko, theme colors (7 fields)
- Live template preview on field change — `renderTemplateToHtml()` bound to React state
- Hero image picker — grid of raw source images, user selects hero for FAL.AI input
- "Generate images" confirmation button — single CTA that triggers `content_step2` agent with confirmed hero URL
- Image generation agent task — accepts `hero_image_url` override, runs FAL.AI, writes `processed_data`

**Should have (competitive differentiators — v1.x):**
- Category-aware color palette suggestions — `_CATEGORY_TONES` already maps categories; extend to pre-built palettes
- Preserve draft edits across refresh — auto-persist on field blur to `draftContent` column
- Regenerate content without losing hero selection — re-run Step 1 keeping confirmed hero in `draftContent`

**Defer (v2+):**
- Batch pipeline — per-product hero selection makes batching complex
- Template switching in editor — backward-compat not guaranteed
- Version history for edits — requires versioning layer in DB

**Anti-features to explicitly reject:**
- Auto-apply AI edits to GrapesJS canvas — DOM/GrapesJS model cannot sync back to `DetailPageData` struct reliably
- Real-time AI re-generation on field change — FAL.AI is $0.03-0.08/image; economically irrational
- Separate pages for each pipeline step — navigation complexity, loses context; extend existing `/sourcing/[id]/editor` instead

### Architecture Approach

The architecture is a status-gated two-phase agent task pattern: Step 1 writes `draftContent` and sets `pipelineStep = content_ready`; the frontend shows the editor only when this status is detected; user edits are persisted via debounced `PUT /api/products/:id/draft-content`; Step 2 reads `draftContent` (not `rawData` or `processedData`) and runs FAL.AI calls, then writes `processedData` and clears `pipelineStep`. Agents never communicate directly — only through the DB state. The existing oneshot `content` agent remains unchanged for backward compatibility.

**Major components:**

1. `ContentStep1Agent` (new Python) — parallel: image analysis + OCR + LLM copywriting; writes `draftContent`, sets `status = 'content_ready'`
2. `ContentStep2Agent` (new Python) — reads confirmed `draftContent` including `hero_url`; parallel FAL.AI calls; assembles `DetailPageData`; writes `processedData`
3. `PUT /api/products/:id/draft-content` (new NestJS) — merge-on-save user edits into `draftContent` JSONB; flat merge is sufficient (no deep diff needed)
4. `buildPreviewFromDraft()` (new NestJS helper) — maps `DraftContent` + raw image URLs to `DetailPageData` shape for editor preview
5. Editor page `/sourcing/[id]/editor` (modified) — structured form panel (text + color pickers + hero picker), save-on-change, Step 2 trigger button, extended status polling

**Data flow:**
```
User triggers Step 1 → content_step1 agent → draftContent written → status: content_ready
  → Frontend polls, detects content_ready → editor loads with original images + edit controls
  → User edits (debounced PUT) → confirmed edits in draftContent
  → User clicks "이미지 생성 확정" → content_step2 agent → FAL.AI → processedData written
  → Frontend polls, detects status: draft (with processedData) → final preview shown
```

### Critical Pitfalls

1. **Intermediate state overwrites final output** — both Step 1 and Step 3 write to `processed_data`, causing Step 3 to silently clobber user edits. Prevent by using `draftContent` for Step 1 output exclusively; `processedData` is only ever written by Step 3. Hard DB-level separation, not convention.

2. **Agent reads stale DB state at runtime** — agent task triggered with only `productId`; by the time agent executes (queue delay), user may have changed editor state. Prevent by snapshotting confirmed edits into `agent_tasks.input` at trigger time; Step 2 agent reads only from `task.input.confirmed_content`, never from live DB reads.

3. **Hero image selection lost in frontend state** — hero URL held in React `useState`, never persisted. Prevent by debounced `PUT /api/products/:id/draft-content` on every hero selection change; `draftContent.hero_url` in DB is the single source of truth.

4. **FAL.AI uses wrong source image after hero switch** — Step 2 agent still reads `ext_data.images[0]` instead of user-confirmed hero. Prevent by requiring `hero_image_url` as an explicit field in `agent_tasks.input`; agent must never fall back to `ext_data.images[0]` when confirmed URL is present.

5. **Status state machine inadequate for two-step pipeline** — frontend polling `products.status` stops after Step 1 sets `status = 'draft'`, UI thinks processing is complete. Prevent by introducing `pipelineStep` column (`null | content_ready | images_generating`); frontend routes editor behavior on `pipelineStep`, not `products.status`.

6. **`processed_data` format incompatible with editor after pipeline split** — Step 1 produces partial `DetailPageData` with raw image URLs; existing editor path renders these as watermarked 1688 images. Prevent by defining `ContentDraft` type separately from `DetailPageData`; editor preview at Step 2 uses `ContentDraft` + `buildPreviewFromDraft()` helper, never passes through `parseDetailPageData()`.

---

## Implications for Roadmap

Based on research, the dependency chain is: DB schema → Python agents → NestJS API → Frontend. Schema decisions at Phase 1 cascade into every subsequent phase. Starting without them risks mid-project migrations.

### Phase 1: Schema and Type Foundations

**Rationale:** All six critical pitfalls have root causes in schema design. Introducing `draftContent` and `pipelineStep` columns before writing any agent or frontend code prevents migration pain and eliminates the state-overwrite risk class entirely. `DraftContent` type definition prevents the format-break pitfall.

**Delivers:** `products.draftContent Json?`, `products.pipelineStep String?` columns in DB; `DraftContent` TypeScript interface; empty stub registrations for `content_step1` and `content_step2` in `runner.py`; verified that existing oneshot `content` agent still works end-to-end.

**Addresses:** Content-only generation mode dependency; pipeline stage tracking.

**Avoids:** Pitfall 1 (state overwrite), Pitfall 3 (format break), Pitfall 6 (status state machine).

**Must do first:** `npm run db:push && npx prisma generate` before any agent code is written.

---

### Phase 2: Python Agent Split

**Rationale:** Agent logic is the core of the pipeline. Splitting before the NestJS API allows integration testing of the DB state transitions (`content_ready`, agent writes, `draft`) before the frontend consumes them. The oneshot agent is left unchanged as a safety net.

**Delivers:** `ContentStep1Agent` (analyze + OCR + copywriting → `draftContent`); `ContentStep2Agent` (reads `draftContent.hero_url`, runs FAL.AI in parallel → `processedData`); `runner.py` registration; integration test verifying: trigger step1 → inspect `draftContent` in DB → trigger step2 → inspect `processedData`.

**Addresses:** Content-only generation step; hero-based unified image generation trigger.

**Avoids:** Pitfall 2 (agent reads wrong state at runtime), Pitfall 4 (hero selection lost), Pitfall 5 (FAL.AI uses wrong source image).

**Performance note:** `_analyze_product()` (Gemini image classification) is NOT needed in Step 1 for the hero-based flow — `detail_indices` are no longer used. Removing it saves 20+ seconds and one Gemini API call per product.

**Size chart OCR note:** `_scan_size_charts()` may be deferred to Step 3 if the user can select which images include size charts. Acceptable trade-off if Step 1 latency is a concern.

---

### Phase 3: NestJS API Extensions

**Rationale:** Backend API exposes the new DB columns to the frontend. Two new endpoints: `PUT /api/products/:id/draft-content` for edit persistence, and extending `GET /api/products/:id/preview` to serve `draftContent`-based preview when `processedData` is null.

**Delivers:** `updateDraftContent()` service method with flat JSON merge; `buildPreviewFromDraft()` helper mapping DraftContent + raw image URLs to DetailPageData shape; modified preview endpoint; verified that existing products (old monolithic pipeline, `processedData` set, no `draftContent`) still load in editor without error.

**Addresses:** Edit persistence, editor backward compatibility.

**Avoids:** Pitfall 3 (format break in editor), Pitfall 4 (hero lost before trigger).

**Security note:** Validate that hero URL in `PUT /api/products/:id/draft-content` is from known CDN domains (1688, alicdn, FAL.AI output) before writing; sanitize text fields to prevent XSS in rendered template HTML.

---

### Phase 4: Frontend Editor Integration

**Rationale:** Frontend is the last layer because it depends on API contract from Phase 3 and agent behavior from Phase 2. Building it last means integration can be done against real backend, not mocks.

**Delivers:** `react-colorful@5.6.1` installed; structured edit panel (text fields + `HexColorPicker` inside `@radix-ui/react-popover` + hero image grid); debounced `PUT` on every field change; `triggerStep2()` function in `sourcing-api.ts`; "이미지 생성 확정" button; extended polling handling `content_ready` (editor active), `images_generating` (spinner), `draft`+`processedData` (final preview); stop polling during Step 2 editing, restart on Step 3 trigger.

**Addresses:** Structured field editor, live template preview, hero picker, confirmation CTA, status indicators.

**Avoids:** Pitfall 4 (hero in React state only), UX pitfall of showing GrapesJS canvas when structured form is sufficient.

**UX notes from research:**
- Step 1 trigger CTA: "콘텐츠 생성" (not "AI 가공" — ambiguous)
- Step 3 trigger CTA: "이미지 생성 확정"
- Per-image progress if feasible: "배너 완료 — 메인 완료 — 상세 1/3..."
- GrapesJS is retained for final HTML export only, not as the editing surface

---

### Phase Ordering Rationale

- Schema first because both pitfall classes (state overwrite, format break) are rooted in DB column design — fixing them later requires migrations and data repair scripts.
- Python agents second because they produce the DB state transitions the API and frontend depend on; integration-testable independently.
- NestJS API third because it translates DB state into an HTTP contract the frontend can build against.
- Frontend last because it is the only layer with no downstream dependents — iteration is cheap once the contract is stable.
- Oneshot `content` agent is never modified — it remains the fallback for any product that needs full one-shot processing, and it validates that the DB schema additions are backward-compatible.

### Research Flags

Phases with well-documented patterns (skip research-phase):
- **Phase 1:** Standard Prisma nullable column addition; `npm run db:push` pattern already established in project.
- **Phase 3:** NestJS controller + service pattern is the project standard; merge-on-save for JSONB is a one-liner.
- **Phase 4:** `react-colorful` inside Radix Popover is documented; polling extension follows existing 3-second pattern.

Phases that may need targeted research during planning:
- **Phase 2:** FAL.AI source URL handling — research confirms that 1688 CDN URLs may be rejected by FAL.AI; `download_image_with_type()` in `http_utils.py` is the mitigation, but the exact flow (base64 vs. re-upload to signed URL) should be confirmed against FAL.AI docs before implementation.
- **Phase 2:** `_scan_size_charts()` PaddleOCR latency impact — whether to include in Step 1 or Step 3 depends on measured latency; spike recommended before committing.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Existing codebase verified directly; `react-colorful` confirmed via GitHub/search (npm 403 during research, but package existence and bundle size confirmed) |
| Features | HIGH | Based on direct codebase inspection of existing pipeline + competitor pattern analysis (eBay 95% edit rate finding from MEDIUM-confidence source) |
| Architecture | HIGH | Based on direct inspection of all relevant source files; patterns verified against existing codebase conventions |
| Pitfalls | HIGH | Based on direct codebase inspection; all six critical pitfalls derive from verifiable code paths in `template_pipeline.py`, `agent.py`, and `editor/page.tsx` |

**Overall confidence:** HIGH

### Gaps to Address

- **FAL.AI source URL handling:** `react-colorful` npm page returned 403 during research; `download_image_with_type()` exists but exact FAL.AI submission format (base64 vs. signed URL) is not confirmed from docs. Verify during Phase 2 implementation before writing the Step 2 agent's image submission code.

- **`_analyze_product()` removal scope:** Research recommends removing Gemini image classification from Step 1 since `detail_indices` are not used in hero-based flow. Confirm with product owner whether `detail_indices` selection should remain as a user-configurable option (detail image picker) or be fully removed. If retained, it belongs in Step 1; if removed, Gemini cost drops to zero for Step 1.

- **Size chart OCR placement:** `_scan_size_charts()` (PaddleOCR) adds 10-30 seconds to Step 1. Decision pending on whether size chart indices should be user-selectable (defer OCR to Step 3 or make it lazy) or auto-detected (keep in Step 1 and accept the latency). Spike on latency before Phase 2 commit.

- **`ImagePickerModal` reuse eligibility:** FEATURES.md notes the existing `ImagePickerModal` component may be suitable as the hero picker. Inspect the component during Phase 4 planning to confirm its API accepts raw source image URLs and emits a selection callback, or whether a new hero picker grid must be built.

---

## Sources

### Primary (HIGH confidence)
- Codebase: `agents/src/agents/content/agent.py`, `template_pipeline.py`, `models.py` — pipeline structure verified
- Codebase: `agents/src/agents/content/pipeline_base.py` — FAL.AI integration pattern
- Codebase: `agents/src/runner.py` — LISTEN/NOTIFY and agent registration pattern
- Codebase: `apps/web/src/app/sourcing/[id]/editor/page.tsx` — current editor flow
- Codebase: `apps/web/src/lib/sourcing-api.ts` — agent task trigger pattern
- Codebase: `apps/server/src/products/products.controller.ts` — existing preview endpoint
- Codebase: `apps/web/src/components/editor/DetailPageEditor.tsx` — GrapesJS integration
- Codebase: `prisma/schema.prisma` — Product model, AgentTask schema, `processed_data Json?`
- Codebase: `apps/web/package.json` — existing dependencies verified
- [react-colorful GitHub](https://github.com/omgovich/react-colorful) — bundle size 2.8 KB, React 16.8+ peer dep
- [FAL.AI Pricing](https://fal.ai/pricing) — $0.03-0.08/image cost justification
- [Radix UI Popover docs](https://www.radix-ui.com/primitives/docs/components/popover) — already at ^1.1.15

### Secondary (MEDIUM confidence)
- [Built a Fully Automated AI Content Creation Pipeline with Multi-Stage Approvals](https://medium.com/@goodnessprosper27/built-a-fully-automated-ai-content-creation-pipeline-with-multi-stage-approvals-5e708253d2dd) — multi-stage approval pattern
- [How AI Content Generation Tools Handle Content Approval Workflows](https://storyteq.com/blog/how-do-ai-content-generation-tools-handle-content-approval-workflows/) — approval workflow patterns
- [Retailers test generative AI for product detail page content](https://www.digitalcommerce360.com/2023/09/21/retailers-test-generative-ai-to-create-product-detail-page-content/) — eBay 95% seller edit rate finding

---

*Research completed: 2026-03-25*
*Ready for roadmap: yes*
