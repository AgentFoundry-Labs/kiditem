# Phase 2: Python Agent Split - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Split the monolithic ContentAgent into a two-step pipeline: Step 1 generates Korean copywriting + theme colors (no image generation), Step 2 generates images from confirmed hero image. Remove Oneshot pipeline entirely. The existing `content` agent_type is reused with `generation_mode` routing (`draft` / `image`).

</domain>

<decisions>
## Implementation Decisions

### Agent Type Design
- **D-01:** Reuse existing `content` agent_type. Extend `generation_mode` parameter: `draft` (Step 1: text+colors), `image` (Step 2: FAL.AI image gen). Remove `template` and `oneshot` modes.
- **D-02:** Oneshot pipeline is fully deleted — both code (`oneshot.py`) and routing in `ContentAgent.execute()`. No backward compatibility needed.
- **D-03:** Runner.py's AGENTS dict stays unchanged (`"content": ContentAgent()`). The routing happens inside `ContentAgent.execute()` via `generation_mode`.

### draftContent Assembly (Step 1 Output)
- **D-04:** Claude's Discretion — choose the most practical data shape. Recommendation: DetailPageData-compatible shape with original image URLs (from raw_data) so templates can render immediately without conversion. Include `heroImageUrl` as an additional field.
- **D-05:** Step 1 writes to `draft_content` column (not `processed_data`). Sets `pipeline_step = 'content_ready'`, `status = 'draft'`.

### Step 2 Input Snapshot
- **D-06:** agent_tasks.input for Step 2 carries the FULL draftContent snapshot (user's confirmed edits). Step 2 reads hero_image_url and text content from this snapshot, NOT from the live DB row. This prevents race conditions if user edits between trigger and execution.

### Pipeline Split Details
- **D-07:** Step 1 keeps: `_generate_korean_content()`, `_scan_size_charts()`. Removes: `_analyze_product()` (image classification — unnecessary in hero-based flow).
- **D-08:** Step 2 keeps: `_edit_hero_banner()`, `_edit_main_image()`, `_edit_detail_images()`, `_edit_size_charts()`. All use the user-confirmed hero_image_url from the snapshot, not `ext_data.images[0]`.
- **D-09:** Step 2 output goes to `processed_data` column (same as current). Sets `pipeline_step = null`, `status = 'draft'`.

### Status Transitions (from Phase 1 D-03, D-04)
- **D-10:** Step 1: `status='processing'` → complete → `status='draft', pipeline_step='content_ready'`
- **D-11:** Step 2: `status='processing', pipeline_step='images_generating'` → complete → `status='draft', pipeline_step=null`

### Claude's Discretion
- Code structure: whether to create new pipeline classes or modify TemplatePipeline
- `_assemble()` logic for Step 1 (partial assembly without images) vs Step 2 (full assembly)
- Error handling and status rollback patterns

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Python Agent Code
- `agents/src/agents/content/agent.py` — ContentAgent class to modify (routing logic)
- `agents/src/agents/content/template_pipeline.py` — TemplatePipeline with two asyncio.gather() split point
- `agents/src/agents/content/oneshot.py` — OneshotPipeline to DELETE
- `agents/src/agents/content/pipeline_base.py` — PipelineBase with _analyze_product() to remove
- `agents/src/agents/content/models.py` — DetailPageData, GeneratedContent, ExtensionProductData models
- `agents/src/runner.py` — AGENTS dict, claim_task(), complete_task()
- `agents/CLAUDE.md` — Agent development rules (asyncpg raw SQL, no ORM)

### Schema (Phase 1 output)
- `prisma/schema.prisma` — Product model with draftContent, pipelineStep columns

### Project Rules
- `CLAUDE.md` — Native PG enum 금지, Agent 간 직접 import 금지
- `agents/src/config.py` — AI model env vars (AI_TEXT_MODEL, AI_IMAGE_EDIT_MODEL)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `TemplatePipeline.process()` — two `asyncio.gather()` calls at lines 184 and 203 form natural split point
- `_generate_korean_content()` — Step 1 core, already isolated
- `_scan_size_charts()` — Step 1, already isolated
- `_edit_hero_banner()`, `_edit_main_image()`, `_edit_detail_images()`, `_edit_size_charts()` — Step 2 core
- `_assemble()` method — Step 2 final assembly, needs partial version for Step 1
- `BaseAgent` ABC with `execute(pool, task_input)` pattern

### Established Patterns
- asyncpg raw SQL for DB operations (no ORM)
- `generation_mode` parameter from task_input for pipeline selection
- Status update pattern: `UPDATE products SET status = '...' WHERE id = $1`
- Error handling: catch-all → rollback status → upsert content_generation → re-raise

### Integration Points
- NestJS `POST /api/agent-tasks` creates task with `agentType: 'content'` and `generation_mode` in input
- `pg_notify('new_agent_task', task_id)` wakes runner
- `content_generations` table updated on completion (may need adjustment for two-step)

</code_context>

<specifics>
## Specific Ideas

- Detail images in Step 2 should ALL come from the hero image (user selected), not from `detail_indices` classification
- `_analyze_product()` Gemini call is completely removed — saves one API call + ~20s per product
- Size chart indices from Step 1 (`_scan_size_charts`) need to be preserved in draftContent for Step 2

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-python-agent-split*
*Context gathered: 2026-03-26*
