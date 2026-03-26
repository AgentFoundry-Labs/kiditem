# Feature Research

**Domain:** WYSIWYG page editor with per-element AI actions (e-commerce product detail page builder)
**Researched:** 2026-03-26
**Confidence:** HIGH (existing codebase verified, AI UX patterns from Figma/Framer/Froala research)

---

## Context: What Already Exists

This is a subsequent milestone on an existing product. The following are built and working — do NOT rebuild:

| Existing Feature | Location |
|-----------------|----------|
| GrapesJS editor page (`/sourcing/[id]/editor`) | `apps/web/src/app/sourcing/[id]/editor/` |
| Structured edit panel (left side, form-based) | `StructuredEditPanel.tsx` |
| GrapesJS canvas with image element detection | `DetailPageEditor.tsx` — `component:selected` event |
| AI image edit panel (floating, appears on image selection) | `AIImageEditPanel.tsx` — presets: remove bg, remove text, replace bg, enhance, full regenerate |
| AI design chat panel (whole-page rewrite via chat prompt) | `AIDesignChatPanel.tsx` — calls `POST /api/templates/modify` |
| 2-step AI pipeline: content_draft + content_image (FAL.AI) | Python `content` agent + NestJS endpoints |
| Image picker modal for hero image selection | `ImagePickerModal.tsx` |
| Placeholder bold-vertical HTML generation | `renderTemplateToHtml()` + `placeholderDetailPageData` constant |
| `pipelineStep` + `draftContent` DB columns | `prisma/schema.prisma` `Product` model |
| Per-element image AI — already ships | Image selection triggers `AIImageEditPanel` floating panel |

**This milestone adds:** draft-mode editor entry + "AI fill remaining" CTA in GrapesJS mode + per-element text AI actions.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features a seller using this editor assumes will work. Missing these makes the tool feel broken.

| Feature | Why Expected | Complexity | Dependency on Existing | Notes |
|---------|--------------|------------|----------------------|-------|
| Enter GrapesJS editor from draft (no AI run first) | Sellers want to edit immediately after sourcing, before committing to AI generation cost and wait time | LOW | `placeholderDetailPageData` constant exists; editor page already supports GrapesJS mode | Routing logic change: when product is `draft` with no `draftContent`, load placeholder HTML instead of showing "no data" error |
| Placeholder HTML visible on first open | Standard page-builder behavior — canvas shows template structure, not blank | LOW | `renderTemplateToHtml()` + `placeholderDetailPageData` already imported in `editor/page.tsx` | Content exists. Just needs correct routing condition to trigger it |
| "AI로 나머지 채우기" CTA accessible from GrapesJS mode | Sellers need to trigger the AI pipeline from inside the editor, not only from the sourcing list | LOW–MEDIUM | `ImageGenerationCTA` component exists but renders only in structured mode | CTA must also appear in GrapesJS mode. Currently blocked by `if (mode === 'structured')` condition |
| Text elements show AI rewrite options on selection | Industry standard — Figma, Framer, CKEditor, Froala all do this. Selecting text without AI options feels like an incomplete tool | MEDIUM | `component:selected` handler exists; currently only detects `img` type. `AIImageEditPanel` floating pattern is established | New: detect text components (`tagName` h1/h2/p/span), render `AITextEditPanel` in same overlay position as image panel |
| Image elements show AI edit options on selection | ALREADY DONE | DONE | `AIImageEditPanel` fires on `img` component:selected | No new work needed |
| Loading state during AI text operation | Users need feedback during 5–15s LLM latency | LOW | Loading patterns exist in `AIImageEditPanel` and `AIDesignChatPanel` | Replicate spinner + disabled state pattern |
| Graceful error feedback | AI calls fail — user must see what happened | LOW | Error patterns exist in both AI panels | Reuse: inline error message with auto-dismiss |
| Undo after AI text change | Users must be able to revert AI changes without losing other edits | LOW | GrapesJS `UndoManager` (50-step stack) already tracks `component.set('content', ...)` | Nothing to build — UndoManager handles it automatically |

### Differentiators (Competitive Advantage)

Features that set this tool apart. Aligned with core value: minimum manual work to publish a Korean product page.

