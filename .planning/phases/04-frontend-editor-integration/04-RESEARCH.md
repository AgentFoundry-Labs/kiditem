# Phase 4: Frontend Editor Integration - Research

**Researched:** 2026-03-26
**Domain:** Next.js 14 frontend, React state management, react-colorful, iframe preview, polling
**Confidence:** HIGH

## Summary

Phase 4 extends the existing editor page (`/sourcing/[id]/editor/page.tsx`) with a structured editing mode that sits in front of the existing GrapesJS canvas. All decisions are locked in CONTEXT.md — this is a pure implementation research phase with minimal ambiguity.

The codebase already has everything needed except `react-colorful`. The core pattern is: load `draftContent` from API → render it into a local `DetailPageData` state → re-render with `renderTemplateToHtml()` on every field change → display in an iframe. The only net-new library is `react-colorful` (version 5.6.1, confirmed from npm registry).

**Primary recommendation:** Extend `EditorPage` to hold a `mode` state (`'structured' | 'grapes'`), derive a mutable `draftData` from the preview API response, and wrap the existing `DetailPageEditor` for GrapesJS mode.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Two modes coexist on the editor page: (1) Structured editing mode — left panel with text/color/hero fields, right panel with live template preview. (2) GrapesJS mode — full HTML canvas editing (existing). User transitions from structured mode to GrapesJS after image generation.
- **D-02:** Structured editing panel uses tabs or sections: text fields (title, hook, key_points, specs), theme colors (7 color pickers), hero image selection (reuse ImagePickerModal).
- **D-03:** Step-by-step guided flow inside the editor:
  1. Editor opens in structured editing mode (text/color/hero fields populated from draftContent)
  2. User edits fields → changes save via PUT /api/products/:id/draft-content (debounced or on-change)
  3. Live preview updates in real-time as user edits (re-render template with current data)
  4. "이미지 생성 확정" CTA button → POST /api/products/:id/trigger-image-generation
  5. Loading/polling state while images generate (pipelineStep=images_generating)
  6. On completion → preview shows final result (processedData) → GrapesJS mode available for HTML fine-tuning
- **D-04:** The structured editing panel is visible only when draftContent exists and processedData is not yet generated (or user explicitly re-enters edit mode).
- **D-05:** Preview re-renders using existing `renderTemplateToHtml()` with updated DetailPageData whenever a field changes. No backend call needed for preview — it's client-side rendering.
- **D-06:** Preview uses the same template rendering pipeline (parseDetailPageData → getTemplate → renderTemplateToHtml) — displayed in an iframe.
- **D-07:** Install `react-colorful` (2.8KB, zero deps) for the 7 theme color pickers. Each color field shows a swatch + hex input + popover picker.
- **D-08:** Reuse existing `ImagePickerModal` component for hero image selection. Show raw_data.images as the source gallery. Selected hero is saved to draftContent.
- **D-09:** Frontend sends the FULL draftContent object on every save (per Phase 3 D-01 — full replacement). Save triggers on: field blur, color change, hero selection. Not debounced — immediate on user action.
- **D-10:** After triggering image generation, poll GET /api/products/:id every 3 seconds (existing pattern). When pipelineStep becomes null and processedData exists → show final result.

### Claude's Discretion

