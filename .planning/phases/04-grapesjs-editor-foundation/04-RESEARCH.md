# Phase 4: GrapesJS Editor Foundation - Research

**Researched:** 2026-03-26
**Domain:** GrapesJS canvas HTML loading, CSS idempotency, React template rendering, code cleanup
**Confidence:** HIGH

## Summary

Phase 4 is primarily a code-correctness and cleanup phase, not a greenfield feature. Three requirements are in scope: confirming the draft entry path works (EDIT-01), ensuring bold-vertical placeholder HTML loads into GrapesJS without CSS accumulation (EDIT-02), and committing the already-deleted OneShot files as a clean removal (CLEAN-01).

Crucially, the codebase analysis reveals that most of the implementation is already present in the working tree (unstaged changes). The draft entry branch at `editor/page.tsx` lines 101-108 already routes `preview.template === null` directly to `mode = 'grapes'` with `placeholderDetailPageData`. The OneShot files (`packages/templates/src/oneshot/config.ts` and `oneshot/index.tsx`) are already deleted on disk with no remaining references in `apps/web/src/` or `packages/templates/src/`. The primary engineering work is fixing CSS accumulation in `injectHeadResources()`, which currently re-appends stylesheet `<link>` tags and inline `<style>` blocks on every call without checking whether they were already injected.

**Primary recommendation:** Fix `injectHeadResources()` with a `data-gjs-injected` attribute guard, commit the pre-deleted OneShot files, and verify the draft entry path matches the success criteria. All three requirements can be completed in a single focused wave.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** 현재 흐름 유지 — 소싱 상세페이지 → 에디터 버튼 → GrapesJS. Draft일 때 structured 모드를 스킵하고 바로 grapes 모드 진입. 이미 editor/page.tsx:101-108에 구현되어 있으므로 해당 로직 확인/보완.
- **D-02:** 제네릭 플레이스홀더 유지 — `placeholderDetailPageData` 상수 그대로 사용. `[메인 제목]`, `[상품 설명]` 등 제네릭 라벨. rawData 반영하지 않음. AI Fill CTA(Phase 7)에서 일괄 채우는 흐름.
- **D-04:** 프론트엔드 + 템플릿 패키지만 — CLEAN-01 요구사항 범위대로 `apps/web` + `packages/templates`. 이미 git status에서 삭제된 파일(`oneshot/config.ts`, `oneshot/index.tsx`) 커밋 + `grep -r "oneshot"` 검증. agents/server는 이 phase 범위 밖.

### Claude's Discretion

- CSS 누적 방지 기술적 접근 (idempotent injection, head clear, data-attribute 체크 등)
- GrapesJS 에디터 설정 최적화 (기존 설정 기반)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| EDIT-01 | 수집 직후(draft) 상품에서 GrapesJS 에디터로 바로 진입할 수 있다 | Draft entry branch already implemented at editor/page.tsx:101-108; needs verification and any edge-case hardening |
| EDIT-02 | 에디터 진입 시 bold-vertical 플레이스홀더 HTML이 GrapesJS 캔버스에 로드된다 | `placeholderDetailPageData` + `renderTemplateToHtml()` + `parseFullHtml()` path is complete; CSS accumulation fix in `injectHeadResources()` is the blocker for the 5-reload idempotency check |
| CLEAN-01 | OneShot 파이프라인 코드가 프론트엔드 + 템플릿 패키지에서 완전히 제거된다 | Files deleted on disk, no references remain in `apps/web/src/` or `packages/templates/src/`; work is to commit the deletions and verify with grep |
</phase_requirements>

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `grapesjs` | ^0.22.14 | HTML/CSS visual editor engine | Already installed; all editor infrastructure built on it |
| `@grapesjs/react` | ^2.0.0 | React wrapper for GrapesJS | Already installed; `GjsEditor`, `WithEditor`, `useEditor` hooks in use |
| `react-dom/server` | ^18 | `renderToStaticMarkup()` for template → HTML | Already used in `template-html.tsx` |
| `@kiditem/templates` | workspace | `placeholderDetailPageData`, `getTemplate`, `parseDetailPageData` | Workspace package; template registry and data structures |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `DOMParser` (browser built-in) | — | `parseFullHtml()` — parse full HTML doc into body/head parts | Called once per editor load inside `DetailPageEditor` |
| `lucide-react` | ^0.577.0 | Icons (Loader2, AlertCircle) | Already used in loading/error states |

### No New Libraries Needed

Phase 4 requires zero npm additions. All required capabilities exist in the current stack.

---

## Architecture Patterns

