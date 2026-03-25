# Pitfalls Research

**Domain:** AI content generation pipeline — multi-step split with human editing
**Researched:** 2026-03-25
**Confidence:** HIGH (based on direct codebase inspection + established patterns for similar systems)

---

## Critical Pitfalls

### Pitfall 1: Intermediate State Overwrites Completed Processing

**What goes wrong:**
Step 2 (content generation, no images) writes to `products.processed_data`. Step 3 (image generation) also writes to `products.processed_data`. If the agent runs a second full pipeline run — triggered accidentally or by retry logic — it overwrites the user's edits from Step 2 without warning. The user's hero image selection and text edits silently disappear.

**Why it happens:**
The current `ContentAgent.execute()` always writes the entire `DetailPageData` struct to `processed_data` at the end of its run. There is no concept of "partial" or "staged" state — the column holds one opaque JSON blob. When the pipeline becomes two distinct agent tasks, both tasks write to the same column, and the second one clobbers whatever the first wrote (plus user edits on top).

**How to avoid:**
Split the state into two distinct columns at the schema level, not just by convention:
- `content_draft` — written by Step 1 (content agent), never touched by Step 3
- `processed_data` — written only by Step 3 (image agent), after merging confirmed user edits

Never let the image agent read from `processed_data` — it must read from `content_draft` + a user-confirmed edit column. This enforces a hard boundary at the DB level.

**Warning signs:**
- A single `processed_data` column being written by two different agent types
- Agent task input that reads `product.processed_data` to get the "source" for image generation
- No `content_draft` or `user_edits` column in schema

**Phase to address:**
Phase 1 — Schema design. Introducing separate columns after Phase 2 is a migration, not an addition.

---

### Pitfall 2: Agent Task Input Does Not Capture User Edits at Trigger Time

**What goes wrong:**
The frontend fires `POST /api/agent-tasks` to trigger Step 3. The agent task input records `{ productId, generation_mode: "template" }`. The agent then reads the product row from DB to get the hero image selection and text content. But by the time the agent actually executes (polled queue, potentially 5-30 seconds), the user may have changed something else in the editor. The agent picks up the wrong state.

**Why it happens:**
The existing `agent_tasks.input` JSON carries only the product ID, not the snapshot of what the user actually confirmed. The agent is designed to "read from DB at runtime" which is fine for a single-step pipeline but is a race condition in a multi-step human-in-the-loop flow.

**How to avoid:**
Snapshot the user's confirmed edits into `agent_tasks.input` at the moment the trigger API is called. The image agent must use `task.input.confirmed_content` as its source of truth — it must not re-read `processed_data` or `raw_data` at runtime. Treat `agent_tasks.input` as an immutable contract for that execution.

**Warning signs:**
- Agent task input contains only `productId` and no content fields
- Agent calls `pool.fetchrow("SELECT processed_data FROM products ...")` at the start of its `execute()` to decide what to generate
- No "confirm content" API endpoint that serializes the user's current editor state

**Phase to address:**
Phase 1 — Define the API contract for triggering Step 3 before writing the agent.

---

### Pitfall 3: `processed_data` Format Breaks Existing Editor Page

**What goes wrong:**
The editor page at `/sourcing/[id]/editor` currently loads `processed_data` via `GET /api/products/:id/preview`, passes it through `parseDetailPageData()` → `renderTemplateToHtml()`, and injects the resulting HTML into GrapesJS. If the new pipeline stores a `DetailPageData` struct with missing or renamed fields (e.g., `hero_image_url` instead of `images[0]`), the template rendering silently produces blank sections or throws. The editor appears to load but has invisible content.

**Why it happens:**
`DetailPageData` is used as the interface between the Python agent and the React template. When the pipeline is split, the intermediate state (Step 1 output) is a partial `DetailPageData` — it has all the text fields but `images` contains raw source URLs, not processed FAL.AI outputs. Templates that render `images[0]` will show 1688 watermarked source images instead of the clean studio shot.

**How to avoid:**
Define two explicit types:
1. `ContentDraft` — text + colors + raw source image URLs (Step 1 output, editor input)
2. `DetailPageData` — final complete struct with all processed image URLs (Step 3 output)

The editor preview in Step 2 must use `ContentDraft` with source images. Do not render the final template layout during editing — use a simplified preview component. The final `DetailPageData` is assembled only by Step 3.

**Warning signs:**
- The editor page using the same `parseDetailPageData()` path for both intermediate and final state
- Step 1 agent writing a partial `DetailPageData` to `processed_data`
- Template rendering errors that only appear after the pipeline split, not before

