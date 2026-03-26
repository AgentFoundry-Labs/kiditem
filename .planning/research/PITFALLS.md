# Pitfalls Research

**Domain:** GrapesJS WYSIWYG editor + per-element AI actions (v2.1 milestone)
**Researched:** 2026-03-26
**Confidence:** HIGH (direct codebase inspection + verified against GrapesJS GitHub issues and community patterns)

---

## Critical Pitfalls

### Pitfall 1: GrapesJS Internal State Goes Stale After AI HTML Replacement

**What goes wrong:**
When AI rewrites page HTML and you call `editor.setComponents(newHtml)` or `editor.loadProjectData()` to apply the result, GrapesJS wipes its internal component tree and rebuilds from scratch. Any `useRef` or `useState` in React components that held editor-derived values (selected component ID, previously extracted HTML string, undo stack snapshot) are now pointing at dead references. Subsequent calls to `editor.getSelected()` return `undefined`, undo history may be partially cleared or duplicated, and the component tree shown in the Layers panel diverges from what is visible in the canvas iframe.

**Why it happens:**
The existing `AIDesignChatPanel` calls `onApply(result.html)` which reaches `editor.setComponents()` inside `DetailPageEditor`. `setComponents` creates new component model instances. Any pointer to the old component objects — including closure captures inside event listeners or React state — becomes invalid. The React wrapper `@grapesjs/react` does not re-emit `component:selected` automatically after a `setComponents` call, so the toolbar state (canUndo, hasSelection) becomes stale.

**How to avoid:**
After any programmatic HTML replacement:
1. Call `editor.UndoManager.clear()` then `editor.UndoManager.start()` so history starts from the newly applied content.
2. Re-emit `editor.select(null)` to force deselection events and reset toolbar state.
3. Use GrapesJS project data format (`editor.loadProjectData()`) instead of raw HTML (`setComponents()`) when replacing large sections — project data preserves styles without collision.
4. For per-element text rewrite (not full-page replace), use `component.set('content', newText)` or `component.components().reset(...)` on the specific component model — never call `setComponents()` for a single-element update.

**Warning signs:**
- `editor.getSelected()` returns `undefined` immediately after `onApply` callback fires
- Undo button enabled count is wrong (shows 0 or inflated number) after AI apply
- Layers panel shows duplicate elements or empty tree after AI response

**Phase to address:**
Phase 1 (GrapesJS editor base + draft load) — Define the apply/replace strategy at the outset. Changing it later breaks undo history for all users.

---

### Pitfall 2: Per-Element AI Action Panel Loses Track of Its Target Component

**What goes wrong:**
A floating AI action panel appears when a GrapesJS component is selected. The user clicks a text AI action (e.g., "번역"), the API call is in flight (3–8 seconds), and during that time the user clicks somewhere else in the editor. GrapesJS fires `component:deselected` and possibly `component:selected` for a different element. When the API response arrives, the callback still holds a stale closure reference to the original component. Calling `staleComponent.set('content', result)` on the deselected component silently succeeds in GrapesJS's model but produces no visible effect (or worse, updates the wrong component).

**Why it happens:**
React's `useState` for `selectedComponent` captures the component at click time. Async callbacks that fire after state has changed hold the old closed-over value. This is the standard React stale closure problem, amplified by the fact that GrapesJS component models are mutable objects (not React state), so there is no re-render signal when they become invalid.

**How to avoid:**
Use a `useRef` (not `useState`) to hold the current target component so the async callback always reads the latest value:
```tsx
const targetComponentRef = useRef<Component | null>(null);
// On AI panel open: targetComponentRef.current = editor.getSelected();
// In async callback: targetComponentRef.current?.set('content', result);
```
Additionally, abort the in-flight request (via `AbortController`) when `component:deselected` fires. Do not apply a result to a component that is no longer selected.

**Warning signs:**
- AI result applies to a different element than the one that was clicked
- Console shows "cannot set property of undefined" after component deselection during API call
- Action panel remains visible after the user clicks elsewhere (no cleanup on `component:deselected`)

**Phase to address:**
Phase 2 (per-element AI text actions) — The ref pattern and abort logic must be part of the initial action panel design.

---

### Pitfall 3: `avoidInlineStyle: true` Causes CSS Rule Accumulation on Repeated Template Loads

