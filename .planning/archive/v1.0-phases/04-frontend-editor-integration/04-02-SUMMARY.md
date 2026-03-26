---
phase: "04"
plan: "02"
subsystem: frontend-editor
tags: [react, editor, mode-orchestration, polling, save, grapes]
dependency_graph:
  requires: [04-01]
  provides: [EditorPage-mode-orchestration, structured-edit-flow, image-generation-flow]
  affects: []
tech_stack:
  added: []
  patterns: [mode-state-machine, polling-with-setInterval, save-on-user-action, camelCase-API-compat]
key_files:
  created: []
  modified:
    - apps/web/src/app/sourcing/[id]/editor/page.tsx
decisions:
  - ProductDetail interface updated with camelCase fields (rawData, processedData, draftContent, pipelineStep) + snake_case fallbacks for backward compat
  - Mode determination: draftContent !== null AND processedData === null → 'structured'; otherwise 'grapes'
  - Polling checks camelCase pipelineStep (direct Prisma response, not sourcing-api.ts remapping)
  - GrapesJS toolbar gets '구조 편집' re-entry button to allow switching back from grapes to structured mode
  - preview.template === null guard prevents entering structured mode without draftContent
metrics:
  duration: 2 minutes
  completed_date: "2026-03-26T00:00:00Z"
  tasks_completed: 1
  tasks_total: 2
  files_created: 0
  files_modified: 1
---

# Phase 04 Plan 02: EditorPage Mode Orchestration Summary

**One-liner:** EditorPage refactored with structured/GrapesJS mode state machine — two-column edit layout, save-on-action to PUT draft-content, image generation trigger with 3s polling, and seamless mode transitions.

**Status: CHECKPOINT — awaiting human verification of Task 2**

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Refactor EditorPage with mode orchestration, save, poll, and component wiring | f3ee20c | apps/web/src/app/sourcing/[id]/editor/page.tsx |

## What Was Built

### Mode Orchestration (Task 1)

**State machine:**
- `mode: 'structured' | 'grapes'` — initial mode derived from product data at fetch time
- Enters `'structured'` when: `draftContent !== null && processedData === null`
- Stays in `'grapes'` otherwise (no draftContent, or processedData already exists)
- Transitions to `'grapes'` when polling detects completion (`pipelineStep === null && processedData !== null`)

**Structured mode layout:**
- 420px left panel: header with "구조 편집" title + "닫기" button, scrollable StructuredEditPanel, bottom dock with ImageGenerationCTA
- flex-1 right panel: StructuredPreviewPane with live iframe re-rendering on every field change (no backend calls)

**Save flow (per D-09):**
- `handleDraftChange` — updates `draftData` state immediately for live preview
- `handleSaveDraft` — calls `saveDraftContent(draftData)` on blur/color-close/hero-select
- `saveDraftContent` — PUT `/api/products/:id/draft-content` with full `DetailPageData` body (fire-and-forget, silent catch)

**Image generation flow:**
- `handleTriggerImageGeneration` — saves current draft, `setIsGenerating(true)`, POST trigger-image-generation
- Polling `useEffect` — 3s interval, reads `pipelineStep` + `processedData` (camelCase from direct Prisma response)
- On completion: re-fetches preview, parses final data, transitions to `'grapes'` mode

**GrapesJS mode (preserved):**
- All existing `DetailPageEditor` behavior unchanged
- New "구조 편집" toolbar button above the canvas allows re-entering structured mode if `draftData` exists
- `editorHtml` computed from `previewData ?? draftData`

**Null guards (Pitfall 3):**
- If `preview.template === null` → skips structured mode setup, falls to GrapesJS
- Structured mode render only fires when `mode === 'structured' && draftData !== null`

**API compatibility:**
- `ProductDetail` interface updated: primary camelCase (`rawData`, `processedData`, `draftContent`, `pipelineStep`) + optional snake_case fallbacks (`raw_data`, `processed_data`)
- Uses `detail.rawData ?? detail.raw_data` pattern throughout

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all data flows are wired. StructuredEditPanel receives real `draftData`, StructuredPreviewPane re-renders from live state, saves go to the real API endpoint.

## Self-Check: PASSED

Files modified:
- apps/web/src/app/sourcing/[id]/editor/page.tsx — FOUND

Commits:
- f3ee20c — feat(04-02): refactor EditorPage with mode orchestration, save, poll, and component wiring

## Checkpoint Note

Task 2 is a `checkpoint:human-verify` gate. This SUMMARY will be finalized after the user confirms the full editor flow works in the browser.
