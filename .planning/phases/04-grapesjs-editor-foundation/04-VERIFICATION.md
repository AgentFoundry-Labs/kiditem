---
phase: 04-grapesjs-editor-foundation
verified: 2026-03-26T12:00:00Z
status: passed
score: 3/3 must-haves verified
gaps: []
human_verification:
  - test: "Draft product editor: open /sourcing/{id}/editor for a product with status='draft' (preview.template === null)"
    expected: "GrapesJS canvas loads with bold-vertical placeholder HTML — bracketed labels like '[메인 제목]', placehold.co placeholder images visible in iframe"
    why_human: "Requires a running stack (Next.js + NestJS + PostgreSQL) and a draft product in the database. Cannot verify iframe canvas rendering programmatically."
  - test: "CSS non-accumulation: in the open editor, open browser DevTools console and run: const e = window.__grapesjs_editor; const len1 = e.getCss().length; /* trigger reload */ const len2 = e.getCss().length; console.log(len1, len2, len1 === len2)"
    expected: "len1 === len2 after reload — no CSS length growth"
    why_human: "Requires a running browser session with GrapesJS editor loaded. Cannot instrument editor.getCss() without running the app."
---

# Phase 4: GrapesJS Editor Foundation Verification Report

**Phase Goal:** Draft 상품에서 GrapesJS 에디터로 바로 진입하면 플레이스홀더 bold-vertical HTML이 캔버스에 로드되고, 반복 로드 시 CSS가 누적되지 않으며 OneShot 코드는 완전히 제거된다
**Verified:** 2026-03-26
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | Draft product editor page loads GrapesJS canvas with bold-vertical placeholder HTML without entering structured mode | VERIFIED | `editor/page.tsx` lines 101-108: `if (preview.template === null \|\| !preview.data)` branch calls `getTemplate('bold-vertical')`, `setPreviewData(placeholderDetailPageData)`, `setMode('grapes')`, then returns. No fall-through to structured mode. |
| 2 | Reloading HTML into the editor 5 consecutive times does not increase editor.getCss().length | VERIFIED (code-level) | `injectHeadResources()` in `DetailPageEditor.tsx` lines 294-345 now guards both stylesheet links (`head.querySelector('link[rel="stylesheet"][href="..."]')`) and inline styles (`data-gjs-injected` fingerprint check). `insertAdjacentHTML` fully removed (0 matches). Behavioral confirmation requires human (see Human Verification). |
| 3 | Zero grep matches for 'oneshot' in apps/web and packages/ directories | VERIFIED | `grep -rn "oneshot" apps/web/ packages/` produces zero output. Oneshot directory `packages/templates/src/oneshot/` does not exist. `CLAUDE.md` line 56 reads "bold-vertical, simple-vertical" with no "oneshot". |