### Data Flow: Draft Product → GrapesJS Canvas

```
/sourcing/[id]/editor
  ↓ fetchData()
  ├── GET /api/products/{id}          → detail (pipelineStep, rawData, etc.)
  ├── GET /api/products/{id}/preview  → { template: null, data: {} }  ← draft signal
  └── GET /templates-styles.css       → templateCss string

preview.template === null
  ↓
  setMode('grapes')
  setPreviewData(placeholderDetailPageData)   ← D-02: generic placeholder
  setTemplateConfig(getTemplate('bold-vertical'))
  ↓
renderTemplateToHtml(config.component, placeholderDetailPageData, config, templateCss)
  → full HTML string (<!DOCTYPE html>…</html>)
  ↓
DetailPageEditor receives html prop
  ↓
parseFullHtml(html)          → { bodyHtml, stylesheetUrls, inlineStyles, ... }
editor.setComponents(bodyHtml)
canvas:frame:load:body event → injectHeadResources(iframeWindow, parsed)
```

### Pattern 1: Draft Mode Detection (Already Implemented)

**What:** `editor/page.tsx` lines 101-108 check `preview.template === null` and branch directly to grapes mode with placeholder data.

**Current code (verified from source):**
```typescript
// Source: apps/web/src/app/sourcing/[id]/editor/page.tsx lines 101-108
if (preview.template === null || !preview.data) {
  const config = getTemplate('bold-vertical');
  setTemplateConfig(config);
  setPreviewData(placeholderDetailPageData);
  setMode('grapes');
  setIsLoading(false);
  return;
}
```

**Status:** This correctly satisfies EDIT-01 and EDIT-02. The planner should verify this branch is reachable from a real draft product and that `preview.template === null` is the reliable signal from `GET /api/products/:id/preview`.

### Pattern 2: CSS Accumulation — The Bug (EDIT-02 Blocker)

**What:** `injectHeadResources()` is called on `canvas:frame:load:body`. If the editor re-loads HTML (e.g., via `setComponents()`), the `canvas:frame:load:body` event fires again. Each call appends new `<link>` and `<style>` tags to the iframe `<head>` without checking if they are already present.

**Current implementation (verified from source):**
```typescript
// Source: apps/web/src/components/editor/DetailPageEditor.tsx lines 294-333
function injectHeadResources(iframeWindow: Window, parsed: ParsedHtml) {
  const doc = iframeWindow.document;
  const head = doc.head;

  for (const url of parsed.stylesheetUrls) {
    const link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = url;
    head.appendChild(link);  // NO GUARD — appends on every call
  }

  for (const styleHtml of parsed.inlineStyles) {
    head.insertAdjacentHTML('beforeend', styleHtml);  // NO GUARD
  }
  // ...
}
```