**Phase to address:**
Phase 1 — Define ContentDraft type and separate it from DetailPageData before touching the pipeline.

---

### Pitfall 4: Hero Image Selection Stored Only in Frontend State

**What goes wrong:**
The user picks a hero image in the Step 2 editor. This selection is held in React state (or GrapesJS editor state). When the user clicks "Generate Images," the frontend sends the `productId`. The backend or agent must then figure out which image was selected — but it was never persisted to DB. The agent falls back to `raw_data.images[0]`, which may differ from what the user selected.

**Why it happens:**
GrapesJS is a full HTML editor — its "save" action produces rendered HTML, not structured data. There is no natural "save hero image selection" event in the current save flow (`handleSave` just receives `_html` and redirects). Developers assume the user's current selection will make it to the agent somehow.

**How to avoid:**
Create an explicit "confirm content" API (`PATCH /api/sourcing/:id/content-confirm`) that accepts structured data: `{ hero_image_url, theme_colors, text_overrides }`. This API writes to `products.content_draft` and returns the confirmed state. The "Generate Images" button calls this API first, then triggers the agent task with the confirmed snapshot as input.

**Warning signs:**
- No API endpoint that accepts and persists the hero image URL selection
- Agent task trigger (`POST /api/agent-tasks`) is called directly from UI without a prior "confirm" call
- Hero URL lives only in React `useState`

**Phase to address:**
Phase 2 — Editor UI integration. Must be designed before the editor component is built.

---

### Pitfall 5: FAL.AI Image Generation Called With Wrong Source Image After Hero Switch

**What goes wrong:**
The current `_edit_hero_banner()` and `_edit_main_image()` both take `hero_url` — always `ext_data.images[0]`. After the pipeline split, the image generation step should use the user-confirmed hero URL, not `images[0]`. If the agent still reads `images[0]` from `raw_data`, it generates from the wrong source image even when the user explicitly chose a different one.

**Why it happens:**
The `TemplatePipeline.process()` method reads `hero_url = ext_data.images[0]` directly from the extension data. This works when the pipeline is monolithic because no user selection is possible. After the split, `ext_data` is still available but the user's selection must override `images[0]`.

**How to avoid:**
The Step 3 image agent must receive the confirmed hero URL as an explicit parameter in `agent_tasks.input`, not derive it from `ext_data`. The agent should never fall back to `ext_data.images[0]` when `confirmed_hero_url` is present in the task input.

**Warning signs:**
- New image agent's `execute()` still constructs `ExtensionProductData` and calls `ext_data.images[0]`
- No `hero_image_url` field in `agent_tasks.input` for image generation tasks
- FAL.AI banner generation prompts reference `ext_data` category and title but use a different image source

**Phase to address:**
Phase 3 — Image agent implementation. Enforce via required field in task input schema.

---

### Pitfall 6: `product.status` State Machine Breaks With Two-Step Pipeline

**What goes wrong:**
The current status flow is: `draft` → `processing` → `draft` (on completion). With two pipeline steps, the product will cycle through `processing` twice, and the frontend 3-second polling loop will declare "done" after Step 1, before Step 3 has run. The user sees the editor with draft text content, thinking full processing is complete, then triggers Step 3 manually — but the UI has no state to represent "content ready, images not yet generated."

**Why it happens:**
The `status` field in `products` is a single string with no substatus. The frontend polling loop checks `status !== 'PROCESSING'` to stop. After Step 1 completes, status becomes `draft`, polling stops, and the UI normalizes. The multi-step nature is invisible.

**How to avoid:**
Introduce explicit pipeline stage tracking. Options:
1. Add a `pipeline_stage` column: `null | 'content_ready' | 'images_ready'`
2. Use `ContentGeneration.status` as the granular tracker and never rely on `products.status` for pipeline progress

Option 1 is simpler given the existing Prisma pattern. The frontend should poll `ContentGeneration.status` (already present in the schema) rather than `products.status`.

**Warning signs:**
- Frontend polling `products.status` to drive the two-step UI
- No `pipeline_stage` or equivalent field in the product or content generation record
- Both Step 1 and Step 3 setting `products.status = 'draft'` on completion

