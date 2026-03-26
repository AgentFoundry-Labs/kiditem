# Project Research Summary

**Project:** KidItem v2.1 — WYSIWYG Editor + Per-Element AI Actions
**Domain:** GrapesJS-based e-commerce product detail page builder with inline AI editing
**Researched:** 2026-03-26
**Confidence:** HIGH (all major findings verified from direct codebase inspection)

## Executive Summary

This milestone extends the existing KidItem GrapesJS editor to support per-element AI actions (text rewrite/translate/shorten and image editing), a draft-mode entry path, and an "AI로 나머지 채우기" CTA. The pattern is well-understood: the codebase already has a working `AIImageEditPanel` for per-element image AI, an `AIDesignChatPanel` for full-page HTML rewriting, and a `component:selected` event handler that can be extended for text elements. The primary challenge is wiring up 3–4 missing NestJS backend endpoints that the frontend components already call but that have no controllers yet.

The recommended approach uses zero new npm packages for core functionality. GrapesJS 0.22's Canvas Spots API handles context bar positioning natively without cross-iframe coordinate math hacks. Text AI actions route through a new lightweight NestJS `text` module calling Gemini inline (synchronous, <3s). Image AI actions route through a new Python `ImageEditAgent` via the existing `agent_tasks` queue (asynchronous, 10–40s). The two-track architecture — sync text / async image — cleanly separates latency profiles and reuses all existing infrastructure without new npm packages or schema changes.

The key risks are GrapesJS-specific: stale component references in async callbacks, CSS rule accumulation from `avoidInlineStyle: true` on repeated template loads, floating panel coordinate mismatch inside the canvas iframe, and race conditions between per-element edits and the full-page AI fill CTA. All 7 critical pitfalls have known preventions documented in PITFALLS.md and must be addressed at phase entry, not patched later. The most urgent are CSS accumulation (Phase 1) and the concurrent action `isBusy` guard (Phase 2, before any AI action is wired).

## Key Findings

### Recommended Stack

The existing stack requires no new npm packages for core scope. GrapesJS 0.22.14, `@grapesjs/react` 2.0.0, `lucide-react`, Tailwind, and `zustand` cover all frontend needs. The backend pattern — raw `fetch` to Gemini REST API, reusing `GEMINI_API_KEY` and `AI_TEXT_MODEL` env vars — is already established in `ai-analyze.ts` and must be replicated, not replaced with an SDK.

**Core technologies and roles:**
- **GrapesJS Canvas Spots API** (`Canvas.addSpot`, `canvas:spot`, `spot.getStyle()`) — per-element action bar positioning without cross-iframe math; built into 0.22, already installed
- **NestJS `text` module** (`apps/server/src/text/`) — inline Gemini call for rewrite/translate/shorten; synchronous, no agent queue overhead
- **NestJS `images` module** (`apps/server/src/images/`) — creates `image_edit` agent_task, returns `{ taskId }` for frontend polling
- **Python `ImageEditAgent`** (`agents/src/agents/image_edit/`) — wraps existing `AIImageGenerator`; handles FAL.AI background removal, replace, enhance, regenerate
- **NestJS `templates` module** (`apps/server/src/templates/`) — `POST /api/templates/modify` (unblocks AIDesignChatPanel) + `POST /api/render-image` (Export PNG)
- **`html-to-image` 3.x** (optional, frontend only) — PNG export without Puppeteer/Chromium in Docker; add only if Export PNG is in scope

**Missing endpoints that must be created (frontend already calls them):**

| Endpoint | Module | Pattern |
|----------|--------|---------|
| `POST /api/images/edit` | `images` | Async — creates agent_task, returns `{ taskId }` |
| `POST /api/templates/modify` | `templates` | Sync — inline Gemini call, returns `{ html }` |
| `POST /api/render-image` | `templates` | TBD — client-side or RenderAgent |
| `POST /api/text/rewrite` | `text` | Sync — inline Gemini call, returns `{ text }` |

