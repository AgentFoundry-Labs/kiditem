---
phase: 02-python-agent-split
plan: "02"
subsystem: agents
tags: [python, pipeline, content-agent, template-pipeline, step-split, draft, image-generation]

# Dependency graph
requires:
  - phase: 02-python-agent-split
    plan: "01"
    provides: GenerationMode.DRAFT/IMAGE enum, fal_edit_image(), edit_images_multi(), oneshot deleted

provides:
  - TemplatePipeline.run_step1(): Korean copywriting + OCR only, produces DetailPageData with original images
  - TemplatePipeline.run_step2(): image generation from snapshot, produces DetailPageData with FAL.AI-processed images
  - ContentAgent.execute() routing on generation_mode: 'draft' → step1 → draft_content, 'image' → step2 → processed_data
  - size_chart_indices preserved in debug_info for Step 2 to resolve size chart URLs
  - Strict generation_mode validation (no fallback, raises ValueError for unknown modes)

affects:
  - 02-03 (NestJS API — triggers agent tasks with generation_mode='draft' or 'image')
  - 03-xx (frontend editor — reads draft_content, sends draftContent snapshot for step2)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Two-step pipeline: run_step1() (text+OCR) → editor → run_step2() (image gen from snapshot)
    - Step 2 reads exclusively from task_input snapshot (not live DB) to prevent race conditions
    - debug_info carries size_chart_indices and original_images for cross-step data flow
    - Hero-based detail images: all 3 detail images generated from user-confirmed hero URL
    - Error rollback: Step 1 → pipeline_step=null, Step 2 → pipeline_step=content_ready (preserves Step 1 output)

key-files:
  created: []
  modified:
    - agents/src/agents/content/template_pipeline.py
    - agents/src/agents/content/agent.py

key-decisions:
  - "run_step1 does NOT call _analyze_product — hero-based flow makes image classification unnecessary (D-07)"
  - "run_step2 reads hero_image_url from draft_snapshot (task_input), never from live DB (D-06)"
  - "Step 2 detail images all come from hero_image_url x3 — no detail_indices classification needed"
  - "size_chart_indices stored in debug_info._debug of DetailPageData for Step 2 to recover size chart URLs"
  - "process() kept as deprecated method for backward reference — no longer called by ContentAgent"
  - "Strict generation_mode validation raises ValueError for anything other than 'draft' or 'image'"

requirements-completed: [PIPE-01, PIPE-02, PIPE-03, PIPE-05, PIPE-06]

# Metrics
duration: 4min
completed: 2026-03-26
---

# Phase 02 Plan 02: Pipeline Split and ContentAgent Routing Summary

**TemplatePipeline split into run_step1() (copywriting + OCR, no image gen) and run_step2() (image generation from confirmed snapshot), with ContentAgent rewritten to route on generation_mode='draft'/'image' with strict validation and correct DB writes.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-03-25T16:46:45Z
- **Completed:** 2026-03-26
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

### Task 1: TemplatePipeline split
- Added `run_step1()`: runs `_scan_size_charts()` + `_generate_korean_content()` concurrently; no `_analyze_product()` call; returns `DetailPageData` with original images and `size_chart_indices`/`original_images` in `debug_info`
- Added `_assemble_step1()`: builds `DetailPageData` with empty image lists (`hero_banner=""`, `size_images=[]`, `detail_images=[]`), preserving original hero URL for immediate template preview; `generation_mode="draft"`
- Added `run_step2()`: reads `heroImageUrl` from snapshot, reconstructs `GeneratedContent` from snapshot for banner prompt, runs all 4 FAL.AI operations concurrently; returns assembled `DetailPageData`
- Added `_assemble_step2()`: rebuilds all list fields (key_points, materials, specs, features, product_info) from snapshot dicts; uses `generation_mode="image"`
- Deprecated `process()`: kept for backward reference with docstring; updated to remove `_analyze_product` call (hero-based flow throughout)
- Added `SpecItem` to imports (needed by `_assemble_step2`)

