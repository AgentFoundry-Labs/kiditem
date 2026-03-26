# Phase 5: Per-Element Text AI - Research

**Researched:** 2026-03-26
**Domain:** GrapesJS Canvas Spots API, NestJS text AI endpoint (Gemini), UndoManager atomic steps, isBusy guard
**Confidence:** HIGH

## Summary

Phase 5 introduces a floating AI action panel that appears when a text element is selected in the GrapesJS canvas. The panel provides three presets (다시쓰기/번역/축약) plus a free prompt input, calls a new NestJS endpoint that invokes Gemini, and applies results directly to the canvas with a single-step Undo.

The two primary technical surfaces are: (1) front-end panel positioning via GrapesJS Canvas Spots API, and (2) a new NestJS `TextAiModule` that calls Gemini directly (same pattern as `ai-analyze.ts`). No new npm packages are required on either side. The `isBusy` ref lives in `DetailPageEditor` and is passed down to all AI panels, making it the shared concurrency guard for Phases 5, 6, and 7.

The most important pre-existing pattern to follow is `AIImageEditPanel`: same preset-button layout, same error-timeout pattern (4 s), same `Loader2` spinner. The key difference is output: image AI replaces an `src` attribute, text AI replaces component inner HTML. For text the atomic Undo step is achieved with `um.stop()` → mutate → `um.start()` wrapping only the mutation itself, matching the existing pattern used during initial load in `handleEditorInit`.

**Primary recommendation:** Build `AITextEditPanel` modeled on `AIImageEditPanel`, position it with Canvas Spots API (render React into `getSpotsEl()` via `createPortal`), create `TextAiModule` in NestJS with a single `POST /api/text-ai/transform` endpoint, and implement the `isBusy` ref in `DetailPageEditor` shared across all AI panels.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** 번역은 중국어→한국어 전용. 1688 수집 상품의 중국어 텍스트를 한국어로 번역하는 단일 방향.
- **D-02:** 다시쓰기는 이커머스 상세페이지 카피 특화. 구매 유도, 핵심 강조, 자연스러운 한국어. 톤 선택 UI 없이 단일 스타일.
- **D-03:** 축약은 핵심만 남기기 방식. ~50% 내외로 AI가 핵심 내용만 남김. 글자수 지정 없음.
- **D-04:** 3개 프리셋(다시쓰기/번역/축약) + 자유 입력 지원. 패널 하단에 텍스트 입력란 추가. AIImageEditPanel의 custom preset과 유사한 패턴.
- **D-05:** Canvas Spots API로 선택된 텍스트 요소 바로 아래에 플로팅 패널 표시. Notion AI 스타일. 스크롤 시 요소와 함께 이동. 다른 요소 클릭 시 사라짐.
- **D-06:** AI 결과를 캔버스에 즉시 적용. 미리보기 단계 없음. 마음에 안 들면 Cmd+Z(Undo)로 원래 텍스트로 되돌리기. GrapesJS UndoManager 활용, 단일 Undo 스텝.

### Claude's Discretion

- NestJS 텍스트 AI 엔드포인트 설계 (요청/응답 스키마, Gemini 호출 방식)
- Canvas Spots API 구체적 구현 (spot type, positioning options)
- isBusy ref 구현 패턴 (useRef vs context vs global)
- 로딩/에러 UI 세부 디자인
- 패널 크기 및 반응형 동작

### Deferred Ideas (OUT OF SCOPE)

- **전체 가공 워크플로우 세부 설계** — 사용자가 컴포넌트에 이미지/텍스트를 배치한 뒤 "AI로 나머지 채우기"로 빈 필드만 일괄 생성하는 흐름. Phase 7 discuss에서 논의 예정.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AI-01 | 텍스트 요소 선택 시 AI 액션 패널이 나타나고 다시쓰기/번역/축약이 동작한다 | Canvas Spots API `addSpot({type:'ai-text', component})` + `getSpotsEl()` + React `createPortal` for panel; NestJS `POST /api/text-ai/transform` with Gemini; `component:selected` text type detection; component `getInnerHTML()` + `replaceWith()` |
| AI-03 | AI 액션 중 로딩 상태 표시 + 에러 피드백 + Undo 지원 | `useState(loading/error)` in `AITextEditPanel` mirroring `AIImageEditPanel` pattern; `um.stop()` → mutate → `um.start()` for single undo step; `isBusy` ref in `DetailPageEditor` passed to all AI panels |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `grapesjs` | 0.22.14 | Canvas Spots API, UndoManager, component selection events | Already installed; Canvas Spots API available in this version (confirmed in `index.d.ts`) |
| `@grapesjs/react` | 2.0.0 | `useEditor()` hook to access editor instance inside `WithEditor` children | Already installed; all editor infrastructure uses this |
| `react` | ^18 | `createPortal` to render `AITextEditPanel` into `getSpotsEl()` element | Already installed |
| `lucide-react` | ^0.577.0 | Icons for preset buttons (Wand2, Languages, AlignLeft, Send) | Already installed; same as `AIImageEditPanel` |

