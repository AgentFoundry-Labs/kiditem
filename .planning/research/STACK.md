# Stack Research

**Domain:** GrapesJS WYSIWYG editor with per-element AI actions
**Researched:** 2026-03-26
**Confidence:** HIGH (architecture verified from codebase; GrapesJS patterns verified from official docs and community sources)

---

## Context: What Already Exists (Do Not Re-add)

Verified from codebase (`apps/web/package.json`, `DetailPageEditor.tsx`, `AIImageEditPanel.tsx`, `AIDesignChatPanel.tsx`, `apps/server/src/`):

| Already in project | Location / version |
|--------------------|-------------------|
| `grapesjs` ^0.22.14 | `apps/web/package.json` |
| `@grapesjs/react` ^2.0.0 | `apps/web/package.json` |
| `useEditor`, `WithEditor`, `Canvas`, `GjsEditor` | `DetailPageEditor.tsx` — already in active use |
| `component:selected` event wired to side-panel state | `DetailPageEditor.tsx` L1047-1055 |
| `Canvas.getFrameEl()` access pattern | `DetailPageEditor.tsx` L1118, L1067 |
| `AIImageEditPanel` side panel component | `apps/web/src/components/editor/AIImageEditPanel.tsx` |
| `AIDesignChatPanel` full-page AI chat panel | `apps/web/src/components/editor/AIDesignChatPanel.tsx` |
| Gemini via raw `fetch` (no SDK) | `apps/server/src/workflows/executors/ai-analyze.ts` |
| `GEMINI_API_KEY` + `AI_TEXT_MODEL` env vars | `ai-analyze.ts` L4-5 |
| `lucide-react` ^0.577.0 | `apps/web/package.json` |
| `zustand` ^5.0.12 | `apps/web/package.json` |
| `tailwindcss`, `clsx`, `tailwind-merge` | `apps/web/package.json` |

**Missing NestJS endpoints** (referenced in frontend, not yet registered in `app.module.ts`):

| Endpoint | Called By | Status |
|----------|-----------|--------|
| `POST /api/templates/modify` | `AIDesignChatPanel.tsx` | Not implemented |
| `POST /api/images/edit` | `AIImageEditPanel.tsx` | Not implemented |
| `POST /api/render-image` | `EditorToolbar` export PNG | Not implemented |
| `POST /api/editor/ai-text` | New requirement (per-element text AI) | Not implemented, endpoint path TBD |

---

## Recommended Stack — New Additions

### Frontend: No New npm Packages Needed

The per-element AI context bar can be built entirely with existing dependencies using GrapesJS's Canvas Spots API. No new packages.

**Pattern: Canvas Spots API (GrapesJS 0.22 built-in)**

GrapesJS 0.22 exposes `Canvas.addSpot({ type, component })`, `Canvas.getSpotsEl()`, and the `canvas:spot` event. On every scroll/resize, the `canvas:spot` event fires and `spot.getStyle()` returns current absolute-position styles that track the selected component. A React component inside `WithEditor` scope listens to `component:toggled`, determines the selected component type (`text` vs `image`), and renders an action bar positioned via `spot.getStyle()`.

This uses only what is already installed:
- `useEditor` — access editor instance (already used in `DetailPageEditor.tsx`)
- `lucide-react` — action button icons (already installed at ^0.577.0)
- Tailwind + `clsx` — styling (already installed)
- `useState` / `useEffect` / `useCallback` — ephemeral loading/error state

### Backend: No New npm Packages Needed

All new NestJS endpoints use raw `fetch` to Gemini REST API — the same pattern already in `ai-analyze.ts`. No new npm packages required for text AI actions.

For FAL.AI image editing (the `/api/images/edit` endpoint), use raw `fetch` with `Authorization: Key ${FAL_KEY}` header — consistent with the project's no-SDK-for-REST-APIs pattern. Check whether `FAL_KEY` env var is already set from the Python agent (`agents/` directory uses FAL.AI).

---

## Integration Points

### 1. Per-Element AI Context Bar (Frontend)

**New component:** `apps/web/src/components/editor/AIContextBar.tsx`

**Architecture:**

```typescript
// Inside WithEditor scope, registered in handleEditorInit
editor.on('component:toggled', () => {
  const sel = editor.getSelected();
  editor.Canvas.removeSpots({ type: 'ai-context-bar' });
  if (sel) {
    editor.Canvas.addSpot({ type: 'ai-context-bar', component: sel });
  }
});

// canvas:spot event provides updated position on scroll/resize
editor.on('canvas:spot', ({ spots }) => {
  const spot = spots.find((s) => s.getType() === 'ai-context-bar');
  if (spot) {
    // Apply spot.getStyle() to the bar DOM element
    // spot.getStyle() returns { position:'absolute', top:'...', left:'...', width:'...' }
  }
});
```

The bar DOM element must live inside `Canvas.getSpotsEl()` (which uses `pointer-events: none`). Interactive buttons inside the bar need `pointer-events: auto` re-enabled via inline style or CSS.