**What goes wrong:**
The editor is configured with `avoidInlineStyle: true` (confirmed in `DetailPageEditor.tsx` line 255). This instructs GrapesJS to extract inline styles from the loaded HTML and store them as CSS rules with auto-generated class names (e.g., `gjs-comp-XXXXX`). Each time `editor.setComponents(html)` is called with the same template HTML, GrapesJS generates **new** class names for the same inline styles. After 3–5 reloads (or after AI replaces content multiple times), the CSS rule set grows unboundedly. `editor.getCss()` returns progressively larger style strings, template rendering becomes incorrect as styles conflict, and the PNG export produces visually broken output.

**Why it happens:**
`avoidInlineStyle` is designed for the first load, not for repeated programmatic updates. GrapesJS has no deduplication logic for CSS rules across multiple `setComponents` calls. The current editor page uses `setComponents` as its primary content-load mechanism.

**How to avoid:**
For template content that should be treated as "protected" (not edited via StyleManager), use `protectedCss` option to inject the template CSS as protected styles that GrapesJS does not extract or manage. Alternatively, keep inline styles on template elements and only use `avoidInlineStyle: false` for new user-added blocks. When applying AI full-page HTML rewrites, call `editor.CssComposer.clear()` before `setComponents()` to reset the accumulated rules.

**Warning signs:**
- `editor.getCss()` output grows longer after each AI apply
- Layers panel shows components with names like `gjs-comp-abc123` instead of `div`, `p`, `img`
- Template visuals drift after the second or third AI modification

**Phase to address:**
Phase 1 (GrapesJS editor base + draft load) — Must be validated before any AI apply logic is added. Run: load template, apply AI change, reload — and inspect `editor.getCss()` length across iterations.

---

### Pitfall 4: Floating AI Action Panel Coordinates Are in React App Space, Not Canvas Iframe Space

**What goes wrong:**
To show an AI action panel near the selected element, the natural approach is to use `editor.getSelected()`, get its DOM element via `component.getEl()`, and call `getBoundingClientRect()` to position the panel. `getEl()` returns the DOM node inside the GrapesJS iframe, so `getBoundingClientRect()` returns coordinates relative to the iframe's viewport — not the outer React app's viewport. The panel renders at the wrong position (often off-screen or at coordinates near 0,0).

**Why it happens:**
GrapesJS renders the canvas in an `<iframe>`. The iframe's document has its own coordinate space. `getBoundingClientRect()` is always relative to the viewport of the document that contains the element — in this case, the iframe's inner document. The outer React layer has no knowledge of the iframe's scroll offset or zoom level.

**How to avoid:**
Calculate the correct position by compositing:
1. Get the iframe element: `editor.Canvas.getFrameEl()`
2. Get the iframe's position in the outer document: `iframe.getBoundingClientRect()`
3. Get the component's position inside the iframe: `component.getEl().getBoundingClientRect()`
4. Add the iframe offset to the component rect: `panelTop = iframeRect.top + compRect.top - scrollOffset`
Also account for canvas zoom (the editor applies a CSS `zoom` transform on the iframe `documentElement` — confirmed in the existing `applyContentZoom` function). Divide component rect values by the current zoom ratio before adding the iframe offset.

**Warning signs:**
- Action panel appears at top-left of the editor on first use
- Panel position is correct at 100% zoom but wrong at 80% or 120%
- Panel flickers when the user scrolls the canvas

**Phase to address:**
Phase 2 (per-element AI text actions) — Positioning must be solved before the panel is usable. A wrong position makes the feature unusable for QA sign-off.

---

### Pitfall 5: GrapesJS Component Toolbar Buttons Do Not Appear for Existing Template Components

**What goes wrong:**
GrapesJS allows adding custom buttons to the per-component toolbar (the small floating bar that appears above a selected component with move/clone/delete icons). These buttons are configured on the component **type** definition via `editor.DomComponents.addType()`. However, template HTML loaded via `setComponents()` is parsed by GrapesJS and assigned generic types (`default`, `text`, `image`). Custom buttons added only to custom types are not inherited by these generic components. The AI action button never appears on template elements.

**Why it happens:**
`editor.DomComponents.addType()` extends or overrides a named type. The built-in `text` and `image` types have their own toolbar definitions. Adding a new custom type does not modify existing types. Template elements parsed from HTML get the closest matching built-in type — not the custom type unless the HTML has `data-gjs-type` attributes that explicitly name the custom type.