### No New Libraries Required
All Phase 5 work uses the existing stack. No new npm installs needed.

### Installation
```bash
# No new packages — all dependencies already installed
```

## Architecture Patterns

### Recommended File Structure
```
apps/web/src/components/editor/
├── AITextEditPanel.tsx          (NEW — text AI floating panel)
├── AIImageEditPanel.tsx         (existing — reference pattern)
├── DetailPageEditor.tsx         (MODIFIED — add text selection, isBusy ref, spot management)
└── AIDesignChatPanel.tsx        (existing — no change)

apps/server/src/
└── text-ai/                     (NEW — NestJS domain module)
    ├── text-ai.module.ts
    ├── text-ai.controller.ts
    └── text-ai.service.ts
```

### Pattern 1: Text Component Detection in component:selected

**What:** Extend the existing `component:selected` handler in `handleEditorInit` to detect text-type components in addition to image-type.

**When to use:** Any time a GrapesJS component is selected.

**Text component detection logic:**
```typescript
// Source: GrapesJS index.d.ts — component.get('type'), isTextable(), tagName
editor.on('component:selected', (component) => {
  const type = component.get('type');
  const tagName = component.get('tagName') as string;
  const TEXT_TAGS = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'li', 'td', 'th'];

  if (type === 'image' || tagName === 'img') {
    setSelectedImageSrc(component.getAttributes().src ?? '');
    setSelectedTextComponent(null);
  } else if (
    type === 'text' ||
    type === 'text-ext' ||
    component.isTextable() ||
    TEXT_TAGS.includes(tagName?.toLowerCase())
  ) {
    setSelectedTextComponent(component);
    setSelectedImageSrc(null);
  } else {
    setSelectedImageSrc(null);
    setSelectedTextComponent(null);
  }
});
editor.on('component:deselected', () => {
  setSelectedImageSrc(null);
  setSelectedTextComponent(null);
});
```

**Key note:** GrapesJS Component type `'text'` covers most standard text elements. `isTextable()` is a secondary check for container elements that allow text input. Using `tagName` as a fallback covers elements that were added as raw HTML (common in bold-vertical template).

### Pattern 2: Canvas Spots API for Floating Panel

**What:** Use `editor.Canvas.addSpot()` and `editor.Canvas.getSpotsEl()` to position the `AITextEditPanel` relative to the selected component. The spots container is an overlay on the canvas that auto-updates position on scroll.

**Confirmed API (from GrapesJS 0.22.14 `index.d.ts`):**
```typescript
// addSpot — attaches spot to a component for auto-positioning
const spot = editor.Canvas.addSpot({
  type: 'ai-text-panel',   // custom type string
  component: selectedComponent,
});

// Get the spot's CSS position (top/left/width/height in px)
const style = spot.getStyle();
// Returns: Partial<CSSStyleDeclaration> with top, left, width, height

// getSpotsEl() — the DOM overlay element above the canvas iframe
const spotsEl = editor.Canvas.getSpotsEl();

// removeSpots — clean up on deselect
editor.Canvas.removeSpots({ type: 'ai-text-panel' });
```

**Critical constraint:** The spots container has `pointer-events: none` by default. The panel div MUST set `pointer-events: auto` to receive clicks.