**Score:** 3/3 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/web/src/components/editor/DetailPageEditor.tsx` | Idempotent `injectHeadResources()` with `data-gjs-injected` CSS deduplication | VERIFIED | Lines 294-345: fingerprint-based dedup for inline styles, href-based dedup for stylesheet links. `data-gjs-injected` appears at lines 307, 310, 315. `CSS.escape()` at line 310. `insertAdjacentHTML` count: 0. |
| `CLAUDE.md` | Updated Structure section without oneshot reference | VERIFIED | Line 56: `packages/templates/ — React 상세페이지 템플릿 (bold-vertical, simple-vertical)` — no oneshot. |
| `packages/templates/src/placeholder.ts` | `placeholderDetailPageData` constant (created) | VERIFIED | File exists, 64 lines, exports `placeholderDetailPageData: DetailPageData` with all required fields including bracketed placeholder labels, placehold.co image URLs, and `generationMode: 'template'`. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `apps/web/src/app/sourcing/[id]/editor/page.tsx` | `placeholderDetailPageData` | Import from `@kiditem/templates` + assignment when `preview.template === null` | WIRED | Line 4: `import { getTemplate, parseDetailPageData, placeholderDetailPageData } from '@kiditem/templates'`. Line 104: `setPreviewData(placeholderDetailPageData)` inside the `preview.template === null` guard. Pattern `setPreviewData\(placeholderDetailPageData\)` confirmed. |
| `apps/web/src/components/editor/DetailPageEditor.tsx` | `injectHeadResources` | `canvas:frame:load:body` event handler | WIRED | Line 1054: `editor.on('canvas:frame:load:body', ({ window: iframeWindow }) => {`. Line 1055: `injectHeadResources(iframeWindow, parsed)`. Event handler calls the idempotent function. Pattern `data-gjs-injected` confirmed in the function body. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|-------------------|--------|
| `editor/page.tsx` — draft branch | `previewData` (set to `placeholderDetailPageData`) | `packages/templates/src/placeholder.ts` static constant | Yes — static placeholder is the intended data for draft entry | FLOWING (intentional static — placeholder is the design contract for draft products) |
| `editor/page.tsx` — GrapesJS render | `editorHtml` | `renderTemplateToHtml(templateConfig.component, activeData, ...)` | Yes — `activeData = previewData ?? draftData`; `templateConfig` set from `getTemplate('bold-vertical')` | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| TypeScript compilation passes | `npx tsc --noEmit --project apps/web/tsconfig.json` | Exit code: 0 (no output) | PASS |
| `insertAdjacentHTML` removed from `DetailPageEditor.tsx` | `grep -c "insertAdjacentHTML" apps/web/src/components/editor/DetailPageEditor.tsx` | 0 | PASS |
| `data-gjs-injected` fingerprint present (3 occurrences) | `grep -c "data-gjs-injected" apps/web/src/components/editor/DetailPageEditor.tsx` | 3 | PASS |
| Oneshot grep in apps/web + packages | `grep -rn "oneshot" apps/web/ packages/` | (no output) | PASS |
| Oneshot directory does not exist | `ls packages/templates/src/oneshot/` | Error: no such directory | PASS |
| Draft branch uses placeholderDetailPageData | `grep "setPreviewData(placeholderDetailPageData)" apps/web/src/app/sourcing/[id]/editor/page.tsx` | Line 104 match | PASS |
| Draft branch calls getTemplate('bold-vertical') | `grep "getTemplate.*bold-vertical" apps/web/src/app/sourcing/[id]/editor/page.tsx` | Line 102 match | PASS |
| Draft branch sets mode to grapes | `grep "setMode.*grapes" apps/web/src/app/sourcing/[id]/editor/page.tsx` | Lines 105, 122, 162 | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| EDIT-01 | 04-01-PLAN.md | 수집 직후(draft) 상품에서 GrapesJS 에디터로 바로 진입할 수 있다 | SATISFIED | `editor/page.tsx` lines 101-108: draft branch (`preview.template === null`) sets mode to `'grapes'` and returns without entering structured mode. `placeholderDetailPageData` assigned as `previewData`. |
| EDIT-02 | 04-01-PLAN.md | 에디터 진입 시 bold-vertical 플레이스홀더 HTML이 GrapesJS 캔버스에 로드된다; also covers CSS idempotency | SATISFIED | (a) Placeholder HTML: `getTemplate('bold-vertical')` + `placeholderDetailPageData` + `renderTemplateToHtml` pipeline confirmed. (b) CSS idempotency: `injectHeadResources()` now uses `data-gjs-injected` fingerprint dedup — no `insertAdjacentHTML` duplication path remains. |
| CLEAN-01 | 04-01-PLAN.md | OneShot 파이프라인 코드가 프론트엔드 + 템플릿 패키지에서 완전히 제거된다 | SATISFIED | `packages/templates/src/oneshot/` directory deleted (commit 8e8e578). `grep -rn "oneshot" apps/web/ packages/` returns zero matches. `CLAUDE.md` line 56 has no "oneshot". |

No orphaned requirements: REQUIREMENTS.md maps EDIT-01, EDIT-02, CLEAN-01 exclusively to Phase 4 (v2.1). All three claimed by `04-01-PLAN.md`. No unclaimed IDs.

Note on ROADMAP discrepancy: The ROADMAP.md progress table at line 199 still shows Phase 4 (v2.1) as "Planning / 0/1 plans complete". This is a documentation artifact — the commits (`8e8e578`, `6992631`) and all artifacts confirm the work is complete. The ROADMAP table was not updated as part of this phase's execution.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `editor/page.tsx` | 56 | `eslint-disable-next-line @typescript-eslint/no-explicit-any` for `templateConfig` state | Info | `templateConfig` typed as `any`. Does not block goal — the value is passed to `renderTemplateToHtml` which handles typing internally. Pre-existing pattern, not introduced in this phase. |

No blockers or warnings found.

### Human Verification Required

#### 1. Draft Canvas Render

**Test:** Start the full stack (`docker compose up -d` + `npm run dev`). Navigate to `/sourcing/{id}/editor` where `{id}` is a product with `status = 'draft'` and no processed/draft content (so that `preview.template === null`).
**Expected:** GrapesJS canvas loads immediately with bold-vertical template showing bracketed placeholder labels ("[메인 제목]", "[서브타이틀]", etc.) and placehold.co gray placeholder images. The structured-edit panel does NOT appear.
**Why human:** Requires running Next.js + NestJS + PostgreSQL with a qualifying draft product. Cannot verify GrapesJS iframe canvas rendering programmatically.

#### 2. CSS Non-Accumulation Under Reload

**Test:** With the editor open (from test 1 above), open browser DevTools console and run the following sequence: (1) record `const len1 = window.__grapesEditor?.getCss().length` before any reload action; (2) trigger an HTML reload (e.g., by navigating away and back, or by calling `editor.setComponents(html)` in console); (3) record `const len2 = ...getCss().length`; (4) verify `len1 === len2`.
**Expected:** CSS length does not increase across reloads. The `data-gjs-injected` fingerprint check prevents duplicate `<style>` elements from accumulating in the iframe `<head>`.
**Why human:** Requires a running browser session with GrapesJS loaded and the ability to instrument `editor.getCss()` across reload cycles. Cannot replicate GrapesJS iframe DOM state in a static grep-based check.

### Gaps Summary

No gaps found. All three must-have truths are verified at the code level:

1. **Draft entry path (EDIT-01 + EDIT-02):** The `preview.template === null` branch in `editor/page.tsx` correctly routes draft products to GrapesJS mode with bold-vertical placeholder data. The code path is wired end-to-end: import, branch condition, `getTemplate`, `placeholderDetailPageData` assignment, `setMode('grapes')`, and early return.

2. **CSS idempotency (EDIT-02):** The `injectHeadResources()` function in `DetailPageEditor.tsx` is fully replaced with a deduplication-guarded version. Both stylesheet links (href-based querySelector guard) and inline styles (`data-gjs-injected` fingerprint guard) are protected. The old `insertAdjacentHTML` call that caused accumulation is gone.

3. **OneShot removal (CLEAN-01):** The `oneshot/` directory is deleted from disk, no references remain in `apps/web/`, `packages/`, or `CLAUDE.md`. Two commits (8e8e578, 6992631) document the work atomically.

Two items require human verification due to runtime dependency: visual canvas rendering and live CSS length measurement. These are validation tests, not gaps — the code that would produce the correct behavior is fully in place.

---
_Verified: 2026-03-26_
_Verifier: Claude (gsd-verifier)_