**How to avoid:**
Two valid approaches:
1. Use `editor.on('component:selected', (component) => { ... })` to dynamically append toolbar items to the selected component's toolbar collection at selection time, regardless of type. This is documented in GrapesJS issue #3233.
2. Override the built-in `text` and `image` types by calling `editor.DomComponents.addType('text', { extend: 'text', ... })` and adding the AI button to the merged toolbar array.

Approach 1 is simpler and does not risk breaking built-in type behavior. The toolbar append pattern:
```js
editor.on('component:selected', (component) => {
  const toolbar = component.get('toolbar') ?? [];
  if (!toolbar.find(t => t.id === 'ai-action')) {
    component.set('toolbar', [...toolbar, { id: 'ai-action', command: 'open-ai-panel', label: '...' }]);
  }
});
```

**Warning signs:**
- AI button appears on manually dragged-in new blocks but not on template elements
- `editor.DomComponents.getType('text')` has `attributes: {}` but the toolbar array is missing the new button
- Toolbar shows the button briefly after first adding an element, then disappears on next selection

**Phase to address:**
Phase 2 (per-element AI text actions) — Test toolbar injection on a loaded template page during the first implementation iteration.

---

### Pitfall 6: Image `src` Attribute Update Triggers Unintended Undo History Entries

**What goes wrong:**
When AI image editing (background removal, FAL.AI generation) completes, the updated image URL is applied by calling `component.setAttributes({ src: newUrl })`. GrapesJS's `UndoManager` records every attribute change as an undoable action. In a typical AI image edit session, one edit triggers: deselect, API call, re-select, setAttributes — all of which may be recorded individually. The undo stack fills with granular intermediate states. Users pressing Ctrl+Z cycle through partial states they never intended to create (e.g., empty src, blank loading state).

**Why it happens:**
The `UndoManager` wraps all model `.set()` calls including `setAttributes`. There is no built-in "batch" mode that groups related changes into a single undo step. The existing editor sets `undoManager: { maximumStackLength: 50 }` which mitigates depth but not granularity.

**How to avoid:**
Wrap programmatic AI-result application in a single undo batch:
```js
editor.UndoManager.stop();
component.setAttributes({ src: newUrl });
editor.UndoManager.start();
```
Using `stop()/start()` prevents the intermediate changes from being recorded. The one-shot `start()` after the change does add the final state as a single undoable step. Apply this pattern to both text content updates (`component.set('content', ...)`) and attribute updates (`component.setAttributes(...)`).

**Warning signs:**
- Pressing Ctrl+Z once after an AI image edit reverts to loading-state src, not the original src
- Undo stack length jumps by 3–5 entries for a single AI action
- The "Undo" button in `EditorToolbar` shows as enabled for `setLoading` and `clearLoading` calls that should not be tracked

**Phase to address:**
Phase 2 (per-element AI text actions) and Phase 3 (per-element AI image actions) — Apply the `stop()/start()` pattern in every AI result-apply handler.

---

### Pitfall 7: "AI로 나머지 채우기" Full-Page Generation Races With In-Progress Per-Element Edit

**What goes wrong:**
The editor exposes a "AI로 나머지 채우기" CTA that triggers a full-page AI content generation (calls the NestJS `/api/products/:id/draft-content` write and may reload the editor). If the user also has an in-progress per-element text rewrite (`/api/templates/modify` or a targeted rewrite endpoint), both API calls may return responses in unpredictable order. The full-page generation response arrives last and overwrites the per-element result. Alternatively, the per-element result applies to a component that was just replaced by the full-page generation, writing to a dead component reference.

**Why it happens:**
There is no global loading/lock state in the current `DetailPageEditor`. Each action panel manages its own `loading` state locally. The full-page CTA and per-element actions share the same editor instance but are unaware of each other.

**How to avoid:**
Introduce a single editor-level `isBusy` flag (via Zustand or a React ref shared via context). Rules:
- Per-element AI panel: cannot start if `isBusy`
- Full-page AI CTA: cannot start if `isBusy`; sets `isBusy = true` on start, clears on complete/error
Both surfaces check the flag before firing their API call. Show a disabled state with tooltip "다른 AI 작업이 진행 중입니다" when blocked.