**React rendering approach using createPortal:**
```typescript
// Source: React docs + GrapesJS getSpotsEl() from index.d.ts line 5419
import { createPortal } from 'react-dom';

// Inside WithEditor child component:
const editor = useEditor();
const [spotStyle, setSpotStyle] = useState<Partial<CSSStyleDeclaration> | null>(null);
const spotRef = useRef<ReturnType<typeof editor.Canvas.addSpot> | null>(null);

useEffect(() => {
  if (!selectedTextComponent) {
    editor.Canvas.removeSpots({ type: 'ai-text-panel' });
    setSpotStyle(null);
    spotRef.current = null;
    return;
  }

  const spot = editor.Canvas.addSpot({
    type: 'ai-text-panel',
    component: selectedTextComponent,
  });
  spotRef.current = spot;

  // Update style when spot changes (canvas:spot event fires on scroll/resize)
  const updateStyle = () => setSpotStyle(spot.getStyle());
  updateStyle(); // initial position
  editor.on('canvas:spot', updateStyle);
  return () => {
    editor.off('canvas:spot', updateStyle);
    editor.Canvas.removeSpots({ type: 'ai-text-panel' });
    setSpotStyle(null);
  };
}, [editor, selectedTextComponent]);

// Render panel into spotsEl
const spotsEl = editor.Canvas.getSpotsEl();
if (!spotStyle || !spotsEl) return null;

return createPortal(
  <div
    style={{
      ...spotStyle,
      position: 'absolute',
      top: `calc(${spotStyle.top} + ${spotStyle.height})`,  // below component
      left: spotStyle.left,
      pointerEvents: 'auto',
      zIndex: 10,
    }}
  >
    <AITextEditPanel ... />
  </div>,
  spotsEl,
);
```

**Important:** `spot.getStyle()` returns absolute pixel positions (`top`, `left`, `width`, `height`) relative to the spots container. To position the panel *below* the component, add `height` to `top`.

### Pattern 3: Atomic Undo Step for Text Replacement

**What:** Wrap the component text mutation in `um.stop()` / `um.start()` to ensure a single undo step. This is the same pattern already used in `handleEditorInit` during initial load.

**Confirmed API (from GrapesJS 0.22.14 `index.d.ts` line 13200):**
```typescript
// Source: GrapesJS UndoManager — stop()/start() pattern
const applyTextResult = (component: Component, newText: string) => {
  const um = editor.UndoManager;
  um.stop();                              // pause tracking
  component.set('content', newText);      // for plain text components
  // OR for HTML-containing components:
  // component.components().reset();
  // component.append(newText);
  um.start();                             // resume tracking — one undo entry created
};
```

**Text mutation method selection:**
- If component type is `'text'` and has no child components: use `component.set('content', newText)`
- If component has child elements (e.g., a `<p>` with nested `<strong>`): use `component.getInnerHTML()` to read, `component.replaceWith('<tag>' + newText + '</tag>')` or set `components` to replace
- Simplest universal approach: read with `component.getInnerHTML()`, write with `component.set({ content: newText })` — GrapesJS will re-parse the string

**Recommended approach for Phase 5:** Use `component.set('content', newText)` wrapped in `um.stop()`/`um.start()`. For components containing HTML tags in the new text, GrapesJS parses the string. This is the simplest approach that works for all text component subtypes.

### Pattern 4: NestJS Text AI Endpoint

**What:** New `TextAiModule` at `POST /api/text-ai/transform`. Calls Gemini API directly using the same fetch pattern as `ai-analyze.ts`. No new NestJS packages needed.

**When to use:** Any preset or custom prompt requiring Gemini text generation.

**Endpoint schema:**
```typescript
// Request body
interface TransformTextDto {
  text: string;                             // source text from component.getInnerHTML()
  preset: 'rewrite' | 'translate' | 'shorten' | 'custom';
  custom_prompt?: string;                   // required when preset === 'custom'
}

// Response
interface TransformTextResult {
  result: string;                           // transformed text (plain text, not HTML)
}
```

**NestJS service Gemini call (same pattern as `apps/server/src/workflows/executors/ai-analyze.ts`):**
```typescript
// Source: ai-analyze.ts lines 4-6, 65-84 — verified direct Gemini call pattern
const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? '';
const GEMINI_MODEL = process.env.AI_TEXT_MODEL ?? 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

async transform(dto: TransformTextDto): Promise<{ result: string }> {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY가 설정되지 않았습니다.');
  }

  const systemPrompt = this.buildSystemPrompt(dto.preset, dto.custom_prompt);
  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: dto.text }] }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: { temperature: 0.7 },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini API 오류: ${res.status} ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const result = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  return { result: result.trim() };
}
```