- Exact component structure (new components vs inline)
- Tab/section naming and grouping in the editing panel
- Animation/transition between modes
- Error handling for failed image generation

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| EDIT-01 | 에디터에서 텍스트 필드를 직접 편집할 수 있다 (제목, 훅텍스트, 키포인트, 스펙 등) | DetailPageData schema fully mapped — `title`, `hookText`, `hookTitleSub`, `hookSubtext`, `description[]`, `keyPoints[]`, `specs[]`, `productInfo[]` are the editable fields |
| EDIT-02 | 에디터에서 테마 컬러 7개를 컬러 피커로 변경할 수 있다 | `react-colorful` 5.6.1 confirmed; 7 theme fields: `themeColorMain`, `themeColorBgLight`, `themeColorBadge1`, `themeColorBadge2`, `themeSectionBg`, `themeTextPrimary`, `themeTextSecondary` |
| EDIT-03 | 에디터에서 raw_data.images 중 히어로 이미지를 선택할 수 있다 | `ImagePickerModal` already accepts `rawImages` prop; `heroBanner` field in DetailPageData stores selection |
| EDIT-04 | 편집 내용이 실시간으로 템플릿 프리뷰에 반영된다 | `renderTemplateToHtml()` is synchronous client-side; iframe `srcDoc` pattern works without backend calls |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react-colorful | 5.6.1 | Color picker for 7 theme fields | Decided (D-07); lightest option (2.8KB, zero deps); `HexColorPicker` + `HexColorInput` cover the swatch+hex+popover pattern |
| @radix-ui/react-popover | ^1.1.15 | Popover container for color picker | Already installed in apps/web/package.json |
| lucide-react | ^0.577.0 | Icons in editing panel | Already installed |
| @kiditem/templates | * | `parseDetailPageData`, `getTemplate`, `DetailPageData` type | Already installed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| react-dom/server | (bundled with react-dom ^18) | `renderToStaticMarkup` inside `renderTemplateToHtml` | Used by `template-html.tsx` — already wired |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| react-colorful | @radix-ui color picker | Does not exist in Radix; react-colorful is the standard lightweight choice |
| react-colorful | react-color | react-color is larger (14KB+), unmaintained; react-colorful is the modern replacement |

**Installation (only new dependency):**
```bash
cd apps/web && npm install react-colorful
```

**Version verification:** Confirmed `react-colorful` 5.6.1 from `npm view react-colorful version` on 2026-03-26.

---

## Architecture Patterns

### Current Editor Page Structure

`apps/web/src/app/sourcing/[id]/editor/page.tsx` currently:
1. Fetches `GET /api/products/:id` and `GET /api/products/:id/preview` on mount
2. Renders a full-screen `<DetailPageEditor>` (GrapesJS) with the initial HTML
3. No structured editing mode yet

### Proposed Extension: Mode State

The page gains a top-level `mode` state (`'structured' | 'grapes'`). Initial mode is determined from the product data:
- `draftContent !== null` AND `processedData === null` → start in `'structured'` mode
- Otherwise → start in `'grapes'` mode (existing behavior)

### Data Flow

```
fetchData() →
  product.draftContent → local draftData: DetailPageData state
  product.raw_data.images → rawImages (for ImagePickerModal)
  product.processedData → drives mode switch after polling

User edits field →
  setDraftData({ ...draftData, [field]: value })
  onBlur / onChange → saveDraftContent() → PUT /api/products/:id/draft-content
  Preview iframe re-renders: renderTemplateToHtml(Component, draftData, config, css)

"이미지 생성 확정" clicked →
  POST /api/products/:id/trigger-image-generation
  pipelineStep becomes 'images_generating'
  Poll GET /api/products/:id every 3s
  When pipelineStep === null && processedData !== null → switch to 'grapes' mode

GrapesJS mode →
  Re-render final HTML from processedData
  Pass to existing DetailPageEditor (unchanged)
```

### Recommended Component Structure

```
apps/web/src/app/sourcing/[id]/editor/
├── page.tsx                           — Mode orchestration, data fetching, polling
└── components/
    ├── StructuredEditPanel.tsx        — Left panel: field sections/tabs
    ├── ColorPickerField.tsx           — Swatch + hex input + popover picker
    ├── StructuredPreviewPane.tsx      — Right panel: iframe with live HTML
    └── ImageGenerationCTA.tsx         — "이미지 생성 확정" button + loading state
```

All new components are `'use client'` (mandatory per CLAUDE.md).

### Preview Iframe Pattern

The iframe approach (D-06) uses `srcDoc` to inject the full HTML string:

```typescript
// Source: apps/web/src/lib/template-html.tsx (existing)
const html = renderTemplateToHtml(
  templateConfig.component as React.ComponentType<any>,
  draftData,
  templateConfig,
  templateCss,
);

// In preview pane:
<iframe
  srcDoc={html}
  className="w-full h-full border-0"
  title="preview"
/>
```