**Warning signs:**
- Two spinner states visible simultaneously in the editor
- Console errors: "Cannot call set on destroyed component model"
- Full-page reload triggered while an image AI panel is in loading state

**Phase to address:**
Phase 2 and Phase 3 — Define the `isBusy` coordination mechanism before implementing any AI action, not after adding the second one.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Using `editor.setComponents(fullHtml)` for every AI text rewrite | Simple — just replace all HTML | CSS rule accumulation, undo history wipe, stale references on every edit | Never for per-element actions. Acceptable only for the initial page load. |
| Positioning the AI panel with `position: fixed` hardcoded offsets | Fast to build | Breaks at any zoom level, any canvas scroll position | Never — canvas is resizable and zoomable. |
| Adding toolbar buttons only to custom component types | Clean type system | Buttons never appear on template elements (see Pitfall 5) | Never if template elements are the primary edit target |
| Calling `setAttributes` inside a tight loop without `UndoManager.stop()` | Direct API usage | Undo stack fills with partial states | Never inside AI result-apply handlers |
| Letting per-element action panel and full-page CTA run concurrently | No coordination code needed | Race conditions corrupt editor state (see Pitfall 7) | Never |
| Storing current selected component in `useState` instead of `useRef` | React-idiomatic code | Stale closure in async callbacks (see Pitfall 2) | Never for GrapesJS component references held across async boundaries |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| GrapesJS + `@grapesjs/react` `WithEditor` | Accessing `editor` before `WithEditor` has mounted by calling `useEditor()` outside its subtree | All components that call `useEditor()` must be rendered inside `<GjsEditor>` — use `<WithEditor>` wrapper or check `useEditorMaybe()` before calling editor methods |
| GrapesJS canvas iframe + React overlay | Using `document.getElementById` from the outer React app to query elements inside the canvas | Always use `editor.Canvas.getFrameEl().contentDocument.getElementById` to query inside the canvas iframe |
| GrapesJS `component:selected` event + async state | Reading `editor.getSelected()` inside a `useEffect` cleanup or stale callback | Use `useRef` for the target component (see Pitfall 2); never rely on `editor.getSelected()` inside an async callback — the selection may have changed |
| AI image edit panel + FAL.AI latency (20–60s) | Showing only a spinner with no timeout or abort path | Implement a 90-second client-side timeout with `AbortController`. Show "시간이 초과되었습니다. 다시 시도" message. FAL.AI calls in `AIImageEditPanel` already lack abort logic. |
| NestJS `/api/images/edit` + FAL.AI | Frontend sends raw 1688 CDN URL; FAL.AI may reject or time out fetching blocked Chinese CDN URLs | NestJS must download the source image via `http_utils.py`-equivalent proxy before forwarding to FAL.AI. Add URL validation on the NestJS handler. |
| GrapesJS `getCss()` + template CSS injection | `editor.getCss()` includes both user-added styles AND the original `templateCss` injected via `canvasCss`; saving `getCss()` output double-applies the template styles | Use `editor.getCss({ avoidProtected: true })` to exclude protected styles, or track which CSS is "template-owned" vs. "user-added" via a naming convention |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Listening to `editor.on('update', ...)` to sync state | Handler fires on every keypress, drag, style change; React re-renders on every GrapesJS micro-change | Use specific events: `component:selected`, `component:deselected`, `component:styleupdate` — never use `update` for UI sync | Immediately with any real editing — update fires 10–50 times per second during drag |
| Passing full GrapesJS HTML to AI text rewrite endpoint on every request | Payload grows with page content; `AIDesignChatPanel` already does this (sends `fullHtml` including all CSS) | For per-element text rewrite, send only the target component's `outerHTML` + minimal context, not the full page | When template HTML exceeds ~50KB (bold-vertical with images is ~30KB + CSS) |
| Polling `editor.getHtml()` in a `setInterval` for auto-save | `getHtml()` serializes the entire DOM on every tick; expensive on large templates | Auto-save on `editor.on('update', ...)` debounced to 2 seconds; serialize only on `update` event, not on a fixed interval | At any canvas content size beyond trivial |
| Rendering AI action panel as a DOM portal re-mounting on every `component:selected` | New React subtree mounted on every click; panel state (input text, loading) resets on every selection change | Mount the panel once; show/hide via CSS; pass selected component as a prop update — do not unmount/remount | Every time user switches between elements during editing |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Injecting AI-generated HTML directly via `editor.setComponents(aiHtml)` without sanitization | If the AI endpoint is compromised or returns unexpected content, `<script>` tags or `onload` handlers execute inside the GrapesJS canvas iframe | GrapesJS has known XSS vulnerabilities (CVE-2022-21802). Sanitize AI HTML output with DOMPurify before calling `setComponents`. The iframe does not isolate script execution from the parent page in all browsers. |
| Sending the full `editor.getHtml()` output (including user-entered text) to the AI rewrite endpoint without input length limits | Large payloads to `/api/templates/modify` can cause AI cost spikes or timeouts; malicious input could probe the prompt | Enforce a max payload size (e.g., 200KB) on the NestJS endpoint; strip `<script>` and `<iframe>` tags from the HTML before forwarding to AI |
| Displaying AI-generated text content directly in React without escaping | If AI returns text containing `</script>` or HTML entities, and the content is set via `innerHTML` anywhere in the React layer, XSS is possible | Use `component.set('content', text)` for GrapesJS text nodes — GrapesJS escapes content set this way. Never use `innerHTML` to inject AI results in the React UI layer. |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Showing AI action button on every selectable element including layout divs and wrappers | User clicks a section wrapper div, sees "AI 다시쓰기" — unclear what it applies to (the wrapper? child text?) | Restrict AI text actions to `text` and `image` component types only; detect type via `component.get('type')` and show buttons conditionally |
| No visual indication of which element is being processed while AI call is in flight | User clicks another element not knowing the first is still loading; race condition (Pitfall 7) | Apply a CSS class to the target element's wrapper in the canvas: `editor.Canvas.getDocument().getElementById(compId).classList.add('ai-loading')`. Remove on complete. |
| AI result is applied immediately with no preview/confirm step for text rewrites | User gets result that changes meaning of copy; cannot see before/after | Show a diff or before/after panel in the action popover; require "적용" click before committing. For image edits the current `AIImageEditPanel` already handles this via `onEditComplete` callback — text edits should match this pattern. |
| Full-page "AI로 나머지 채우기" button is visible while individual element edits are in progress | User triggers full-page generation mid-edit, wiping per-element changes | Disable the CTA while `isBusy` is true (see Pitfall 7). Show explanation: "개별 편집 완료 후 사용 가능". |
| Action panel dismisses when user accidentally clicks outside of it, losing input text | User typed a long custom rewrite prompt; loses it when clicking back to the canvas | Detect "click outside" only on the outer page, not on the canvas iframe (pointer events differ inside iframe vs. outer document) |