**Preset system prompts (per D-01, D-02, D-03):**
```typescript
private buildSystemPrompt(preset: string, customPrompt?: string): string {
  const prompts: Record<string, string> = {
    rewrite:
      '당신은 이커머스 상세페이지 카피라이터입니다. 입력된 텍스트를 구매 유도와 핵심 강조에 최적화된 자연스러운 한국어로 다시 작성하세요. 원문 의미를 유지하되 더 설득력 있게 표현하세요. 텍스트만 출력하고 다른 내용은 포함하지 마세요.',
    translate:
      '당신은 중국어-한국어 번역가입니다. 입력된 중국어 텍스트를 이커머스 상세페이지에 적합한 자연스러운 한국어로 번역하세요. 번역된 텍스트만 출력하고 다른 내용은 포함하지 마세요.',
    shorten:
      '입력된 텍스트의 핵심 내용만 남기고 약 50% 분량으로 줄이세요. 중요하지 않은 수식어와 반복 표현을 제거하세요. 결과 텍스트만 출력하고 다른 내용은 포함하지 마세요.',
    custom: customPrompt ?? '텍스트를 개선하세요.',
  };
  return prompts[preset] ?? prompts.custom;
}
```

### Pattern 5: isBusy Guard

**What:** A `useRef<boolean>` in `DetailPageEditor` (the outer component, not inside `WithEditor`) that prevents concurrent AI actions across text panel, image panel, and the upcoming AI Fill CTA.

**Why `useRef` not `useState`:** `isBusy` controls action-start gating. It does not need to trigger re-renders — only reading its current value before starting an action. `useRef` avoids stale closure problems in async callbacks.

**Recommended implementation:**
```typescript
// In DetailPageEditor (outer component, same scope as selectedImageSrc)
const isBusyRef = useRef(false);

// Pass to panels that need it
<AITextEditPanel
  ...
  isBusy={isBusyRef}
/>
<AIImageEditPanel
  ...
  isBusy={isBusyRef}  // Phase 6 addition — Phase 5 passes it to text panel only
/>

// Inside AITextEditPanel
const handlePresetClick = useCallback(async (preset) => {
  if (isBusy.current) return;        // guard check
  isBusy.current = true;
  setLoading(true);
  try {
    // ... AI call ...
  } finally {
    isBusy.current = false;
    setLoading(false);
  }
}, [isBusy, ...]);
```

### Anti-Patterns to Avoid

- **Floating panel as `fixed` div:** `AIImageEditPanel` uses `fixed bottom-4 right-[276px]` (a shortcut). `AITextEditPanel` MUST use Canvas Spots API as decided in D-05. Fixed positioning does not scroll with the canvas content.
- **Multiple `um.stop()` without matching `um.start()`:** If an error is thrown between stop and start, undo tracking stays disabled permanently. Always use try/finally to guarantee `um.start()` is called.
- **Calling `component.set('content')` directly without UndoManager wrap:** The change is still recorded but as multiple micro-entries, making Undo unpredictable.
- **Setting `selectedTextComponent` to the component model directly in state:** GrapesJS component models are mutable Backbone objects. Storing them in React state works but requires careful handling — do not mutate in render.
- **Using GrapesJS built-in spot types for the panel:** Built-in `'select'` type already exists and controls the selection outline. Use a custom type string `'ai-text-panel'` to avoid conflicts.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Panel positioning relative to canvas element | Custom cross-iframe coordinate math | `editor.Canvas.addSpot({ component })` + `spot.getStyle()` | Canvas spots auto-update on scroll, resize, and frame refresh |
| Undo/redo history | Custom history stack | `editor.UndoManager.stop()` / `um.start()` | Already configured with `maximumStackLength: 50` |
| AI text generation | Custom prompt building | Gemini API via `fetch()` (same as `ai-analyze.ts`) | Pattern already established in codebase |
| Concurrent action guard | Complex state machine | `useRef<boolean>` (`isBusy`) | Simple, shared via prop, zero re-render cost |

**Key insight:** The hardest part of this phase is correct Canvas Spots positioning. Don't attempt to calculate element positions manually by reading bounding rects from the iframe — GrapesJS Canvas Spots handles all coordinate transforms across zoom, scroll, and device changes.