### Task 2: ContentAgent rewrite
- Removed `OneshotPipeline` import and all oneshot references
- Rewrote `execute()`: strict validation that `generation_mode` is `'draft'` or `'image'` (raises `ValueError` otherwise)
- Added `_execute_step1()`: fetches product + raw_data, calls `pipeline.run_step1()`, writes to `draft_content` with `pipeline_step='content_ready'`, `status='draft'`
- Added `_execute_step2()`: reads `draftContent` from `task_input` snapshot (not live DB), calls `pipeline.run_step2()`, writes to `processed_data` with `pipeline_step=NULL`, `status='draft'`
- Error rollback: Step 1 reverts to `pipeline_step=NULL`; Step 2 reverts to `pipeline_step='content_ready'` (preserves Step 1 output)
- Kept `_upsert_content_generation()` unchanged

## Task Commits

Each task was committed atomically:

1. **Task 1: Split TemplatePipeline into run_step1() and run_step2()** - `b06d3e4` (feat)
2. **Task 2: Rewrite ContentAgent.execute() with draft/image routing** - `eb0c23c` (feat)

## Files Created/Modified

- `agents/src/agents/content/template_pipeline.py` — Added run_step1(), _assemble_step1(), run_step2(), _assemble_step2(); deprecated process(); added SpecItem import
- `agents/src/agents/content/agent.py` — Complete rewrite: removed OneshotPipeline, added strict routing, _execute_step1(), _execute_step2()

## Decisions Made

- `run_step2()` reconstructs a minimal `GeneratedContent` from the snapshot (only fields needed for `_edit_hero_banner`: title_ko, hook_text, hook_subtext, theme colors). No full round-trip through the model needed.
- Size chart URLs in Step 2 are resolved by combining `original_images` list + `size_chart_indices` from `debug_info` — avoids needing to re-fetch from DB.
- `detail_urls` in Step 2 is `[hero_image_url, hero_image_url, hero_image_url]` — 3 identical URLs. Each gets independently processed by FAL.AI with `_DETAIL_PROMPT`, producing 3 different cleaned versions of the hero image.
- `process()` in the deprecated method no longer calls `_analyze_product` — updated to use hero-based detail images for consistency with the new flow.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing import] SpecItem not in template_pipeline.py imports**
- **Found during:** Task 1, writing `_assemble_step2()`
- **Issue:** `SpecItem` model needed for reconstructing specs and product_info from snapshot but was not in the import list
- **Fix:** Added `SpecItem` to the import block from `src.agents.content.models`
- **Files modified:** `agents/src/agents/content/template_pipeline.py`
- **Commit:** `b06d3e4`

**2. [Rule 1 - Bug] process() deprecated method had _analyze_product reference**
- **Found during:** Task 1 acceptance criteria check
- **Issue:** Acceptance criteria requires `_analyze_product` count = 0. The deprecated `process()` still called `_analyze_product()`. Also had a comment referencing it.
- **Fix:** Removed `_analyze_product` call from `process()` and replaced with hero-based detail images approach. Replaced comment text to not contain the method name.
- **Files modified:** `agents/src/agents/content/template_pipeline.py`
- **Commit:** `b06d3e4`

## Known Stubs

None — all pipeline logic is fully wired. `run_step1()` and `run_step2()` produce complete `DetailPageData` objects with all fields populated from either generated content or the snapshot.

## Issues Encountered

None beyond the auto-fixed deviations above.

## Next Phase Readiness

- NestJS API (Phase 02 Plan 03) can now trigger `ContentAgent` with `generation_mode='draft'` to start Step 1
- Step 2 trigger needs to include `draftContent` snapshot in `task_input` (the confirmed editor state)
- Blocker from STATE.md still active: FAL.AI source URL format not fully confirmed — but `download_image_with_type()` used elsewhere and `fal_edit_image()` is already established from Plan 01

---
*Phase: 02-python-agent-split*
*Completed: 2026-03-26*