**Fix approach (D-03: Claude's discretion):** Add an idempotency guard using a `data-attribute` marker. Two viable approaches:

**Approach A — data-attribute on each injected element (recommended):**
```typescript
// Before appending a <link>, check if already injected:
function injectHeadResources(iframeWindow: Window, parsed: ParsedHtml) {
  const doc = iframeWindow.document;
  const head = doc.head;

  for (const url of parsed.stylesheetUrls) {
    // Skip if a link with this exact href already exists
    if (head.querySelector(`link[rel="stylesheet"][href="${CSS.escape ? CSS.escape(url) : url}"]`)) continue;
    const link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = url;
    head.appendChild(link);
  }

  for (const styleHtml of parsed.inlineStyles) {
    // Use a data-attribute fingerprint to skip duplicates
    const tempDiv = doc.createElement('div');
    tempDiv.innerHTML = styleHtml;
    const styleEl = tempDiv.firstChild as HTMLStyleElement | null;
    if (!styleEl) continue;
    const fingerprint = styleHtml.slice(0, 80); // first 80 chars as key
    if (head.querySelector(`style[data-gjs-injected="${fingerprint}"]`)) continue;
    styleEl.setAttribute('data-gjs-injected', fingerprint);
    head.appendChild(styleEl);
  }
  // inline scripts: same pattern
}
```

**Approach B — clear-then-reinject:** Before injecting, remove all elements with `data-gjs-injected` attribute, then re-inject fresh. Simpler but causes FOUC (flash of unstyled content) on reload.

**Recommendation:** Approach A (skip-if-exists) is safer because it avoids FOUC and preserves externally appended styles. Use `link[href]` exact match for stylesheets and `data-gjs-injected` attribute with a short fingerprint for inline styles.

**CSS.escape note:** `CSS.escape()` is available in all modern browsers and avoids XSS in the selector string. The iframe runs in the same origin so this is not a security concern, but still good practice.

### Pattern 3: OneShot Removal — Already Done on Disk

**Current state (verified):**
- `packages/templates/src/oneshot/config.ts` — deleted from disk, git status shows `D`
- `packages/templates/src/oneshot/index.tsx` — deleted from disk, git status shows `D`
- `packages/templates/src/index.ts` — no oneshot exports (verified by reading file)
- `packages/templates/src/registry.ts` — no oneshot in registry (verified by reading file)
- `apps/web/src/` — zero grep matches for "oneshot" (verified)
- `packages/templates/src/` — zero grep matches for "oneshot" (verified)

**Work remaining:** Commit the already-staged deletions. The CLAUDE.md still mentions `oneshot` in the Structure section (`packages/templates/ — React 상세페이지 템플릿 (bold-vertical, simple-vertical, oneshot)`) — this should be updated as part of the cleanup task.

### Anti-Patterns to Avoid

- **Re-appending without guard:** The current `injectHeadResources()` is the exact anti-pattern. Each re-call accumulates `<style>` blocks, causing `editor.getCss().length` to grow because GrapesJS serializes all CSS found in the iframe head.
- **Clearing the entire head:** Removing all `<head>` children before re-injecting breaks GrapesJS's own frame setup scripts that it injects during initialization.
- **Using `innerHTML` to clear styles:** `head.innerHTML = ''` wipes GrapesJS-owned meta tags and initialization scripts. Only clear the tags you own (those with `data-gjs-injected`).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Template → HTML conversion | Custom React SSR | `renderToStaticMarkup()` already in `template-html.tsx` | Already production-tested in codebase |
| HTML → body/head split | Regex parsing | `DOMParser` in `parseFullHtml()` | Already production-tested; handles nested tags correctly |
| Placeholder data | Hard-code strings inline | `placeholderDetailPageData` from `@kiditem/templates` | Already defined and exported from workspace package |
| Template lookup | Switch/if chain | `getTemplate('bold-vertical')` from registry | Throws on unknown ID — safe and already used |

---

## Common Pitfalls

### Pitfall 1: CSS.escape Unavailability in Older Environments
**What goes wrong:** `CSS.escape()` throws in some test environments (jsdom, older Node) — not a concern in Next.js browser runtime, but worth noting.
**Why it happens:** `CSS.escape` is a browser API not universally available in server-side environments.
**How to avoid:** The fix runs inside the iframe's browser context via the `canvas:frame:load:body` event handler, so it runs in Chrome/Firefox. No special handling needed.
**Warning signs:** TypeScript will not complain because `CSS.escape` is typed in lib.dom.

### Pitfall 2: GrapesJS `canvas:frame:load:body` Event Firing Before head Is Ready
**What goes wrong:** Injecting `<link>` tags into the iframe `<head>` during this event is the correct pattern. However, if code tries to query-select these links immediately after `head.appendChild()`, the styles may not yet be applied (async load).
**Why it happens:** External stylesheets load asynchronously even when appended synchronously to the DOM.
**How to avoid:** The existing guard in `injectHeadResources()` for script ordering (using `script.onload`) is the right model. CSS links do not require an `onload` callback for visual rendering.
**Warning signs:** Fonts/styles not appearing on first load even though the `<link>` element is present in the iframe head.

### Pitfall 3: `preview.template === null` vs `preview.data` Being Empty
**What goes wrong:** A draft product may return `preview.template === null` but also have `preview.data` as an empty object `{}` (not null/undefined). The current branch checks both: `preview.template === null || !preview.data`. This is correct but worth verifying the API contract.
**Why it happens:** The NestJS preview endpoint may return different shapes for different product states.
**How to avoid:** The existing two-part condition `(preview.template === null || !preview.data)` is robust. The planner should not simplify it to just `preview.template === null`.
**Warning signs:** Draft products with stale `processed_data` accidentally routing through the non-draft branch.

### Pitfall 4: Fingerprint Collision in Style Deduplication
**What goes wrong:** Using only the first 80 characters of `styleHtml` as a `data-gjs-injected` fingerprint could collide if two different style blocks share the same prefix.
**Why it happens:** The template CSS (`/templates-styles.css`) is one big file loaded via `<link>`, not an inline `<style>`. The inline styles from `renderTemplateToHtml()` are: (1) the full `templateCss` content wrapped in `<style>`, and (2) the theme variables CSS. These are structurally distinct and will not share an 80-char prefix. Collision risk is LOW.
**How to avoid:** Use the full `styleHtml` as the fingerprint (store as a truncated hash or the full string) if concerned. For this codebase, 80 chars is sufficient given the fixed set of styles being injected.
**Warning signs:** One of the two inline styles not being injected because it matched the fingerprint of the other.

---

## Code Examples

### Idempotent injectHeadResources() — Recommended Fix

```typescript
// Source: analysis of current DetailPageEditor.tsx lines 294-333
// Fix: add existence check before each injection

function injectHeadResources(iframeWindow: Window, parsed: ParsedHtml) {
  const doc = iframeWindow.document;
  const head = doc.head;

  // Stylesheet links: skip if href already present
  for (const url of parsed.stylesheetUrls) {
    if (head.querySelector(`link[rel="stylesheet"][href="${url}"]`)) continue;
    const link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = url;
    head.appendChild(link);
  }

  // Inline styles: skip if data-gjs-injected fingerprint already present
  for (const styleHtml of parsed.inlineStyles) {
    const fingerprint = styleHtml.length.toString() + '_' + styleHtml.slice(0, 60);
    if (head.querySelector(`style[data-gjs-injected="${fingerprint}"]`)) continue;
    const tempDiv = doc.createElement('div');
    tempDiv.innerHTML = styleHtml;
    const el = tempDiv.firstElementChild as HTMLStyleElement | null;
    if (!el) continue;
    el.setAttribute('data-gjs-injected', fingerprint);
    head.appendChild(el);
  }

  // Script handling (unchanged from original — already handles ordering)
  const appendInlineScripts = () => {
    for (const scriptText of parsed.inlineScripts) {
      const script = doc.createElement('script');
      script.textContent = scriptText;
      head.appendChild(script);
    }
  };
  if (parsed.scriptUrls.length === 0) {
    appendInlineScripts();
    return;
  }
  let loaded = 0;
  for (const url of parsed.scriptUrls) {
    const script = doc.createElement('script');
    script.src = url;
    const done = () => {
      loaded++;
      if (loaded >= parsed.scriptUrls.length) appendInlineScripts();
    };
    script.onload = done;
    script.onerror = done;
    head.appendChild(script);
  }
}
```

**Fingerprint design:** `styleHtml.length.toString() + '_' + styleHtml.slice(0, 60)` uses both length (cheap O(1)) and prefix (60 chars). In practice the two inline styles from `renderTemplateToHtml()` are: the `templateCss` string (very long, starts with CSS rules) and the `themeVarsCss` string (starts with `:root {`). These have different lengths and different prefixes — zero collision risk.

### Draft Entry Path Verification Check

```typescript
// Verify via manual test or smoke test that:
// GET /api/products/{draft-product-id}/preview
// returns { template: null, data: {} } or { template: null }
// The current branch handles both:
if (preview.template === null || !preview.data) {
  // This is the correct entry point for EDIT-01/EDIT-02
}
```

### CLEAN-01: Git Commands for Verification

```bash
# Confirm oneshot files are staged for deletion
git status packages/templates/src/oneshot/

# Verify no remaining references in scope
grep -r "oneshot" apps/web packages/ 2>/dev/null
# Expected: no output (zero matches)

# Update CLAUDE.md Structure section to remove oneshot reference
# (apps/web mention in root CLAUDE.md: "bold-vertical, simple-vertical, oneshot")
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| OneShot pipeline (single-step content + image gen) | Two-step pipeline (draft step + image step) | v2.0 milestone (Phase 2) | OneShot already removed from Python agent; frontend/templates cleanup is this phase |
| CSS accumulation on every reload | Idempotent injection with data-attribute guard | Phase 4 (this work) | `editor.getCss().length` stays constant across reloads |

**Deprecated/outdated:**
- `packages/templates/src/oneshot/`: fully deleted on disk, awaiting git commit
- `CLAUDE.md` Structure section: still mentions `oneshot` in templates description — should be updated

---

## Open Questions

1. **Does `GET /api/products/:id/preview` reliably return `template: null` for all draft products?**
   - What we know: The branch at `editor/page.tsx:101` checks `preview.template === null || !preview.data`.
   - What's unclear: Whether there are edge cases where a draft product has non-null `template` (e.g., if a user previously generated content that was then rolled back to draft status).
   - Recommendation: The planner should include a task to read the NestJS preview endpoint implementation and confirm the `template: null` contract for `status = 'draft'` products. This is a one-file read, not a code change.

2. **Should CLAUDE.md root be updated to remove the `oneshot` mention from the templates description?**
   - What we know: Root `CLAUDE.md` line 56 still says "React 상세페이지 템플릿 (bold-vertical, simple-vertical, oneshot)". D-04 scopes cleanup to `apps/web + packages/templates`.
   - What's unclear: Whether updating the root CLAUDE.md falls within CLEAN-01 scope.
   - Recommendation: Include it. It is documentation for the same codebase, and the grep verification (`grep -r "oneshot" apps/web packages/`) does not catch CLAUDE.md at the root — the planner should decide whether to include it or leave it for a separate docs pass.

---

## Environment Availability

Step 2.6: SKIPPED — Phase 4 is purely frontend code changes and git operations. No external services, databases, or CLIs beyond standard `node`, `git`, and `grep` are required. The NestJS API at port 4000 is needed for manual smoke testing but is not a build-time dependency.

---

## Validation Architecture

No test framework exists in `apps/web` (confirmed: no `jest.config.*`, `vitest.config.*`, no test files in `src/`). The `packages/templates` package has no test runner either (scripts: `build`, `dev`, `type-check`, `generate:schema` only).

Given this project has no automated test infrastructure for the frontend, all three requirements map to **manual verification commands** rather than automated test suites.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None — no test framework configured in apps/web or packages/templates |
| Config file | None |
| Quick run command | `grep -r "oneshot" apps/web packages/` (zero-output check for CLEAN-01) |
| Full suite command | `npm run build` in apps/web (TypeScript compilation as proxy for correctness) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EDIT-01 | Draft product navigates to GrapesJS without structured mode | smoke/manual | `curl -s http://localhost:4000/api/products/{draft-id}/preview | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['template'] is None"` | ❌ Wave 0 |
| EDIT-02 | 5 consecutive HTML reloads do not increase `editor.getCss().length` | smoke/manual | Browser console: reload HTML 5x, check `editor.getCss().length` | ❌ Wave 0 (manual only) |
| CLEAN-01 | No oneshot references in apps/web or packages/ | shell | `grep -r "oneshot" apps/web packages/` exits non-zero (no matches) | ✅ (shell command, no file needed) |

### Sampling Rate

- **Per task commit:** `grep -r "oneshot" apps/web packages/ 2>/dev/null | wc -l` → must be 0 after CLEAN-01 task
- **Per wave merge:** `cd apps/web && npm run build` — TypeScript compilation passes
- **Phase gate:** Manual smoke test of draft product editor entry + CSS accumulation check in browser before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] No automated test for EDIT-01 (draft entry path) — manual browser verification only; no framework exists to automate
- [ ] No automated test for EDIT-02 (CSS accumulation) — requires live GrapesJS DOM; manual browser console check only
- `CLEAN-01` is fully automatable with `grep` — no test file needed