**Component type detection:**
```typescript
const type = sel.get('type');     // 'text', 'image', or generic
const tag = sel.get('tagName');   // fallback: 'img', 'p', 'h1', etc.
```

**Per-type actions:**
- `text` type or heading/paragraph tagName → show: AI 다시쓰기, AI 번역, AI 축약
- `image` type or `img` tagName → show: 배경 제거, AI 생성 (these mirror AIImageEditPanel presets)
- generic element → hide bar (no actions)

**Loading state:** Local `useState` inside `AIContextBar`. Actions are fire-and-wait — show spinner on button while in-flight, apply result directly to the selected component.

**Text result application:**
```typescript
// After successful rewrite/translate
editor.getSelected()?.set('content', resultText);
// or for inner HTML:
editor.getSelected()?.components().reset();
editor.getSelected()?.append(resultText);
```

**Image result application (already works in AIImageEditPanel):**
```typescript
editor.getSelected()?.setAttributes({ src: newImageUrl });
```

### 2. Text AI Endpoint (Backend)

**Endpoint:** `POST /api/editor/ai-text`

```
Body:  { text: string, action: 'rewrite' | 'translate_ko' | 'shorten' | 'custom', prompt?: string }
Response: { result: string }
```

**Where to add:** New `editor` NestJS module at `apps/server/src/editor/` (3-file pattern: module + controller + service). Register in `app.module.ts`. This module also owns `templates/modify`, `images/edit`, and `render-image` — grouping all editor-serving endpoints in one domain module.

**Gemini call** (copy pattern from `ai-analyze.ts`, no new library):
```typescript
const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? '';
const GEMINI_MODEL = process.env.AI_TEXT_MODEL ?? 'gemini-2.5-flash';
const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
```

Prompt example for translate action:
```
다음 텍스트를 자연스러운 한국어 쇼핑몰 상세페이지 문체로 번역하세요. 원문: "{text}"
응답은 번역된 텍스트만, 다른 내용 없이.
```

### 3. Image Edit Endpoint (Backend)

**Endpoint:** `POST /api/images/edit`

Body matches what `AIImageEditPanel.tsx` already sends:
```
{ image_url: string, preset: string, user_prompt: string }
```

Use raw `fetch` to FAL.AI REST API. The Python agent already uses FAL.AI — check `agents/src/agents/image/` for the exact model endpoints and `FAL_KEY` usage. NestJS proxies the call using the same `FAL_KEY` env var.

FAL.AI models likely in use (verify from Python agent):
- Background removal: `fal-ai/birefnet` or `fal-ai/remove-background`
- Background replace / AI generate: `fal-ai/flux/dev` or `fal-ai/stable-diffusion`

### 4. Templates Modify Endpoint (Backend)

**Endpoint:** `POST /api/templates/modify`

Already expected by `AIDesignChatPanel.tsx`. Add to the `editor` NestJS module. Takes `{ html: string, prompt: string }`, calls Gemini with the full HTML in context, returns `{ html: string }`.

### 5. Render Image Endpoint (Backend)

**Endpoint:** `POST /api/render-image`

Expected by the Export PNG button. Two implementation options:

| Option | Approach | Tradeoff |
|--------|----------|----------|
| Client-side | `html-to-image` npm (~15KB) captures iframe body directly | No Docker Chromium needed. May miss cross-origin images. Requires changing export flow from `fetch POST` to client-side capture. |
| Server-side | `puppeteer` in NestJS Docker container | Handles cross-origin images and fonts. Adds ~170MB Chromium to Docker image. |

**Recommendation:** Start with `html-to-image` on the frontend. Change the export flow to capture the canvas iframe's `document.body` directly — the HTML is already in memory in the browser. Avoids Docker complexity. If cross-origin images or font rendering causes problems, add `puppeteer` later.

If `html-to-image` is chosen, the install is:
```bash
npm install -w apps/web html-to-image
```
Version: 3.x (latest). Zero runtime dependencies. MIT licensed.