---

## "Looks Done But Isn't" Checklist

- [ ] **Toolbar buttons on template elements:** AI button appears when clicking a `<p>` inside the bold-vertical template HTML — not just on newly dragged-in blocks
- [ ] **Panel position at zoom 80%:** Floating AI panel appears near the selected element at 80% canvas zoom, not at the top-left
- [ ] **Undo after AI text rewrite:** One Ctrl+Z reverts the text to the pre-AI version; pressing it again reverts to the state before that (not an intermediate loading state)
- [ ] **Concurrent action prevention:** Clicking "AI 다시쓰기" on a second element while the first is loading is blocked; button shows disabled state
- [ ] **Full-page CTA disabled during per-element edit:** "AI로 나머지 채우기" button is greyed out while any AI panel is loading
- [ ] **CSS stability:** After applying AI text rewrite 5 times in a row, `editor.getCss()` length is the same as after 1 application
- [ ] **Image edit abort:** Closing the `AIImageEditPanel` mid-edit cancels the in-flight API request (verify in Network tab — request is aborted)
- [ ] **XSS sanity check:** Paste `<img src=x onerror=alert(1)>` as an AI-generated text result; verify it does not execute in the canvas

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| CSS rule accumulation breaks template visuals (Pitfall 3) | MEDIUM | Add `editor.CssComposer.clear()` before each `setComponents()` call; wipe and re-test existing products in staging |
| Stale component reference causes writes to wrong element (Pitfall 2) | LOW | Refactor target component storage to `useRef`; add a guard: check `editor.getSelected()?.cid === targetRef.current?.cid` before applying result |
| Toolbar buttons missing from template components (Pitfall 5) | LOW | Add `component:selected` listener that appends toolbar items; no data migration needed |
| XSS via unsanitized AI HTML (security) | HIGH | Add DOMPurify to `apps/web` dependencies; wrap every `setComponents(aiOutput)` call; audit all existing HTML injection points in `DetailPageEditor` |
| Full-page race condition corrupts editor (Pitfall 7) | MEDIUM | Add `isBusy` ref to editor context; wrap all AI action initiators with a check; no DB changes needed |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Stale state after HTML replacement (Pitfall 1) | Phase 1: GrapesJS base + draft load | After `setComponents`, call `editor.getSelected()` — must return `null`; `canUndo` must be `false` |
| Stale component reference in async callback (Pitfall 2) | Phase 2: Per-element AI text actions | Start a text rewrite, click a different element before it completes — result must not apply to the second element |
| CSS accumulation from `avoidInlineStyle` (Pitfall 3) | Phase 1: GrapesJS base + draft load | Log `editor.getCss().length` before and after 5 successive `setComponents()` calls — length must not grow |
| Floating panel coordinate mismatch (Pitfall 4) | Phase 2: Per-element AI text actions | Test panel position at 80%, 100%, 120% zoom; test after scrolling canvas halfway down |
| Toolbar buttons missing on template elements (Pitfall 5) | Phase 2: Per-element AI text actions | Load bold-vertical template, click any `<p>` text — AI button must appear in the component toolbar |
| Undo granularity pollution (Pitfall 6) | Phase 2 and Phase 3 | Count undo steps after single AI action — must be exactly 1 |
| Concurrent action race (Pitfall 7) | Phase 2 (define `isBusy`) | Trigger per-element edit, then click full-page CTA — second action must be blocked |