## Common Pitfalls

### Pitfall 1: `pointer-events: none` on Spots Container
**What goes wrong:** Clicks on the `AITextEditPanel` are intercepted by the spots overlay (which has `pointer-events: none`), making buttons unresponsive.
**Why it happens:** GrapesJS sets `pointer-events: none` on the entire spots container so spots don't block canvas interactions by default.
**How to avoid:** Set `style={{ pointerEvents: 'auto' }}` on the panel wrapper div rendered inside the portal.
**Warning signs:** Panel renders visually but buttons don't respond to clicks.

### Pitfall 2: Spot Position Not Updating on Canvas Scroll
**What goes wrong:** The panel stays at its initial position when the user scrolls the canvas iframe.
**Why it happens:** If you only call `spot.getStyle()` once and store it in state, it doesn't update as scroll/zoom changes.
**How to avoid:** Subscribe to `editor.on('canvas:spot', updateStyle)` to re-call `spot.getStyle()` whenever spots are refreshed (event fires on scroll, resize, component move).
**Warning signs:** Panel drifts away from its target element after scrolling.

### Pitfall 3: `component:selected` Fires for Non-Text Text-Like Elements
**What goes wrong:** The AI panel appears when clicking on a `<div>` container that happens to be `isTextable()` (e.g., the wrapper div of a block).
**Why it happens:** `isTextable()` returns true for any component that allows text children, including container divs in the bold-vertical template.
**How to avoid:** Require BOTH `isTextable()` AND either `type === 'text'` or the element being a leaf-level tag (`p`, `h1`–`h6`, `span`). Use the `TEXT_TAGS` allowlist as the primary filter.
**Warning signs:** Panel appears on container click, not just text element click.

### Pitfall 4: UndoManager Tracking Paused Permanently on Error
**What goes wrong:** If `component.set('content', ...)` throws (e.g., component was removed during AI call), `um.start()` is never called and all subsequent edits are not undoable.
**Why it happens:** Exception escapes the `um.stop()` / mutate / `um.start()` block before `um.start()` fires.
**How to avoid:** Always wrap the mutation in try/finally:
```typescript
um.stop();
try { component.set('content', newText); }
finally { um.start(); }
```
**Warning signs:** Cmd+Z stops working after an AI action that produced an error.

### Pitfall 5: `selectedTextComponent` State Becomes Stale After Canvas Refresh
**What goes wrong:** After applying AI text, the stored component reference still points to the old component state; `component.getInnerHTML()` returns the new text unexpectedly on next call.
**Why it happens:** GrapesJS component models are mutable objects. React state holds a reference, not a snapshot.
**How to avoid:** After `onEditComplete` is called, clear `selectedTextComponent` (same as `setSelectedImageSrc(null)` after image edit). Let the user re-select if needed.
**Warning signs:** Running two back-to-back AI operations on the same element without re-selecting produces unexpected results.

### Pitfall 6: NestJS Service Reads GEMINI_API_KEY at Module Load Time
**What goes wrong:** `GEMINI_API_KEY` is `undefined` if the service uses a module-level constant (as in `ai-analyze.ts`) and the Docker container starts before the env var is set.
**Why it happens:** Module-level `const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? ''` is evaluated at startup.
**How to avoid:** Read `process.env.GEMINI_API_KEY` inside the service method (not at module level), or throw a clear error when it's missing — do NOT silently return empty string.
**Warning signs:** All requests return 500 "GEMINI_API_KEY not set" after Docker restart.

## Code Examples

Verified patterns from existing codebase:

### Text Component Detection (extends existing handleEditorInit pattern)
```typescript
// Source: DetailPageEditor.tsx lines 1058-1066 — existing image detection pattern
// Extended with text detection
editor.on('component:selected', (component) => {
  const type = component.get('type') as string;
  const tagName = (component.get('tagName') as string ?? '').toLowerCase();
  const TEXT_TAGS = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'li'];

  if (type === 'image' || tagName === 'img') {
    setSelectedImageSrc(component.getAttributes().src ?? '');
    setSelectedTextComponent(null);
  } else if (type === 'text' || type === 'text-ext' || TEXT_TAGS.includes(tagName)) {
    setSelectedTextComponent(component);
    setSelectedImageSrc(null);
  } else {
    setSelectedImageSrc(null);
    setSelectedTextComponent(null);
  }
});
editor.on('component:deselected', () => {
  setSelectedImageSrc(null);
  setSelectedTextComponent(null);
});
```