`renderTemplateToHtml` calls `renderToStaticMarkup` (synchronous). No async/await needed. The iframe re-renders whenever `html` changes — React's normal re-render cycle handles this.

### Color Picker Pattern (react-colorful)

```typescript
// Source: react-colorful npm package documentation
import { HexColorPicker, HexColorInput } from 'react-colorful';
import * as Popover from '@radix-ui/react-popover';

function ColorPickerField({ label, value, onChange }: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-600 w-24 shrink-0">{label}</span>
      <Popover.Root>
        <Popover.Trigger asChild>
          <button
            className="w-6 h-6 rounded border border-gray-300 shrink-0"
            style={{ backgroundColor: value }}
          />
        </Popover.Trigger>
        <Popover.Content className="z-50 p-3 bg-white rounded-lg shadow-xl border border-gray-200">
          <HexColorPicker color={value} onChange={onChange} />
        </Popover.Content>
      </Popover.Root>
      <HexColorInput
        color={value}
        onChange={onChange}
        prefixed
        className="w-24 px-2 py-1 text-xs border border-gray-200 rounded font-mono"
      />
    </div>
  );
}
```

Color changes trigger `onChange` on every hue-drag. Per D-09, save triggers on color change (not drag). A local `isPickerOpen` state or Popover `onOpenChange` can gate the save call to `onClose` of the popover, avoiding a save per drag pixel.

### Saving Pattern

```typescript
const saveDraftContent = useCallback(async (data: DetailPageData) => {
  try {
    await fetch(`${API_BASE}/api/products/${productId}/draft-content`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),  // full object, no partial merge
    });
  } catch {
    // log silently — preview still works locally
  }
}, [productId]);
```

D-09 says save is immediate on field blur, color change, hero selection. The save is fire-and-forget for UX (preview updates do not depend on server response).

### Polling Pattern (existing, replicate)

```typescript
// Pattern from apps/web/src/app/sourcing/[id]/page.tsx lines 158-172
useEffect(() => {
  if (!isGenerating) return;
  const interval = setInterval(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/products/${productId}`);
      const p = await res.json();
      // pipelineStep === null AND processedData !== null → done
      if (!p.pipelineStep && p.processedData) {
        setIsGenerating(false);
        setMode('grapes');
        // Re-render with processedData
      }
    } catch {
      void 0;
    }
  }, 3000);
  return () => clearInterval(interval);
}, [isGenerating, productId]);
```

Key: the API response from `GET /api/products/:id` returns the Prisma product object with `pipelineStep` (camelCase, from Prisma `findUnique`). The field is `pipelineStep` in the JSON response (NestJS returns Prisma camelCase directly).

### DetailPageData → draftContent Field Mapping

The `draftContent` JSON in the DB stores snake_case keys (written by the Python agent). `parseDetailPageData()` handles the snake_case → camelCase conversion. When saving back (PUT), the frontend sends the camelCase `DetailPageData` object directly — the backend stores it as-is into the JSONB column.

**Important:** The preview endpoint (`GET /api/products/:id/preview`) returns:
```json
{ "template": "bold-vertical", "data": {...}, "images": [...] }
```
The `data` field contains the raw JSONB value (may be snake_case if written by Python, or camelCase if written by frontend). `parseDetailPageData()` handles both via `SNAKE_TO_CAMEL` map.

### Text Fields to Expose in EDIT-01

From `DetailPageDataSchema` — the fields the user should edit in the structured panel:

| Section | Fields | Input Type |
|---------|--------|------------|
| 기본 텍스트 | `title`, `subtitle`, `badge` | `<input type="text">` |
| 훅 섹션 | `hookText`, `hookTitleSub`, `hookSubtext` | `<input type="text">` |
| 설명 | `description` (array of strings) | Textarea or multi-line |
| 키포인트 | `keyPoints[].title`, `keyPoints[].description` | Repeated input groups |
| 스펙 | `specs[].key`, `specs[].value` | Key-value pairs |

### Theme Color Fields for EDIT-02

Exactly 7 fields identified from `DetailPageDataSchema`:
1. `themeColorMain` — default `#ff8c69`
2. `themeColorBgLight` — default `#fffaf0`
3. `themeColorBadge1` — default `#ff8c69`
4. `themeColorBadge2` — default `#69c9ff`
5. `themeSectionBg` — default `#f4f1eb`
6. `themeTextPrimary` — default `#4a4a4a`
7. `themeTextSecondary` — default `#8a8a8a`