| Feature | Value Proposition | Complexity | Dependency on Existing | Notes |
|---------|-------------------|------------|----------------------|-------|
| Per-element text AI with Korean-specific presets | Generic WYSIWYG tools offer "rewrite" only. Presets like "한국 마케팅 문체로 다시쓰기", "번역 (중→한)", "축약" map directly to the Coupang seller task | MEDIUM | Needs new NestJS endpoint: `POST /api/ai/rewrite-text { text, preset, customPrompt? }`. Python agent not involved — this is a direct LLM call from NestJS | `GeneratedContent` schema shows the expected Korean copy style. Presets mirror that vocabulary |
| "AI로 나머지 채우기" (Fill remaining with AI) from GrapesJS mode | Single CTA fills all placeholder/empty fields via step1 pipeline. No other tool in the Korean seller stack does this. Saves 10+ minutes of manual Korean copywriting | MEDIUM | Python agent `run_step1()` does the full copywriting job. NestJS endpoint for triggering step1 must exist or be added | Core differentiator for the milestone. Workflow: draft → GrapesJS with placeholder → "AI 채우기" → step1 runs → canvas updates with real content |
| Context-aware text presets (by element type) | Headings get "더 임팩트 있게" while body copy gets "더 자세히" or "축약". Makes AI feel intentional | MEDIUM | GrapesJS `component.get('tagName')` available in selection handler | Frontend-only logic — map tagName to preset set. LOW implementation risk |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| "Improve all text" — rewrite every element at once | Sounds efficient | Homogeneous output; no way to review 15+ elements; latency stacks (15 concurrent LLM calls); sellers lose control over which sections sound human | "AI로 나머지 채우기" fills placeholder/empty fields only. For existing text, require per-element explicit trigger |
| Real-time AI suggestions as user types | Modern writing tool pattern (Notion AI, Grammarly) | This is a listing preparation tool, not a writing tool. Sellers type in Korean over AI-generated copy. Real-time suggestions create noise, add infrastructure complexity, and interfere with editing focus | Keep click-triggered: select element → click preset → get result |
| Streaming text output (typewriter effect) | Looks impressive | Breaks GrapesJS `component.set('content', ...)` — setting partial HTML mid-stream corrupts component state. GrapesJS is not designed for streaming DOM updates | Apply full result at once when complete. Show loading spinner during wait |
| Multi-element selection AI | "Rewrite all headings" button | GrapesJS multi-select is fragile; tracking which elements belong to which "type" across the component tree is complex; output is hard to review | Single element at a time. ~10 editable text elements per page is not onerous |
| AI version history / diff view | Want to compare old vs new text | Significant new infrastructure (store versions, diff UI) | GrapesJS UndoManager provides single-step revert — covers 95% of use case. Defer diff UI to future milestone |
| Image actions accessible from text element toolbar | "More AI options in one place" | `AIImageEditPanel` already exists for images and has a clear separation of concerns. Mixing image and text actions creates ambiguity | Keep image and text AI action surfaces separate — element type determines which panel appears |
| Save GrapesJS HTML back to `processedData` automatically | "Natural persistence model" | `processedData` holds `DetailPageData` JSON, not raw HTML. Overwriting it with editor HTML breaks the structured pipeline (step2 reads `draftContent` JSON) | Save editor HTML to a separate field, or use existing `PUT /api/products/:id/draft-content` with clear separation from structured JSON |
| OneShot pipeline mode | Legacy compatibility | OneShot conflates content generation + image generation into one uninterruptible task. PROJECT.md explicitly removes it. Python agent already refuses oneshot tasks | 2-step pipeline: step1 (content) + step2 (image generation). Already the production model |

---

## Feature Dependencies

```
[Draft editor entry with placeholder HTML]
    └──requires──> [routing condition: status=draft AND draftContent=null → load placeholderDetailPageData]
                       └──both constants/functions already exist in editor/page.tsx imports

["AI로 나머지 채우기" CTA in GrapesJS mode]
    └──requires──> [Draft editor entry]
    └──requires──> [step1 trigger reachable from editor]
                       └──check: does POST /api/products/:id/trigger-content-draft exist?
                       └──ImageGenerationCTA exists but only renders in structured mode

[Per-element text AI actions]
    └──requires──> [new NestJS endpoint: POST /api/ai/rewrite-text]
                       └──does NOT exist today — must be built
    └──requires──> [text element detection in component:selected handler]
                       └──partially exists: checks for img — needs text type check added

[NestJS text rewrite endpoint]
    └──requires──> [LLM client in NestJS (Gemini or OpenAI)]
                       └──check: does templates/modify endpoint exist? It is called by AIDesignChatPanel
                       └──if templates/modify missing too, both must be created in same module

[Element type detection]
    └──enhances──> [Per-element text AI: correct preset set per element type]

[Image AI edit panel]
    └──already exists: fires on img component:selected
    └──NO new work needed

[OneShot code removal]
    └──independent: cleanup pass, does not block new features
    └──Python agent already refuses oneshot — frontend/NestJS cleanup only
```