### Atomic Undo Step (matches existing handleEditorInit pattern)
```typescript
// Source: DetailPageEditor.tsx lines 1068-1072 — um.stop()/start() pattern
const applyTextToComponent = (component: Component, newText: string) => {
  const um = editorRef!.UndoManager;
  um.stop();
  try {
    component.set('content', newText);
  } finally {
    um.start();
  }
};
```

### Canvas Spot + React Portal (new pattern for this phase)
```typescript
// Source: GrapesJS index.d.ts lines 5419, 5731 — addSpot, getSpotsEl
import { createPortal } from 'react-dom';
import { useEditor } from '@grapesjs/react';

// Inside a WithEditor child (has access to useEditor())
function AITextSpot({ component, ... }: { component: Component | null; ... }) {
  const editor = useEditor();
  const [spotStyle, setSpotStyle] = useState<Partial<CSSStyleDeclaration> | null>(null);

  useEffect(() => {
    if (!component) { setSpotStyle(null); return; }

    const spot = editor.Canvas.addSpot({ type: 'ai-text-panel', component });
    const update = () => setSpotStyle(spot.getStyle());
    update();
    editor.on('canvas:spot', update);
    return () => {
      editor.off('canvas:spot', update);
      editor.Canvas.removeSpots({ type: 'ai-text-panel' });
      setSpotStyle(null);
    };
  }, [editor, component]);

  const spotsEl = editor.Canvas.getSpotsEl();
  if (!spotStyle || !spotsEl) return null;

  // Position panel below the selected element
  const panelStyle: React.CSSProperties = {
    position: 'absolute',
    top: `calc(${spotStyle.top} + ${spotStyle.height})`,
    left: spotStyle.left,
    zIndex: 10,
    pointerEvents: 'auto',
  };

  return createPortal(
    <div style={panelStyle}>
      <AITextEditPanel ... />
    </div>,
    spotsEl,
  );
}
```

### NestJS Endpoint — Full Module Pattern
```typescript
// Source: apps/server/src/sourcing/sourcing.module.ts — module pattern
// apps/server/src/workflows/executors/ai-analyze.ts — Gemini call pattern

// text-ai.module.ts
@Module({ controllers: [TextAiController], providers: [TextAiService] })
export class TextAiModule {}

// text-ai.controller.ts
@Controller('text-ai')
export class TextAiController {
  constructor(private readonly textAiService: TextAiService) {}

  @Post('transform')
  async transform(@Body() body: { text: string; preset: string; custom_prompt?: string }) {
    return this.textAiService.transform(body);
  }
}

// Register in app.module.ts
import { TextAiModule } from './text-ai/text-ai.module';
// Add TextAiModule to @Module({ imports: [..., TextAiModule] })
```