**Phase to address:**
Phase 1 — Schema design. Adding `pipeline_stage` requires a migration; must happen before either agent is modified.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Reuse `processed_data` column for both content draft and final output | No schema migration | Silent overwrites between steps; editor shows wrong state | Never — one column per pipeline stage minimum |
| Skip "confirm content" API and embed hero URL in the trigger request directly | Faster to implement | Hero selection not persisted; lost on refresh before triggering Step 3 | Never — user's choice must be durable |
| Keep `TemplatePipeline` monolithic and add conditional branches for hero override | Avoids refactoring | `TemplatePipeline.process()` grows to ~600 lines of branched logic | Acceptable only for a temporary spike to prove FAL.AI behavior |
| Use GrapesJS HTML export as intermediate state instead of structured JSON | No new type needed | Cannot extract hero URL, theme colors, or text diffs from HTML reliably | Never for structured data like hero image selection |
| Keep image classification (`detail_indices`) code path alongside hero-based path | Safe fallback | Two code paths diverge over time; category tone/mood resolution duplicated | Acceptable only if removing classification is a later phase |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| FAL.AI (`fal_edit_image`) | Passing a 1688 CDN URL directly as source; FAL.AI may reject or fetch stale/blocked images | Download the image to local temp storage first, then pass via base64 or a public URL from your own domain |
| FAL.AI banner generation | Using theme color hex strings directly in prompt (e.g., `#fffaf0`); LLMs map hex to wrong colors | Translate hex to descriptive color names in the prompt: `warm cream white` not `#fffaf0` |
| `agent_tasks` LISTEN/NOTIFY | Runner claims a new task while Step 1 result is still being written; Step 3 starts before `content_draft` is committed | Use a DB transaction that inserts the Step 3 task only after `content_draft` is written in the same transaction |
| GrapesJS `onSave` callback | `onSave` receives rendered HTML; cannot reconstruct `DetailPageData` from HTML reliably | Never use GrapesJS HTML as a data store. Save structured data separately before GrapesJS save fires |
| `products.processed_data` JSONB | `asyncpg` raw SQL requires explicit `::jsonb` cast for `$1` params; missing cast causes silent storage of string instead of JSON object | Always use `$1::jsonb` when writing JSON to JSONB columns. Current code already does this — must be preserved in new agents |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Running `_analyze_product()` in Step 1 when it's only needed to select `detail_indices` | Step 1 takes 20+ seconds; image analysis cost billed twice (Step 1 + Step 3) | In hero-based flow, `detail_indices` is not needed; remove `_analyze_product()` from Step 1 entirely | Immediately — doubles API cost |
| 3-second frontend polling running while user is editing in Step 2 | Unnecessary API calls during editing session; server logs polluted | Stop polling after Step 1 completes; re-start polling only when user triggers Step 3 | At any scale — polling during edit is always wrong |
| FAL.AI calls for main, banner, and all detail images running in parallel | Memory/concurrency spike if 5+ images queued at once with large dimensions | Cap parallel FAL.AI calls to 3 with a semaphore (already done for OCR downloads — same pattern) | When product has 4+ detail images |
| Size chart OCR (`_scan_size_charts`) running in Step 1 when user may override the hero image anyway | OCR adds 10-30 seconds; result may be discarded if user selects a hero with no size chart | Defer OCR to Step 3 where the confirmed image set is known, or run it lazily on user request | From the first run — wasted time every time |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Accepting hero image URL from frontend without validation | SSRF: agent fetches attacker-controlled URL, exposing internal network | Validate that hero URL is from known image CDNs (1688, alicdn, FAL.AI output domain) before passing to FAL.AI |
| Storing unvalidated `text_overrides` from the "confirm content" API directly in `content_draft` | XSS in the rendered template HTML if title/hook text contains script tags | Sanitize all user-provided text fields before writing to `content_draft` |
| `agent_tasks.input` containing full `DetailPageData` blob from untrusted frontend | Inflated JSON payloads; potential injection into FAL.AI prompts | Accept only a whitelist of fields in the confirm API; reconstruct the generation prompt server-side |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Showing a GrapesJS full editor for Step 2 when the user only needs to pick a hero image, tweak text, and set a color | Overwhelm; user doesn't know what to edit in 200+ component tree | Show a structured form for Step 2: hero image picker carousel, text fields, color swatches — no GrapesJS canvas needed at this step |
| No preview of what the generated images will look like before confirming | User triggers FAL.AI (expensive + slow) without knowing the expected output | Show the raw source image with the selected theme color overlaid as a rough preview; make it clear this is "before generation" |
| Progress indicator only shows "generating..." with no substep breakdown | 40-60 second wait with spinning loader; user refreshes thinking it froze | Show per-image progress: "Banner — done", "Main image — done", "Detail 1 — 3/3..." |
| Triggering Step 3 from a button labeled "AI 가공" (same as the current full pipeline button) | User cannot distinguish between regenerating content vs. regenerating images | Separate CTA labels: Step 1 = "콘텐츠 생성", Step 2 edit = "편집", Step 3 = "이미지 생성" |
| Editor page loses user's unsaved edits on navigation away | User clicks back and loses all text changes | Persist draft to `content_draft` column on every field blur, not only on explicit save |

