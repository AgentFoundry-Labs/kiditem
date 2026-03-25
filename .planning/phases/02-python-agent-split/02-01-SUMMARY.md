---
phase: 02-python-agent-split
plan: "01"
subsystem: agents
tags: [python, fal-client, gemini, ai-client, image-editing, pipeline]

# Dependency graph
requires:
  - phase: 01-schema-foundations
    provides: draftContent/pipelineStep schema fields for 2-step pipeline

provides:
  - GenerationMode enum with DRAFT/IMAGE values only
  - AIClient.fal_edit_image() routing through fal-client SDK
  - AIClient.edit_images_multi() routing through Gemini proxy
  - FAL_KEY exported from config.py
  - fal-client>=0.5.0 installed in venv and listed in pyproject.toml
  - Oneshot pipeline fully deleted (oneshot.py + OneshotContent model removed)

affects:
  - 02-02 (pipeline split + agent rewrite — builds on DRAFT/IMAGE enum and new AIClient methods)

# Tech tracking
tech-stack:
  added: [fal-client>=0.5.0]
  patterns:
    - No silent model fallback — all methods raise ValueError if model param is empty
    - Gemini proxy path for multi-image editing via _proxy_gemini_request
    - FAL.AI SDK path for single-image editing via fal_client.run_async

key-files:
  created: []
  modified:
    - agents/src/agents/content/models.py
    - agents/src/core/ai_client.py
    - agents/src/config.py
    - agents/pyproject.toml
  deleted:
    - agents/src/agents/content/oneshot.py

key-decisions:
  - "GenerationMode enum now has DRAFT='draft' and IMAGE='image' only — TEMPLATE and ONESHOT values removed (D-01)"
  - "Oneshot pipeline fully deleted, not refactored — D-02 decision"
  - "fal_edit_image uses fal_client.run_async (FAL.AI SDK), edit_images_multi uses _proxy_gemini_request (Gemini proxy) — two separate routing paths"
  - "Both new AIClient methods enforce mandatory model parameter per CLAUDE.md silent fallback prohibition"

patterns-established:
  - "FAL.AI image editing: fal_edit_image() — URL in, URL out via SDK"
  - "Multi-image Gemini editing: edit_images_multi() — download-as-base64, build inlineData parts, proxy request, extract bytes"

requirements-completed: [PIPE-04]

# Metrics
duration: 2min
completed: 2026-03-25
---

# Phase 02 Plan 01: Data Contracts and AIClient Infrastructure Summary

**GenerationMode enum replaced with DRAFT/IMAGE, oneshot pipeline deleted, and AIClient gained fal_edit_image() (FAL.AI SDK) and edit_images_multi() (Gemini proxy) methods — establishing the contracts Plan 02-02 builds against.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-25T16:42:37Z
- **Completed:** 2026-03-25T16:44:41Z
- **Tasks:** 2
- **Files modified:** 4 (+ 1 deleted)

## Accomplishments

- Replaced `GenerationMode.TEMPLATE/ONESHOT` with `DRAFT/IMAGE` and deleted `OneshotContent` model class
- Deleted `agents/src/agents/content/oneshot.py` entirely (plan D-02 decision)
- Added `fal_edit_image()` to `AIClient` — routes through `fal_client.run_async` (FAL.AI SDK), returns result URL
- Added `edit_images_multi()` to `AIClient` — downloads images as base64, builds Gemini inlineData parts, routes through existing `_proxy_gemini_request`
- Added `FAL_KEY` env var export to `config.py`
- Added `fal-client>=0.5.0` to `pyproject.toml` and installed in venv

## Task Commits

Each task was committed atomically:

1. **Task 1: Update GenerationMode enum, delete OneshotContent model, delete oneshot.py** - `2840644` (refactor)
2. **Task 2: Implement fal_edit_image() and edit_images_multi() on AIClient** - `88b7163` (feat)

## Files Created/Modified

- `agents/src/agents/content/models.py` - GenerationMode changed to DRAFT/IMAGE; OneshotContent class removed
- `agents/src/agents/content/oneshot.py` - DELETED (oneshot pipeline removed per D-02)
- `agents/src/core/ai_client.py` - Added import fal_client; added fal_edit_image() and edit_images_multi() methods
- `agents/src/config.py` - Added FAL_KEY = os.getenv("FAL_KEY", "")
- `agents/pyproject.toml` - Added "fal-client>=0.5.0" to dependencies

## Decisions Made

- `fal_edit_image()` returns a URL string (not bytes) — FAL.AI SDK returns result image URLs, consistent with how TemplatePipeline calls it
- `edit_images_multi()` uses the existing Gemini proxy path — multi-image editing requires the proxy's Gemini API access; not routable through FAL.AI
- Both methods raise `ValueError` if model param is empty — mandatory per CLAUDE.md silent model fallback prohibition

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required beyond existing FAL_KEY env var (already expected to be in .env).

## Next Phase Readiness

- Plan 02-02 can now import `GenerationMode.DRAFT` and `GenerationMode.IMAGE`
- `AIClient.fal_edit_image()` is available for TemplatePipeline hero banner and detail image editing
- `AIClient.edit_images_multi()` is available for TemplatePipeline size chart editing
- Blocker from STATE.md still active: FAL.AI source URL format (base64 vs. signed URL) not confirmed from docs — verify `download_image_with_type()` flow before writing Step 2 agent image submission code

---
*Phase: 02-python-agent-split*
*Completed: 2026-03-25*