*(The project has no existing test infrastructure for the Next.js frontend. This is a known gap. For Phase 4, the grep command for CLEAN-01 and the TypeScript build check are the only automated validation paths.)*

---

## Sources

### Primary (HIGH confidence)

- Direct codebase read — `apps/web/src/app/sourcing/[id]/editor/page.tsx` — draft entry branch at lines 101-108 verified
- Direct codebase read — `apps/web/src/components/editor/DetailPageEditor.tsx` — `injectHeadResources()` implementation at lines 294-333 verified, CSS accumulation bug confirmed
- Direct codebase read — `apps/web/src/lib/template-html.tsx` — `renderTemplateToHtml()` full implementation verified
- Direct codebase read — `packages/templates/src/placeholder.ts` — `placeholderDetailPageData` content verified
- Direct codebase read — `packages/templates/src/registry.ts` — oneshot absent from registry confirmed
- Direct codebase read — `packages/templates/src/index.ts` — no oneshot exports confirmed
- Bash: `grep -r "oneshot" apps/web/src/ packages/templates/src/` — zero matches confirmed
- Bash: `ls packages/templates/src/oneshot/` — directory does not exist confirmed
- Bash: `git status packages/templates/src/` — `D oneshot/config.ts`, `D oneshot/index.tsx` confirmed

### Secondary (MEDIUM confidence)

- GrapesJS event `canvas:frame:load:body` behavior — observed from existing event listener in `handleEditorInit()` at line 1043; consistent with GrapesJS 0.22.x documentation pattern

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified from `package.json` and direct file reads
- Architecture: HIGH — all data flow verified from actual source files
- Pitfalls: HIGH — CSS accumulation bug confirmed by direct source read; fix approach is idiomatic DOM manipulation with no external dependencies
- Validation: HIGH — test framework absence confirmed by file system check

**Research date:** 2026-03-26
**Valid until:** 2026-04-25 (stable — no fast-moving dependencies; all findings are from local codebase)