---

## Sources

- Direct codebase inspection: `apps/web/src/components/editor/DetailPageEditor.tsx` — confirmed `avoidInlineStyle: true`, zoom implementation, `UndoManager.maximumStackLength: 50`, existing `AIDesignChatPanel.onApply` pattern, `injectHeadResources` iframe injection
- Direct codebase inspection: `apps/web/src/components/editor/AIDesignChatPanel.tsx` — confirmed full HTML is sent to AI on every call; no abort controller; no `isBusy` coordination
- Direct codebase inspection: `apps/web/src/components/editor/AIImageEditPanel.tsx` — confirmed no AbortController; loading state is local-only; no concurrency guard
- Direct codebase inspection: `apps/web/src/app/sourcing/[id]/editor/page.tsx` — confirmed 3-second polling pattern, `setMode('grapes')` transition
- GrapesJS GitHub issue [#3233](https://github.com/GrapesJS/grapesjs/issues/3233): toolbar buttons missing on existing components — confirmed `component:selected` append pattern as the solution
- GrapesJS GitHub issue [#3044](https://github.com/GrapesJS/grapesjs/issues/3044): new toolbar button works only for new components — confirmed built-in type override approach
- GrapesJS GitHub discussion [#4747](https://github.com/GrapesJS/grapesjs/discussions/4747): inline CSS loaded as style tags becomes CSS rules — confirmed `avoidInlineStyle` accumulation behavior
- GrapesJS GitHub issue [#2936](https://github.com/GrapesJS/grapesjs/issues/2936): inline style loads on id instead of class — confirms style management side effects
- Snyk CVE-2022-21802: GrapesJS XSS via component attributes — confirms sanitization requirement for injected HTML
- GrapesJS GitHub issue [#4076](https://github.com/GrapesJS/grapesjs/issues/4076): XSS vulnerability in Style Manager — confirms ongoing XSS risk in GrapesJS
- Community pattern: `useRef` for async mutable values in React — standard React docs guidance; specific to GrapesJS component references
- Community pattern: `UndoManager.stop()/start()` batching — from GrapesJS discussion [#3639](https://github.com/GrapesJS/grapesjs/issues/3639) (Improve UndoManager API)
- `@grapesjs/react` npm README — confirmed `useEditor` must be inside `WithEditor` subtree; canvas is iframe; `GjsEditor` is not for React components inside canvas

---

*Pitfalls research for: GrapesJS WYSIWYG editor + per-element AI actions (KidItem v2.1 milestone)*
*Researched: 2026-03-26*