---

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| Canvas Spots API (GrapesJS built-in) | `@floating-ui/dom` + `grapesjs-float` | `grapesjs-float` has 2 stars, 2 forks, no published releases. Floating UI requires cross-iframe coordinate calculation that Canvas Spots handles natively via `spot.getStyle()`. |
| Canvas Spots API | GrapesJS built-in component `toolbar` property | Toolbar uses Font Awesome class strings + GrapesJS command IDs — not React. Has documented initialization timing issues (GH #3233). Canvas Spots gives full React control, loading states, and conditional per-type rendering. |
| Raw `fetch` to Gemini REST | `@google/generative-ai` SDK | Project already uses raw fetch for Gemini (`ai-analyze.ts`). Adding the SDK for the same endpoint is inconsistent and adds package weight for no gain. |
| `html-to-image` (client-side) | `puppeteer` (server-side) | Puppeteer adds ~170MB Chromium to Docker. Frontend capture avoids backend complexity and matches where the HTML already lives. |
| New `editor` NestJS module | Spread new endpoints across `products` or `sourcing` | Groups all editor-serving endpoints in one self-contained domain module. Follows the project's module pattern and CLAUDE.md's "도메인 모듈 자기 완결" rule. |
| Local `useState` in AIContextBar | New Zustand store slice | Per-element AI state is ephemeral (loading flag, single result). Zustand store is for cross-component shared state. One action at a time, no cross-component sharing needed. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `grapesjs-float` npm plugin | 2 stars/2 forks, no releases, requires manual iframe offset math | Canvas Spots API (`Canvas.addSpot`, `spot.getStyle()`) — built into grapesjs 0.22 |
| GrapesJS `toolbar` property on component types | Timing/initialization bugs (GH #3233); uses icon class strings not React; no loading state support | Canvas Spots overlay rendered via React inside `WithEditor` |
| `@google/generative-ai` SDK | Pattern inconsistency; project uses raw fetch for Gemini | Raw `fetch` as in `ai-analyze.ts` |
| `puppeteer` / `playwright` for render-image (initial build) | ~170MB Chromium binary in Docker; overkill initially | `html-to-image` client-side (15KB), or defer entirely |
| New Zustand slice for context bar AI state | Ephemeral action state; no cross-component sharing needed | Local `useState` inside `AIContextBar` component |
| Extending GrapesJS component types via `DomComponents.addType` for AI buttons | Overriding built-in types (`text`, `image`) risks breaking RTE and asset manager. Timing issues with toolbar initialization. | Canvas Spots overlay — separate from component model |

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `grapesjs@0.22.14` | Canvas Spots API | `addSpot`, `getSpotsEl`, `canvas:spot`, `spot.getStyle()` documented in 0.22.x. Already installed. No upgrade needed. |
| `@grapesjs/react@2.0.0` | `useEditor`, `WithEditor`, `Canvas` | No changes needed. Already used in DetailPageEditor.tsx. |
| `lucide-react@0.577.0` | All new UI in AIContextBar | Sufficient icon set. Sparkles, Wand2, Languages, Eraser icons available. |
| `html-to-image@3.x` (if chosen) | `react@18`, `next@14` | Client-side only. No SSR usage. Compatible. |

---

## Installation

No new packages required for the core scope (Canvas Spots + Gemini text AI).

Optional — if client-side PNG export is chosen:
```bash
# apps/web only
npm install -w apps/web html-to-image
```

No new server-side packages. No new Python agent packages.

---

## Sources

- `apps/web/src/components/editor/DetailPageEditor.tsx` — GrapesJS integration pattern verified (component:selected, Canvas.getFrameEl, useEditor, WithEditor, addSpot usage) (HIGH confidence)
- `apps/web/src/components/editor/AIImageEditPanel.tsx` — existing AI image edit side panel, `/api/images/edit` endpoint reference (HIGH confidence)
- `apps/web/src/components/editor/AIDesignChatPanel.tsx` — `/api/templates/modify` endpoint reference (HIGH confidence)
- `apps/server/src/workflows/executors/ai-analyze.ts` — Gemini raw fetch pattern, env var names (HIGH confidence)
- `apps/server/src/app.module.ts` — confirmed no `editor`, `templates`, or `images` modules exist (HIGH confidence)
- `apps/web/package.json` + `apps/server/package.json` — all existing dependencies verified (HIGH confidence)
- [GrapesJS Canvas API docs](https://grapesjs.com/docs/api/canvas.html) — `addSpot`, `getSpotsEl`, `getCoords`, `getRect`, `getWorldRectToScreen`, `canvas:spot` event (MEDIUM confidence)
- [GrapesJS Canvas module guide](https://grapesjs.com/docs/modules/Canvas.html) — Canvas Spots architecture, `spot.getStyle()`, `pointer-events: none` container, `getSpotsEl().appendChild()` pattern (MEDIUM confidence)
- [GrapesJS Component API](https://grapesjs.com/docs/api/component.html) — `toolbar` property format, `component.get('type')` (MEDIUM confidence)
- [GrapesJS Discussion #3761](https://github.com/GrapesJS/grapesjs/discussions/3761) — iframe contextmenu event approach; Canvas Spots CSS override (MEDIUM confidence)
- [GrapesJS Issue #3233](https://github.com/GrapesJS/grapesjs/issues/3233) — toolbar initialization timing issues when using addType (MEDIUM confidence)
- [grapesjs-float GitHub](https://github.com/bgrand-ch/grapesjs-float) — 2 stars, no published releases; not recommended (LOW maturity, verified)
- [Floating UI React docs](https://floating-ui.com/docs/react) — cross-iframe limitation documented in GH issue #1594 (MEDIUM confidence)
- [JSFiddle Canvas Spots demo](https://jsfiddle.net/artur_arseniev/zdetbjsg/) — `Canvas.addSpot`, `editor.on('canvas:spot')`, `spot.getStyle()` pattern confirmed working in Vue (MEDIUM confidence — translates directly to React)

---

*Stack research for: GrapesJS WYSIWYG editor + per-element AI actions (KidItem v2.1)*
*Researched: 2026-03-26*