**What to avoid:**
- `grapesjs-float` plugin (2 stars, no releases) — use Canvas Spots API instead
- GrapesJS `toolbar` property via `DomComponents.addType` — timing bugs on template elements (GH #3233)
- `@google/generative-ai` SDK — project already uses raw fetch for Gemini; inconsistent
- `puppeteer`/`playwright` for render-image initially — adds ~170 MB Chromium to Docker

### Expected Features

The full feature scope is bounded by PROJECT.md's v2.1 active list. Most table-stakes features require low-complexity routing or wiring changes, not new feature design from scratch.

**Must have — P1 (table stakes):**
- Draft entry into GrapesJS editor with placeholder bold-vertical HTML (routing condition change; logic already partially in `editor/page.tsx`)
- "AI로 나머지 채우기" CTA accessible from GrapesJS mode, not only structured mode (extend existing CTA render condition)
- Per-element text AI actions: 다시쓰기 / 번역 / 축약 (new `AITextEditPanel` + new NestJS text endpoint)
- OneShot pipeline code removal from frontend and NestJS (Python agent already cleaned up)

**Already done (no new work):**
- Per-element image AI actions (`AIImageEditPanel` fires on `img` component:selected)

**Should have — P2 (differentiators, add after validation):**
- Context-aware presets by element type (different preset set for h1 vs p vs span)
- Preview-before-accept for text rewrites (before/after in action panel)
- "AI fill" granularity (fill only empty vs fill all existing fields)

**Defer to v2.x+:**
- AI layout/section reorder suggestions
- Multi-template support with AI layout chooser
- Collaborative editing with AI change attribution (requires WebSocket/SSE infrastructure)

**Anti-features to explicitly reject:**
- "Improve all text" bulk rewrite — homogeneous output, no review, latency stacks
- Streaming text output (typewriter effect) — breaks `component.set('content', ...)` mid-stream
- Real-time AI suggestions as user types — wrong tool for listing preparation
- Multi-element selection AI — GrapesJS multi-select is fragile; one element at a time

### Architecture Approach

The v2.1 architecture is additive: 3 new NestJS modules, 1 new Python agent, 1 new React component, plus targeted modifications to 6 existing files. No schema changes are needed. The two-track AI action architecture (synchronous Gemini for text < 3s vs. asynchronous FAL.AI via agent_tasks for images 10–40s) maps cleanly to the existing infrastructure and avoids blocking NestJS HTTP threads on long-running image operations.

**Major components:**

1. **`AITextEditPanel.tsx`** (new) — floating panel mirroring `AIImageEditPanel` structure; fires on text `component:selected`; calls `POST /api/text/rewrite`; applies result via `component.set('content', ...)` inside `UndoManager.stop()/start()` batch
2. **NestJS `text` module** (new) — single controller, inline Gemini call; owns `POST /api/text/rewrite`
3. **NestJS `images` module** (new) — creates `image_edit` agent_task; `AIImageEditPanel` updated from sync to async polling
4. **Python `ImageEditAgent`** (new) — agent_type `"image_edit"`; wraps existing `AIImageGenerator`; registered in `runner.py`
5. **NestJS `templates` module** (new) — owns `POST /api/templates/modify` (inline AI) and `POST /api/render-image` (render path TBD)
6. **"AI로 나머지 채우기" CTA** (wiring only) — calls existing `POST /api/agent-tasks` with `agentType: "content", generation_mode: "draft"`; polls `pipelineStep === 'content_ready'` on existing 3s interval

**Files modified (not new):**
- `agents/src/runner.py` — register `ImageEditAgent`
- `apps/server/src/agent-tasks/agent-tasks.controller.ts` — add `"image_edit"` to VALID_AGENTS
- `apps/server/src/app.module.ts` — import 3 new modules
- `apps/web/src/components/editor/AIImageEditPanel.tsx` — async: handle `{ taskId }`, add polling loop
- `apps/web/src/components/editor/DetailPageEditor.tsx` — add text element detection + AITextEditPanel mount
- `apps/web/src/app/sourcing/[id]/editor/page.tsx` — add "AI로 나머지 채우기" CTA logic

**Not modified (confirmed):** `prisma/schema.prisma`, existing content agent, `AIImageGenerator`, full pipeline.

### Critical Pitfalls

7 critical pitfalls identified; all have known preventions. Top 5 by phase impact:

1. **Stale GrapesJS internal state after `setComponents`** — After programmatic HTML replacement, call `editor.UndoManager.clear()` then `editor.select(null)` to reset tree and toolbar state. For per-element updates, use `component.set('content', ...)` directly — never `setComponents()`. Address in Phase 1 before any AI apply logic.

2. **Stale component reference in async callback (React stale closure)** — Store target component in `useRef`, not `useState`. Abort in-flight requests with `AbortController` when `component:deselected` fires. Address in Phase 2 as part of initial `AITextEditPanel` design.

3. **CSS rule accumulation from `avoidInlineStyle: true`** — Call `editor.CssComposer.clear()` before each `setComponents()`. Validate in Phase 1: log `editor.getCss().length` before/after 5 successive loads — must not grow. Already confirmed `true` in `DetailPageEditor.tsx` line 255.

4. **Floating panel coordinate mismatch (iframe vs. outer document)** — Use Canvas Spots API (`spot.getStyle()`) which handles iframe offset and zoom natively. Test at 80%/100%/120% zoom. Address in Phase 2.

5. **Concurrent action race condition** — Introduce a single `isBusy` ref in editor context. Per-element panels and the full-page CTA must both check and set this flag. Define in Phase 2 before wiring any AI action.

Additional: undo history granularity pollution (wrap AI result in `UndoManager.stop()/start()`), toolbar buttons missing on template elements (use `component:selected` append, not `DomComponents.addType`).

## Implications for Roadmap

Based on the dependency graph from ARCHITECTURE.md and the pitfall-to-phase mapping from PITFALLS.md, a 4-phase structure is recommended.

### Phase 1: GrapesJS Editor Foundation Fix

**Rationale:** Draft-mode entry and CSS accumulation are foundational correctness issues. Every subsequent AI feature depends on a stable editor baseline. CSS accumulation (Pitfall 3) and stale state after HTML replacement (Pitfall 1) must be validated before any AI apply logic is added — fixing them retroactively is costly.

**Delivers:** Draft products enter the editor and see placeholder HTML. Repeated template loads do not accumulate CSS rules. Undo/redo state is clean after programmatic HTML changes.

**Addresses:**
- Draft entry into GrapesJS with placeholder bold-vertical HTML (routing condition in `editor/page.tsx`)
- Placeholder HTML visible on first open (existing `placeholderDetailPageData` + `renderTemplateToHtml()` already available)
- `editor.CssComposer.clear()` before `setComponents()` (CSS accumulation fix)
- `UndoManager.clear()` + `editor.select(null)` after HTML replacement pattern established

**Avoids:** Pitfall 1 (stale state after HTML replacement), Pitfall 3 (CSS accumulation). Both must be in place before AI modifies canvas content.

**Research flag:** Standard patterns. No additional research needed.

---

### Phase 2: Per-Element Text AI Actions

**Rationale:** Text AI is synchronous (<3s), requires no new Python agent, and unblocks the highest-value differentiator. The `isBusy` concurrency guard must be introduced here — before image AI in Phase 3 — since it coordinates all AI surfaces. Canvas Spots positioning and stale-ref patterns are also established here as the template for Phase 3.

**Delivers:** Selecting any text element in GrapesJS shows a floating panel with 다시쓰기 / 번역 / 축약 presets. Result applies via a single undo step. Concurrent actions are blocked while one is in progress.

**Uses:**
- GrapesJS Canvas Spots API for panel positioning (no cross-iframe math)
- New NestJS `text` module (`POST /api/text/rewrite`) — inline Gemini call
- `useRef` for target component reference (Pitfall 2 prevention)
- `UndoManager.stop()/start()` wrapper for result application (Pitfall 6 prevention)
- `isBusy` editor-level ref introduced here and shared with full-page CTA

**Implements:** `AITextEditPanel.tsx` + `apps/server/src/text/` module + `DetailPageEditor.tsx` text element detection

**Avoids:** Pitfall 2 (stale component ref), Pitfall 4 (coordinate mismatch), Pitfall 5 (toolbar buttons on template elements), Pitfall 6 (undo granularity), Pitfall 7 (concurrent actions — define `isBusy` here).

**Research flag:** Standard patterns. Canvas Spots API verified from working JSFiddle demo. No additional research needed.

---

### Phase 3: Per-Element Image AI Actions (Backend Wiring)

**Rationale:** Image AI requires the Python `ImageEditAgent` and async polling — more infrastructure than text AI. The async frontend pattern (handle `{ taskId }`, poll `GET /api/agent-tasks/:taskId`) is a new flow for `AIImageEditPanel` even though the component already exists. Building after Phase 2 means `isBusy` guard and `AbortController` patterns are already established.

**Delivers:** `AIImageEditPanel` works end-to-end: background removal, replace background, enhance, full regenerate via FAL.AI. `POST /api/images/edit` creates an `image_edit` agent_task. Frontend polls until complete.

**Uses:**
- New Python `ImageEditAgent` (wraps existing `AIImageGenerator`)
- New NestJS `images` module (`POST /api/images/edit` → async agent_task)
- `AbortController` in `AIImageEditPanel` (FAL.AI calls need 90s client-side timeout)
- Existing `agent_tasks` polling infrastructure (3s interval already in editor)

**Implements:** `agents/src/agents/image_edit/agent.py` + `apps/server/src/images/` module + `AIImageEditPanel.tsx` async update

**Avoids:** Anti-pattern of inline FAL.AI from NestJS (fal_client is Python-only), synchronous await on 10–40s image edits, storing per-edit results in products table.

**Research flag:** Shallow verification needed — confirm exact FAL.AI model names in `agents/src/agents/content/image_generator.py` and verify `FAL_KEY` is accessible in NestJS env before Phase 3 planning. Single file read, not a full research phase.

---

### Phase 4: AI Design Chat + Export PNG + Full-Page AI Fill CTA

**Rationale:** These three features share a theme of full-page or bulk operations. The templates module (`POST /api/templates/modify`, `POST /api/render-image`) unblocks `AIDesignChatPanel` and Export PNG. The "AI로 나머지 채우기" CTA is wiring-only but needs the `isBusy` guard from Phase 2. Render-image has the most implementation uncertainty (client-side vs. RenderAgent) and is appropriately deferred to last.

**Delivers:** `AIDesignChatPanel` functional (was calling a missing endpoint). Export PNG works. Draft products have a one-click AI fill path from inside the editor.

**Uses:**
- New NestJS `templates` module (`POST /api/templates/modify` sync, `POST /api/render-image` via choice below)
- `html-to-image` 3.x if client-side PNG export is chosen (saves Puppeteer/Chromium Docker complexity)
- Existing `POST /api/agent-tasks` for "AI fill" CTA (no new endpoint needed)

**Implements:** `apps/server/src/templates/` module + "AI로 나머지 채우기" CTA in `editor/page.tsx`

**Research flag:** `POST /api/render-image` implementation approach needs a decision before Phase 4 planning. Two paths: (a) client-side `html-to-image` — simpler, no Docker change, may miss cross-origin assets; (b) Python `RenderAgent` with file-polling — more robust, new agent infrastructure. Recommend `/gsd:research-phase` if Export PNG is P1 for this milestone.

---

### Phase Ordering Rationale

- Phase 1 before everything because CSS accumulation and stale-after-setComponents are silent bugs that corrupt all downstream AI work if not fixed first.
- Phase 2 before Phase 3 because text AI introduces the `isBusy` guard, the `useRef` async pattern, and Canvas Spots positioning — all of which Phase 3 image AI inherits. Reversing the order means retrofitting Phase 3.
- Phase 4 last because `templates/modify` and `render-image` are called by existing frontend components, and the "AI fill" CTA requires the `isBusy` guard from Phase 2.
- OneShot code removal is a cleanup task that can run independently at any phase as a low-risk pass.

### Research Flags

Phases needing deeper research during planning:
- **Phase 4 (render-image path):** Decision between client-side `html-to-image` vs. Python `RenderAgent`. Cross-origin image handling and Docker image size tradeoffs should be evaluated. Run `/gsd:research-phase` if Export PNG is P1.
- **Phase 3 (FAL.AI model names):** Verify exact model IDs and `FAL_KEY` NestJS env availability before Phase 3 planning. Single file read.

Phases with standard patterns (skip research-phase):
- **Phase 1:** GrapesJS `CssComposer.clear()` and `setComponents` patterns are verified from official GitHub issues. No unknowns.
- **Phase 2:** Canvas Spots API is documented and demo-verified. Gemini raw fetch is an existing codebase pattern.
- **Phase 3:** `ImageEditAgent` wraps existing `AIImageGenerator`. Async polling is an existing frontend pattern.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All technologies verified by direct file reads from codebase. Canvas Spots API confirmed in official docs and working demo. |
| Features | HIGH | Features verified against `DetailPageEditor.tsx`, `editor/page.tsx`, and agent source. Missing endpoints confirmed by `app.module.ts` inspection. |
| Architecture | HIGH | All integration points verified by direct codebase inspection. Build order derived from explicit dependency graph. File-level new/modified inventory is complete. |
| Pitfalls | HIGH | 6 of 7 pitfalls verified against specific GrapesJS GitHub issues with issue numbers. CSS accumulation confirmed from `avoidInlineStyle: true` in source + GH discussion #4747. |

**Overall confidence:** HIGH

### Gaps to Address

- **`POST /api/render-image` implementation approach:** Three options exist (client-side `html-to-image`, Python `RenderAgent` with file polling, NestJS subprocess). Resolve before Phase 4 planning — a one-paragraph decision doc in the planning folder is sufficient.
- **`FAL_KEY` in NestJS env:** Python agent uses FAL.AI. Whether `FAL_KEY` is exposed in `apps/server/.env` is not confirmed. Single env file check before Phase 3 prevents a surprise blocker.
- **Step 1 trigger endpoint verification:** `POST /api/products/:id/trigger-content-draft` may or may not exist in `products.controller.ts`. Confirm before Phase 4 planning. If missing, must be added alongside the "AI로 나머지 채우기" CTA.
- **`AIImageEditPanel` async contract change:** Existing component expects a synchronous image URL response from `POST /api/images/edit`. Changing to async `{ taskId }` + polling is a breaking interface change. Phase 3 must explicitly address the migration with no regression on the existing panel UI.

## Sources

### Primary (HIGH confidence)

- `apps/web/src/components/editor/DetailPageEditor.tsx` — GrapesJS integration, `component:selected` events, `avoidInlineStyle: true` (line 255), zoom implementation, UndoManager config
- `apps/web/src/components/editor/AIImageEditPanel.tsx` — existing `/api/images/edit` API contract, floating panel pattern
- `apps/web/src/components/editor/AIDesignChatPanel.tsx` — `/api/templates/modify` contract, full HTML payload pattern, no AbortController (confirmed)
- `apps/web/src/app/sourcing/[id]/editor/page.tsx` — draft routing, polling, mode switching, placeholder data usage
- `apps/server/src/app.module.ts` — confirmed absent modules (images, text, templates)
- `apps/server/src/workflows/executors/ai-analyze.ts` — Gemini raw fetch pattern, `GEMINI_API_KEY`, `AI_TEXT_MODEL` env vars
- `agents/src/agents/content/image_generator.py` — `AIImageGenerator` regeneration mode presets
- `prisma/schema.prisma` — `Product` model fields, no schema changes needed confirmed

### Secondary (MEDIUM confidence)

- GrapesJS Canvas API docs — `addSpot`, `getSpotsEl`, `canvas:spot`, `spot.getStyle()` in 0.22.x
- GrapesJS GitHub issue #3233 — toolbar buttons missing on template components; `component:selected` append pattern confirmed
- GrapesJS GitHub discussion #4747 — `avoidInlineStyle` CSS accumulation behavior confirmed
- GrapesJS GitHub issue #3044 — custom toolbar button appears only on new components (not template elements)
- GrapesJS issue #3639 — `UndoManager.stop()/start()` batching pattern
- JSFiddle Canvas Spots demo — `spot.getStyle()` pattern working in Vue (translates directly to React)
- Figma AI text docs — select → rewrite → replace in place; rely on undo — UX pattern validation
- Snyk CVE-2022-21802 — GrapesJS XSS via component attributes

### Tertiary (LOW confidence / needs validation)

- FAL.AI model names for background removal (`fal-ai/birefnet` vs. `fal-ai/remove-background`) — verify from Python agent source before Phase 3
- `html-to-image` 3.x cross-origin behavior with 1688 CDN URLs — test before committing to client-side PNG export

---
*Research completed: 2026-03-26*
*Ready for roadmap: yes*