### Frontend API Call
```typescript
// Source: AIImageEditPanel.tsx lines 56-70 — fetch pattern
async function transformText(params: {
  text: string;
  preset: 'rewrite' | 'translate' | 'shorten' | 'custom';
  custom_prompt?: string;
}): Promise<{ result: string }> {
  const res = await fetch(`${API_BASE}/api/text-ai/transform`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${await res.text()}`);
  }
  return res.json();
}
```

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| NestJS server | `POST /api/text-ai/transform` | Running at localhost:4000 | confirmed | — |
| `GEMINI_API_KEY` env var | Text AI Gemini calls | Set in agents/.env (confirmed pattern), needs to be set in server env too | see note | 500 error with clear message |
| `AI_TEXT_MODEL` env var | Gemini model selection | Defaults to `gemini-2.5-flash` if not set | gemini-2.5-flash | — |
| Node.js | Build | 25.8.1 | 25.8.1 | — |
| Docker | NestJS server container | 29.2.1 | 29.2.1 | — |

**Note on GEMINI_API_KEY in NestJS server:** The agents `.env.example` has `GEMINI_API_KEY`. The server `.env.example` does NOT include it. The service MUST read `process.env.GEMINI_API_KEY` at call time and return a clear 400/500 if missing, matching the approach in `ai-analyze.ts` line 23-24. The planner should add a task to verify/document that `GEMINI_API_KEY` is present in `apps/server/.env` (Docker env), since the server container needs it.

**Missing dependencies with no fallback:**
- `GEMINI_API_KEY` in server Docker env — plan must include a verification/setup task

**Missing dependencies with fallback:**
- None

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Fixed positioned AI panel (`fixed bottom-4 right-[276px]`) | Canvas Spots API with `createPortal` | Phase 5 (new) | Panel moves with element on scroll |
| No text AI | Gemini via NestJS endpoint | Phase 5 (new) | Preset text transformation in editor |
| Per-panel loading state only | `isBusy` ref shared across all panels | Phase 5 (introduce), 6-7 (extend) | Prevents concurrent AI ops |

**Deprecated/outdated:**
- Fixed positioning for AI panels (AIImageEditPanel's `fixed bottom-4 right-[276px]` is a stopgap — Phase 6 should migrate it to Canvas Spots too, but that is out of scope for Phase 5).

## Open Questions

1. **`component.set('content', newText)` vs `component.getInnerHTML()` + HTML-preserving update**
   - What we know: `component.set('content', str)` works for plain text and GrapesJS re-parses HTML strings. The bold-vertical template text elements are standard `<p>`, `<h1>`, `<h2>` elements.
   - What's unclear: If a component contains nested HTML (e.g., `<strong>text</strong>`), does `set('content', 'plain text')` correctly replace it, or does it break nesting?
   - Recommendation: Test with a component that has `<strong>` children. If `set('content')` doesn't work cleanly, use `component.components().reset([{ type: 'textnode', content: newText }])` as fallback.

2. **Spot position when canvas is zoomed**
   - What we know: `spot.getStyle()` is documented to return CSS positioning. Canvas zoom is applied via CSS `zoom` on the iframe document (from `applyContentZoom()`).
   - What's unclear: Whether `spot.getStyle()` accounts for the CSS zoom applied to the iframe document in this implementation, or if additional math is needed.
   - Recommendation: Test panel position at 50% and 150% zoom during implementation. If misaligned, apply the inverse zoom factor to `top`/`left` values.

3. **`getSpotsEl()` availability timing**
   - What we know: `getSpotsEl()` returns `HTMLElement | undefined` per the type definition.
   - What's unclear: Whether it returns `undefined` before the canvas is fully initialized.
   - Recommendation: Guard with `if (!spotsEl) return null` in the render path (already included in the code example above). This is safe.

## Sources

### Primary (HIGH confidence)
- `/Users/yhc125/workspace/kiditem/node_modules/grapesjs/dist/index.d.ts` lines 5066-5788 — CanvasSpot types, addSpot, removeSpots, getSpotsEl, getStyle, UndoManager
- `apps/web/src/components/editor/DetailPageEditor.tsx` — existing component selection, UndoManager usage, AIImageEditPanel integration pattern
- `apps/web/src/components/editor/AIImageEditPanel.tsx` — complete preset panel pattern with loading/error/custom
- `apps/server/src/workflows/executors/ai-analyze.ts` — established Gemini API call pattern in NestJS
- `apps/server/src/app.module.ts` — module registration pattern
- `apps/server/src/sourcing/sourcing.module.ts` — self-contained domain module pattern

### Secondary (MEDIUM confidence)
- GrapesJS Canvas Spots documentation (https://grapesjs.com/docs/modules/Canvas.html#canvas-spots) — verified that pointer-events constraint and `getSpotsEl()` usage pattern
- React `createPortal` documentation — standard React API for rendering into DOM nodes outside component tree

### Tertiary (LOW confidence)
- None — all critical claims verified from source code or official type definitions

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries verified from node_modules
- Canvas Spots API: HIGH — types verified from `grapesjs/dist/index.d.ts`; pointer-events constraint verified from docs
- NestJS pattern: HIGH — verified from `ai-analyze.ts` and `sourcing.module.ts`
- Text component detection: MEDIUM — `type === 'text'` and `isTextable()` verified from types; tagName-based fallback is inferred from existing image detection pattern
- isBusy ref pattern: HIGH — `useRef` for cross-render mutable ref is React standard
- Spot + zoom interaction: LOW — untested; flagged as open question

**Research date:** 2026-03-26
**Valid until:** 2026-04-26 (GrapesJS 0.22.14 is stable; API unlikely to change)