Note: `themeBorderRadius` is a string (`'32px'`) not a color — exclude from color pickers.

### Hero Image for EDIT-03

`ImagePickerModal` already accepts `rawImages: string[]` and `processedImages: string[]`. For hero selection:
- Pass `rawImages` from `raw_data.images`
- Pass empty array for `processedImages` (hero picker only uses raw)
- On `onSelect(url)` → update `draftData.heroBanner = url`
- Save immediately per D-09

### Anti-Patterns to Avoid

- **Calling preview endpoint for live preview:** D-05 is explicit — no backend call for preview. Use client-side `renderTemplateToHtml` only.
- **Debouncing saves:** D-09 explicitly says "not debounced — immediate on user action". Blur/color-close/hero-select triggers save.
- **Modifying DetailPageEditor:** GrapesJS component is untouched. Mode switch just unmounts StructuredEditPanel and mounts DetailPageEditor.
- **Partial JSONB updates:** PUT always sends the full `DetailPageData` object (D-09 references Phase 3 D-01 full replacement strategy).
- **pipelineStep comparison confusion:** Poll checks `pipelineStep === null` (null, not empty string) AND `processedData !== null`. Both must be true.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Color picker with swatch + hex | Custom color input | `react-colorful` HexColorPicker + HexColorInput | Edge cases: hex validation, alpha, keyboard input, accessibility |
| Popover positioning | CSS absolute positioning | `@radix-ui/react-popover` (already installed) | Handles viewport overflow, focus trap, z-index |
| Template HTML rendering | Custom React-to-string | `renderTemplateToHtml()` in `apps/web/src/lib/template-html.tsx` | Already works, tested with GrapesJS flow |
| Image picker modal | New image grid | `ImagePickerModal` in `apps/web/src/components/editor/ImagePickerModal.tsx` | Already has raw/processed/upload tabs, selection state |

---

## Common Pitfalls

### Pitfall 1: iframe srcDoc encoding
**What goes wrong:** Setting `iframe.src` to a data URI is unreliable cross-browser. Using `srcDoc` works but very long HTML strings can cause brief flicker.
**Why it happens:** React re-creates the iframe element when `srcDoc` changes.
**How to avoid:** Use `useRef` on the iframe and set `contentDocument.open(); write(); close()` imperatively, OR simply use `srcDoc` (acceptable for this use case since preview is a development tool, not a production page).
**Warning signs:** Iframe shows blank white flash on each keystroke.

### Pitfall 2: API response field casing for polling
**What goes wrong:** `GET /api/products/:id` returns Prisma camelCase — `pipelineStep`, `processedData`, `draftContent`. The existing `sourcing-api.ts` `getDetail()` remaps to snake_case. The new polling code in `editor/page.tsx` uses raw `fetch` (not `productsApi`), so it receives camelCase directly.
**Why it happens:** `productsApi.getDetail()` explicitly remaps `p.processedData` → `processed_data`. Direct `fetch` to `GET /api/products/:id` returns `{ pipelineStep: ..., processedData: ... }`.
**How to avoid:** In the polling `useEffect` in `EditorPage`, read `p.pipelineStep` (camelCase) and `p.processedData` (camelCase), not snake_case versions.

### Pitfall 3: draftContent null vs. empty object
**What goes wrong:** `product.draftContent` is `null` when AI Step 1 has not been run. Trying to call `parseDetailPageData(null)` will throw a Zod parse error.
**Why it happens:** Prisma nullable `Json?` returns `null`, Zod schema requires at minimum `title: string`.
**How to avoid:** Guard: `if (!product.draftContent) → show "AI 재가공이 필요합니다" state and do not enter structured mode`. The preview endpoint also returns `template: null` when no draftContent — use this as the structured mode gate.