### Dependency Notes

- **Per-element text AI needs a new NestJS endpoint.** The frontend will call something like `POST /api/ai/rewrite-text` with `{ text: string, preset: string, customPrompt?: string }`. No such endpoint exists. `AIDesignChatPanel` calls `POST /api/templates/modify` which also appears to be missing from NestJS (not found in server source scan). Both may need to be created in a new NestJS `ai` module.

- **Step1 trigger from editor.** `POST /api/products/:id/trigger-image-generation` triggers step2 (image gen). The sourcing list page likely triggers step1 via a different endpoint. If step1 cannot be triggered from inside the editor, the "AI fill" CTA cannot work. Verify this endpoint exists in NestJS before designing the CTA flow.

- **OneShot removal is independent.** Can be done as a cleanup pass in parallel. Python agent already refuses oneshot tasks. Remaining work is frontend/NestJS cleanup.

- **GrapesJS floating panel pattern is established.** The existing `AIImageEditPanel` appears as `fixed bottom-4 right-[276px]` triggered by `selectedImageSrc` state. The same pattern works for text: add `selectedTextContent` + `selectedTextComponent` state, set them when a text component is selected, render `AITextEditPanel` in the same overlay zone. Applying result: `component.set('content', newHtml)` — tracked by UndoManager automatically.

---

## MVP Definition

### Launch With (v2.1 scope — items from PROJECT.md Active list)

- [ ] Draft entry into GrapesJS editor — load placeholder bold-vertical HTML when `draftContent` is null and product is `draft` status
- [ ] Placeholder HTML loads correctly (not blank canvas) — uses existing `placeholderDetailPageData` + `renderTemplateToHtml()`
- [ ] "AI로 나머지 채우기" CTA accessible from GrapesJS mode — not just structured mode
- [ ] Per-element text AI actions: 다시쓰기 / 번역 / 축약 — triggered by selecting a text element in GrapesJS
- [ ] Per-element image AI actions — ALREADY DONE (no new work)
- [ ] OneShot pipeline code removal — cleanup pass

### Add After Validation (v2.x)

- [ ] Context-aware presets (different presets for h1 vs p) — trigger: sellers report rewrite options not relevant to selected element
- [ ] Preview-before-accept UI for text rewrite — trigger: undo usage data shows frequent AI text reversion
- [ ] "AI fill" granularity (fill only empty vs fill all) — trigger: sellers have partially filled pages and want to protect manual edits

### Future Consideration (v3+)

- [ ] AI layout/section reorder suggestions — significant GrapesJS component tree manipulation
- [ ] Multi-template support with AI layout chooser — new templates out of scope for v2.x
- [ ] Collaborative editing with AI change attribution — requires real-time infrastructure (WebSocket/SSE)

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Draft entry into GrapesJS | HIGH | LOW | P1 |
| Placeholder HTML on open | HIGH | LOW | P1 |
| "AI로 나머지 채우기" in GrapesJS mode | HIGH | LOW–MEDIUM | P1 |
| New NestJS AI text rewrite endpoint | HIGH (blocks per-element text) | MEDIUM | P1 |
| Per-element text AI actions panel | HIGH | MEDIUM | P1 |
| OneShot code removal | MEDIUM (reduces confusion) | LOW | P1 |
| Context-aware presets by element type | MEDIUM | LOW | P2 |
| Preview-before-accept for text rewrite | MEDIUM | MEDIUM | P2 |

**Priority key:**
- P1: Must have for v2.1 launch
- P2: Add when core is validated (v2.x)
- P3: Future milestone

---

## Implementation Notes by Feature

### Draft Entry + Placeholder HTML

**Current gap:** `editor/page.tsx` initializes with `previewData = null` and calls `GET /api/products/:id/preview`. If `preview.template === null` it now sets `placeholderDetailPageData` and mode to `grapes`. This handling already exists (line 101–108 of `editor/page.tsx`). The remaining gap may only be navigation — verify the sourcing list page links to `/sourcing/[id]/editor` for `draft` status products (currently may link to `/sourcing/[id]` detail only).

**Risk:** LOW. Logic already partially present. May be a one-line navigation change.

### "AI로 나머지 채우기" CTA in GrapesJS Mode

**Current gap:** `ImageGenerationCTA` renders only inside the `if (mode === 'structured')` block. GrapesJS mode has no AI trigger.

**Fix:** Add a floating CTA overlay to the GrapesJS canvas area. Show when `draftContent` is null (not yet AI-generated). Button text: "AI로 채우기". On click: trigger step1 pipeline, then poll until complete, then reload canvas with generated content.