---

## "Looks Done But Isn't" Checklist

- [ ] **Schema migration:** `content_draft` column exists in `products` — run `npm run db:push` and verify via DB studio before writing any agent code
- [ ] **Confirm API:** `PATCH /api/sourcing/:id/content-confirm` returns `201` with the persisted snapshot including `hero_image_url`
- [ ] **Step 3 agent:** `execute()` reads `hero_image_url` from `task.input`, NOT from `pool.fetchrow("SELECT raw_data ...")` — verify by logging the source URL at agent startup
- [ ] **Backward compat:** Existing products with `processed_data` but no `content_draft` must still load in the editor without error — verify with a product that completed the old monolithic pipeline
- [ ] **Polling stops correctly:** After Step 1 completes, frontend stops polling status; after Step 3 completes, frontend re-fetches and shows final state — verify the transition is clean with no stale cache
- [ ] **Hero-only generation:** `_analyze_product()` is NOT called in the new Step 3 agent — confirm no Gemini/analysis API call in logs during image generation
- [ ] **FAL.AI source URL:** The URL passed to `fal_edit_image` is the user's confirmed hero URL, not `ext_data.images[0]` — log and verify on first test run

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| `processed_data` overwritten by Step 3 before user confirmed edits | MEDIUM | Add `content_draft` column, write a migration script that copies current `processed_data` into `content_draft` for all products in `content_ready` pipeline stage |
| Hero URL embedded in React state lost before Step 3 triggered | LOW | Add auto-persist to `content_draft` on hero selection; no data migration needed |
| `processed_data` format incompatible with editor after pipeline split | HIGH | Write a compatibility shim in `parseDetailPageData()` that handles both old and new formats; add a `_version` field to the JSON |
| FAL.AI source URL rejection (1688 CDN blocked) | MEDIUM | Add image proxy/download step before FAL.AI submission; already have `download_image_with_type()` in `http_utils.py` — reuse it |
| Two agent tasks creating conflicting DB writes | MEDIUM | Add a `pipeline_stage` guard: Step 3 task must check `pipeline_stage = 'content_ready'` before executing; fail fast if not |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Intermediate state overwrites (Pitfall 1) | Phase 1: Schema | `content_draft` column in DB; Step 1 writes there, Step 3 never touches it |
| Agent reads wrong state at runtime (Pitfall 2) | Phase 1: API contract | `agent_tasks.input` contains `hero_image_url` and `confirmed_content` fields in test task |
| `processed_data` format breaks editor (Pitfall 3) | Phase 1: Type definitions | `ContentDraft` type defined; editor preview uses it independently of `DetailPageData` |
| Hero selection lost in frontend state (Pitfall 4) | Phase 2: Confirm API | `PATCH /api/sourcing/:id/content-confirm` returns persisted record with `hero_image_url` |
| FAL.AI uses wrong source image (Pitfall 5) | Phase 3: Image agent | First integration test: select non-default hero image; verify FAL.AI log shows that URL |
| `product.status` state machine inadequate (Pitfall 6) | Phase 1: Schema | `pipeline_stage` column exists; frontend polls `ContentGeneration.status` instead of `products.status` |

---

## Sources

- Direct codebase inspection: `agents/src/agents/content/template_pipeline.py`, `agent.py`, `models.py`, `pipeline_base.py`
- Direct codebase inspection: `apps/web/src/app/sourcing/[id]/editor/page.tsx`, `[id]/page.tsx`
- Direct codebase inspection: `prisma/schema.prisma` — confirmed single `processed_data` JSONB column
- Pattern: human-in-the-loop pipeline state management — established practice in workflow engine systems (n8n pattern observed in `apps/server/src/workflows/`)
- Pattern: agent task input as immutable snapshot — from `AgentTask.input` field design in existing schema
- Pattern: GrapesJS HTML vs. structured data separation — from existing `DetailPageEditor` implementation which receives rendered HTML, not structured data

---

*Pitfalls research for: multi-step AI content pipeline with human editing (KidItem v1.0 milestone)*
*Researched: 2026-03-25*