### Pitfall 4: Color picker saves on every drag pixel
**What goes wrong:** If `onChange` of `HexColorPicker` directly calls `saveDraftContent()`, it fires hundreds of PUT requests per color drag gesture.
**Why it happens:** `HexColorPicker.onChange` fires on every mouse move during drag.
**How to avoid:** Keep local color state (`useState`) for the picker to update; call `saveDraftContent` only when the Popover closes (`Popover.Root onOpenChange(false)` → save). Preview still updates on every `onChange` via local state — server save is deferred to popover close.

### Pitfall 5: parseDetailPageData called with camelCase draftContent
**What goes wrong:** Frontend saves camelCase `DetailPageData` to the DB. Later, `parseDetailPageData()` is called on `preview.data` which now contains camelCase keys. The `SNAKE_TO_CAMEL` map skips keys that are already camelCase — this is fine because Zod schema then receives them directly.
**Why it happens:** Python writes snake_case; frontend writes camelCase. Both pass through `parseDetailPageData` which handles both via fallback `camelKey = SNAKE_TO_CAMEL[key] ?? key`.
**How to avoid:** No action needed — `parseDetailPageData` is robust to both. Just be aware the behavior is correct.

---

## Code Examples

### Mode Orchestration in EditorPage

```typescript
// Extend existing EditorPage state
const [mode, setMode] = useState<'structured' | 'grapes'>('structured');
const [draftData, setDraftData] = useState<DetailPageData | null>(null);
const [pipelineStep, setPipelineStep] = useState<string | null>(null);
const [isGenerating, setIsGenerating] = useState(false);

// After fetchData(), determine initial mode:
// structured if: draftContent exists AND processedData is null
const hasDraft = !!product.draftContent;
const hasProcessed = !!product.processedData;
setMode(hasDraft && !hasProcessed ? 'structured' : 'grapes');

// draftData loaded from preview.data (handles both draft and processed)
const parsed = parseDetailPageData(preview.data);
setDraftData(parsed);
setPipelineStep(product.pipelineStep ?? null);
```

### Trigger Image Generation

```typescript
const handleTriggerImageGeneration = async () => {
  setIsGenerating(true);
  try {
    await fetch(`${API_BASE}/api/products/${productId}/trigger-image-generation`, {
      method: 'POST',
    });
    // Polling starts via useEffect watching isGenerating
  } catch (err) {
    setIsGenerating(false);
    // Show error state
  }
};
```

### Polling for Completion (D-10)

```typescript
useEffect(() => {
  if (!isGenerating) return;
  const interval = setInterval(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/products/${productId}`);
      if (!res.ok) return;
      const p = await res.json() as {
        pipelineStep: string | null;
        processedData: Record<string, unknown> | null;
        draftContent: Record<string, unknown> | null;
      };
      if (!p.pipelineStep && p.processedData) {
        setIsGenerating(false);
        // Re-fetch preview to get processedData-based HTML
        const previewRes = await fetch(`${API_BASE}/api/products/${productId}/preview`);
        const preview = await previewRes.json() as PreviewResponse;
        const finalData = parseDetailPageData(preview.data);
        setDraftData(finalData);
        setMode('grapes');
      }
    } catch {
      void 0;
    }
  }, 3000);
  return () => clearInterval(interval);
}, [isGenerating, productId]);
```

### Structured Panel Layout (two-column)

```tsx
// In EditorPage render, when mode === 'structured':
<div className="flex h-screen">
  {/* Left: editing panel */}
  <div className="w-[400px] shrink-0 border-r border-gray-200 overflow-y-auto bg-white">
    <StructuredEditPanel
      data={draftData}
      rawImages={rawImages}
      onChange={handleDraftChange}
      onSave={saveDraftContent}
    />
    <ImageGenerationCTA
      isGenerating={isGenerating}
      onConfirm={handleTriggerImageGeneration}
    />
  </div>
  {/* Right: live preview */}
  <div className="flex-1 bg-gray-100 overflow-hidden">
    <StructuredPreviewPane
      templateConfig={templateConfig}
      draftData={draftData}
      templateCss={templateCss}
    />
  </div>