**Step1 trigger:** Must verify `POST /api/products/:id/trigger-content-draft` exists. If it doesn't, it must be added to `products.controller.ts` + `products.service.ts` (analogous to the existing `trigger-image-generation` endpoint).

### Per-Element Text AI Actions

**Detection:** In `handleEditorInit`, extend the `component:selected` handler:
- Currently: checks `component.get('type') === 'image' || component.get('tagName') === 'img'`
- Add: check for text types — tagName in `['h1','h2','h3','h4','p','span','li','td','div']` and `component.get('type')` is `text` or component has non-empty `getInnerHTML()` result

**Extraction:** `component.getInnerHTML()` gives the selected element's HTML content including markup. Strip HTML tags for the LLM prompt, send clean text.

**Apply result:** `component.set('content', result.text)` — GrapesJS UndoManager tracks this automatically.

**Floating panel:** New component `AITextEditPanel` — mirrors `AIImageEditPanel` structure. Presets:
- 다시쓰기 (rewrite in Korean marketing tone)
- 번역 (translate Chinese → Korean)
- 축약 (shorten)
- 확장 (expand, P2)
- 직접 입력 (custom prompt, collapsible section)

**Positioning:** Fixed overlay, same zone as `AIImageEditPanel` (`fixed bottom-4 right-[276px]`). Only one panel shows at a time — text or image, not both.

**NestJS endpoint:** `POST /api/ai/rewrite-text` with body `{ text: string, preset: 'rewrite' | 'translate' | 'shorten' | 'custom', customPrompt?: string }`. Returns `{ text: string }`. New NestJS module `ai` (or extend existing products module).

### OneShot Code Removal

Search for: `oneshot`, `one_shot`, `generation_mode: 'oneshot'` in:
- `apps/server/src/` — any route, service, or executor referencing oneshot
- `apps/web/src/` — any UI element showing oneshot option
- Python agent already cleaned up per PROJECT.md context

---

## Competitor Feature Analysis

| Feature | Figma AI text | Framer AI text | Our Approach |
|---------|--------------|----------------|--------------|
| Trigger | Select layer → Actions → "Rewrite this" | Select text → inline toolbar | Select text element in GrapesJS → floating action bar |
| Preset actions | Custom prompt only | Rewrite, Translate, AI Style | Rewrite, Translate, Shorten + Korean-specific presets |
| Preview before accept | No — replaces in place, undo available | No — replaces in place | Same: replace in place, rely on GrapesJS UndoManager (50-step) |
| Bulk AI fill | No | No | "AI로 나머지 채우기" — our differentiator |
| Image AI | No built-in | No built-in | FAL.AI via `AIImageEditPanel` — already shipped |
| Domain presets | English-generic | English-generic | Korean e-commerce specific (마케팅 문체, 번역 중→한) |

---

## Sources

- Codebase audit: `apps/web/src/components/editor/DetailPageEditor.tsx` (lines 1047–1055 for selection handler, 1218–1226 for AIImageEditPanel positioning) — HIGH confidence, verified directly
- Codebase audit: `apps/web/src/components/editor/AIImageEditPanel.tsx`, `AIDesignChatPanel.tsx` — floating panel and API call patterns — HIGH confidence
- Codebase audit: `apps/web/src/app/sourcing/[id]/editor/page.tsx` (lines 101–108 for placeholder routing, lines 265–280 for CTA placement) — HIGH confidence
- Codebase audit: `agents/src/agents/content/models.py`, `template_pipeline.py` — Korean copy structure verified — HIGH confidence
- [Figma AI text rewrite docs](https://help.figma.com/hc/en-us/articles/24004868368919-Rewrite-translate-and-shorten-text-with-AI) — select → Actions → rewrite, replace in place, rely on undo — MEDIUM confidence, official docs
- [Shape of AI — Inline Action pattern](https://www.shapeof.ai/patterns/inline-action) — selection-triggered, granular scoping, preview-before-commit — MEDIUM confidence, UX research
- [GrapesJS component toolbar discussion](https://github.com/GrapesJS/grapesjs/discussions/3914) — no native per-component toolbar button API; use external overlay reacting to selection events — HIGH confidence, official repo maintainer response
- WebSearch: WYSIWYG AI text patterns 2025 — consistent findings across Froala, Framer, Figma: preset-based actions, selection-triggered, in-place replacement + undo — MEDIUM confidence aggregate

---

*Feature research for: KidItem v2.1 — WYSIWYG editor + per-element AI actions*
*Researched: 2026-03-26*