</div>
```

---

## Environment Availability

Step 2.6: SKIPPED (no external dependencies identified — this phase installs one npm package and modifies existing frontend files only).

---

## Validation Architecture

No automated test infrastructure detected in `apps/web/`. The project uses no test framework for the frontend (no `jest.config.*`, `vitest.config.*`, or `__tests__/` directories found).

All 4 EDIT requirements are UI interaction requirements that are best validated manually:

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EDIT-01 | Text fields editable, preview updates on change | Manual | — | N/A |
| EDIT-02 | 7 color pickers change theme colors, preview updates | Manual | — | N/A |
| EDIT-03 | Hero image selectable from raw images via ImagePickerModal | Manual | — | N/A |
| EDIT-04 | Live preview reflects all edits in real-time (no backend call) | Manual | — | N/A |

**Manual verification checklist (per task):**
1. Open editor for a product with `draftContent` set and `processedData` null
2. Confirm structured mode is shown (not GrapesJS)
3. Edit `title` field → preview iframe updates immediately
4. Change `themeColorMain` → preview updates on picker close
5. Open hero picker → select raw image → preview shows new heroBanner
6. Click "이미지 생성 확정" → loading state appears → poll resolves → GrapesJS opens

---

## Open Questions

1. **draftContent null guard UX**
   - What we know: If user navigates to editor before running AI Step 1, `draftContent` is null, so structured mode cannot load.
   - What's unclear: Should the page fall back to GrapesJS mode or show an error/CTA to trigger AI Step 1?
   - Recommendation (Claude's Discretion): Show an inline message "AI 재가공이 필요합니다" with a button to go back to the sourcing detail page. Do not auto-trigger AI Step 1 from the editor.

2. **Re-entry into structured mode from GrapesJS**
   - What we know: D-04 says structured panel visible only when draftContent exists and processedData not yet generated, OR user explicitly re-enters edit mode.
   - What's unclear: The mechanism for "user explicitly re-enters edit mode" is left to Claude's Discretion.
   - Recommendation: Add a "구조 편집" button in the GrapesJS toolbar area that sets `mode = 'structured'`.

3. **Color picker save timing**
   - What we know: D-09 says "immediate on color change" but color picker fires `onChange` on every drag pixel.
   - What's unclear: Does "color change" mean every pixel drag or final selection?
   - Recommendation: Save on Popover close (onOpenChange false). Preview updates on every drag via local state. This is the standard UX for color pickers.

---

## Sources

### Primary (HIGH confidence)
- `/Users/yhc125/workspace/kiditem/apps/web/src/app/sourcing/[id]/editor/page.tsx` — current editor implementation
- `/Users/yhc125/workspace/kiditem/apps/web/src/components/editor/ImagePickerModal.tsx` — confirmed reusable interface
- `/Users/yhc125/workspace/kiditem/apps/web/src/lib/template-html.tsx` — `renderTemplateToHtml` signature confirmed
- `/Users/yhc125/workspace/kiditem/packages/templates/src/schemas.ts` — all `DetailPageData` fields documented
- `/Users/yhc125/workspace/kiditem/apps/server/src/products/products.service.ts` — `triggerImageGeneration`, `updateDraftContent`, `getPreview` implementations confirmed
- `/Users/yhc125/workspace/kiditem/apps/web/package.json` — confirmed `react-colorful` not yet installed; `@radix-ui/react-popover` is already installed
- `npm view react-colorful version` — confirmed 5.6.1 on 2026-03-26

### Secondary (MEDIUM confidence)
- react-colorful npm registry — `HexColorPicker` and `HexColorInput` are the two exported components for hex-only color picking

### Tertiary (LOW confidence)
None.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — react-colorful version confirmed from npm; all other deps confirmed from package.json
- Architecture: HIGH — all patterns verified from existing source files; no speculation
- Pitfalls: HIGH — field casing pitfall verified by reading sourcing-api.ts remapping vs. direct fetch; color picker save pitfall from react-colorful onChange behavior

**Research date:** 2026-03-26
**Valid until:** 2026-04-26 (Next.js 14, react-colorful, and Radix UI are stable)
