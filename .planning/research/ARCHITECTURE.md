# Architecture Patterns

**Domain:** Per-element AI actions in WYSIWYG editor (GrapesJS + NestJS + Python agents)
**Researched:** 2026-03-26
**Confidence:** HIGH — all integration points verified from direct codebase inspection

---

## Existing Architecture (What Already Works)

### Full Data Flow (Today)

```
Chrome Extension
    → POST /api/sourcing/extension/product-data
    → products table (status=draft, raw_data=JSON)
    → /sourcing/[id]/editor page
        → structured edit (StructuredEditPanel) or GrapesJS (DetailPageEditor)
        → PUT /api/products/:id/draft-content (saves draftContent JSON)
        → POST /api/products/:id/trigger-image-generation
            → agent_tasks INSERT + pg_notify('new_agent_task')
            → Python ContentAgent (generation_mode=image)
                → FAL.AI: hero_banner, main_image, detail_images
                → UPDATE products SET processed_data=..., pipeline_step=null
        → 3-second polling detects pipelineStep=null + processedData exists
        → GrapesJS loads renderTemplateToHtml(processedData)
```

### Component Map (Existing)

| Component | Location | Role |
|-----------|----------|------|
| `DetailPageEditor` | `apps/web/src/components/editor/DetailPageEditor.tsx` | GrapesJS wrapper. Owns `editorRef`, handles component:selected events |
| `AIImageEditPanel` | `apps/web/src/components/editor/AIImageEditPanel.tsx` | Floating panel shown when image element is selected. Calls `POST /api/images/edit` |
| `AIDesignChatPanel` | `apps/web/src/components/editor/AIDesignChatPanel.tsx` | Chat panel in right sidebar. Calls `POST /api/templates/modify` |
| `ImagePickerModal` | `apps/web/src/components/editor/ImagePickerModal.tsx` | Replaces image src from rawImages/processedImages pool |
| `EditorToolbar` | Inside DetailPageEditor | Save, Export PNG, undo/redo, zoom |
| Editor page | `apps/web/src/app/sourcing/[id]/editor/page.tsx` | Orchestrates mode switching (structured/grapes), polling, draft saves |
| `ContentAgent` | `agents/src/agents/content/agent.py` | Python agent. generation_mode=draft or image |
| `AIImageGenerator` | `agents/src/agents/content/image_generator.py` | rembg + AIClient.edit_image for remove_text/replace_background/enhance/regenerate |
| `TemplatePipeline` | `agents/src/agents/content/template_pipeline.py` | FAL.AI based image generation via `fal_client` |
| `AIClient` | `agents/src/core/ai_client.py` | Unified AI client: OpenAI/Gemini text + fal_client image |

### Existing API Endpoints

| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| `POST /api/agent-tasks` | NestJS | EXISTS | Generic task trigger. Validates agent type against allowlist. |
| `PUT /api/products/:id/draft-content` | NestJS | EXISTS | Saves `draftContent` JSON to DB |
| `POST /api/products/:id/trigger-image-generation` | NestJS | EXISTS | Creates content agent task (generation_mode=image) |
| `GET /api/products/:id/preview` | NestJS | EXISTS | Returns processed/draft/raw data + template name |
| `POST /api/images/edit` | NestJS | **MISSING** | Called by AIImageEditPanel. No controller exists yet |
| `POST /api/templates/modify` | NestJS | **MISSING** | Called by AIDesignChatPanel. No controller exists yet |
| `POST /api/render-image` | NestJS | **MISSING** | Called by EditorToolbar export PNG. No controller exists yet |

---

## New Feature: Per-Element AI Actions — Integration Points

### What Needs to Be Built

The frontend components for per-element AI already exist (`AIImageEditPanel`, `AIDesignChatPanel`). They call three endpoints that do not exist yet in NestJS:

1. `POST /api/images/edit` — AI image editing (background removal, text removal, replacement)
2. `POST /api/templates/modify` — AI HTML modification via chat prompt
3. `POST /api/render-image` — HTML-to-PNG rendering for export

Additionally:
- "AI로 나머지 채우기" (fill empty fields) needs a new endpoint or reuse of draft-content trigger
- Per-element **text rewrite/translate** is not yet wired in the editor UI

### Design: Two-Track AI Action Architecture

Per-element AI actions split into two tracks based on latency and agent involvement:

**Track A — Synchronous (NestJS inline, < 5s)**
- Text operations: rewrite, translate, shorten
- Implementation: NestJS calls OpenAI/Gemini directly inside the controller
- No agent_task queue overhead
- Frontend gets result in the same request

**Track B — Asynchronous (Python agent via agent_tasks, 10-40s)**
- Image operations: background removal, replace_background, full_regenerate, enhance
- Implementation: NestJS creates agent_task → Python agent executes → result URL returned
- Frontend polls agent_task status via `GET /api/agent-tasks/:id`
- Existing polling infrastructure from pipeline steps applies here

---

## Component Boundaries for New Features

### New NestJS Module: `images`

```
apps/server/src/images/
├── images.module.ts
├── images.controller.ts    @Controller('images')
└── images.service.ts
```

**Controller routes:**
- `POST /api/images/edit` — receives `{ image_url, preset, user_prompt }`, creates agent_task for image agent, returns `{ taskId }` for polling

**Note:** The AIImageEditPanel currently expects `{ image_url }` back synchronously. This interface needs to change to async polling or the NestJS endpoint must act as a proxy (await agent completion). Given FAL.AI latency (10-30s), the async pattern with task polling is better. The frontend `editImage()` function signature must be updated to return a `{ taskId }` and the component must add a polling loop.

### New NestJS Module: `templates`

```
apps/server/src/templates/
├── templates.module.ts
├── templates.controller.ts    @Controller('templates')
└── templates.service.ts
```

**Controller routes:**
- `POST /api/templates/modify` — receives `{ html, prompt }`, calls AI text model inline (synchronous), returns `{ html }`
- `POST /api/render-image` — receives `{ html }`, calls Python `PageRenderer` via agent_task OR via subprocess — returns PNG binary

**Note on render-image:** `PageRenderer` uses `rebrowser_playwright` (Python). NestJS cannot call it natively. Options:
1. Create an agent task with agent_type `render` + new `RenderAgent` in Python
2. Python process responds inline (not via DB polling) via a separate HTTP server — violates "no HTTP server" rule
3. Most pragmatic: spawn Python subprocess from NestJS, pass HTML, get PNG back

**Recommendation:** Create a `RenderAgent` with a dedicated HTTP callback pattern: NestJS creates agent_task (type `render`, input `{ html, callbackId }`), Python completes and writes PNG to `/tmp/renders/{callbackId}.png`, NestJS polls file presence. This is the least-disruptive change to existing architecture.

### New Python Agent: `image_edit`

```
agents/src/agents/image_edit/
├── __init__.py
└── agent.py    agent_type = "image_edit"
```

**Purpose:** Execute per-element image edits outside of the full pipeline context. Wraps `AIImageGenerator` (already exists in `agents/src/agents/content/image_generator.py`).

**Task input shape:**
```json
{
  "image_url": "https://...",
  "preset": "remove_background | remove_text | replace_background | enhance | full_regenerate",
  "user_prompt": "optional context string"
}
```

**Task output shape:**
```json
{
  "image_url": "https://localhost:4000/processed/images/{uuid}.png"
}
```

Maps to `AIImageGenerator.regenerate()` — already has all four preset modes. The image is saved locally and served via the existing processed images static path.

**Registration:** Add to `runner.py` AGENTS dict:
```python
from src.agents.image_edit.agent import ImageEditAgent
AGENTS["image_edit"] = ImageEditAgent()
```

Also add `"image_edit"` to the `VALID_AGENTS` allowlist in `agent-tasks.controller.ts`.

### Frontend: Text Rewrite Panel

The per-element text AI action is not yet wired. The GrapesJS `component:selected` event in `DetailPageEditor` already fires for image elements and shows `AIImageEditPanel`. Extend it to:

1. Detect text-type components (`component.get('type') === 'text'` or `tagName === 'p' | 'h1' | 'h2' | 'span'`)
2. Show a new `AITextEditPanel` component

**New component:** `apps/web/src/components/editor/AITextEditPanel.tsx`

**API call:** `POST /api/text/rewrite` (new NestJS inline endpoint — no agent task needed)

**Input:** `{ text, action: 'rewrite' | 'translate' | 'shorten' }`
**Output:** `{ text }`

**New NestJS module:** `apps/server/src/text/` — trivial single-method controller calling AI text model.

### Frontend: "AI로 나머지 채우기" CTA

This triggers the existing Step 1 pipeline (`ContentAgent` with `generation_mode=draft`) for `draft` products. The endpoint `POST /api/agent-tasks` already exists. The frontend just needs to call it with:

```json
{
  "agentType": "content",
  "input": { "productId": "...", "generation_mode": "draft" }
}
```

Then poll `GET /api/products/:id` for `pipelineStep === 'content_ready'` (existing 3-second polling pattern).

**No new endpoint needed.** Wire the CTA button directly to the existing `POST /api/agent-tasks`.

---

## Data Flow: Per-Element Image Edit

```
GrapesJS canvas
  → user selects <img> element
  → DetailPageEditor fires component:selected
  → selectedImageSrc state updated
  → AIImageEditPanel mounts (already in place)

User clicks preset (e.g. "배경 제거")
  → AIImageEditPanel calls POST /api/images/edit
        { image_url, preset: "remove_background", user_prompt: "" }
  → NestJS ImagesController.edit()
        → creates agent_task (agentType: "image_edit", input: {...})
        → pg_notify('new_agent_task', taskId)
        → returns { taskId }
  → frontend polls GET /api/agent-tasks/:taskId every 2s
        → when status=completed, reads output.image_url
  → calls onEditComplete(newUrl)
  → DetailPageEditor: selected.setAttributes({ src: newUrl })
  → canvas re-renders with new image
```

## Data Flow: Per-Element Text Rewrite

```
GrapesJS canvas
  → user selects <p> or <h1> element
  → DetailPageEditor fires component:selected
  → selectedTextContent state updated (new state)
  → AITextEditPanel mounts (new component)

User clicks "다시쓰기"
  → POST /api/text/rewrite { text, action: "rewrite" }
  → NestJS TextController.rewrite() — calls AI inline
  → returns { text: "..." }
  → component calls onTextApply(newText)
  → DetailPageEditor: selected.components().reset([{ type:'textnode', content: newText }])
```

## Data Flow: AI Design Chat (HTML-level)

```
AIDesignChatPanel (right sidebar)
  → user types design instruction
  → POST /api/templates/modify { html, prompt }
  → NestJS TemplatesController.modify()
        → calls AI text model with system prompt + full HTML + user instruction
        → parses HTML from response
        → returns { html }
  → onApply(result.html) in DetailPageEditor
  → parseFullHtml(newHtml) → editor.setComponents(newParsed.bodyHtml)
```

---

## Scalability Considerations

| Concern | Current (now) | At v2.1 |
|---------|---------------|---------|
| Image edit latency | 20-40s (FAL.AI) | Same. Async task polling hides it from UX. |
| Text rewrite latency | N/A | < 3s. Inline NestJS call. |
| Agent runner concurrency | Sequential (one task at a time, SKIP LOCKED) | Image edits queue behind pipeline runs. Acceptable for now. |
| Served image URLs | Local filesystem (`/processed/images/`) | Same. No CDN needed until multi-seller. |

---

## Recommended Build Order

Build order respects hard dependencies between layers:

### Step 1: Python ImageEditAgent (no frontend dependencies)

Create `agents/src/agents/image_edit/agent.py`. Wraps existing `AIImageGenerator`. Register in runner.py. Add `"image_edit"` to NestJS agent allowlist.

Deliverable: `POST /api/agent-tasks` with `agentType: "image_edit"` works end-to-end.

### Step 2: NestJS ImagesModule (depends on Step 1 agent existing)

Create `apps/server/src/images/` module. `POST /api/images/edit` creates an `image_edit` agent task. Returns `{ taskId }`.

Deliverable: Frontend can trigger image edit and poll task status.

### Step 3: Frontend AIImageEditPanel polling update (depends on Step 2)

Update `AIImageEditPanel` to handle async response: receive `{ taskId }`, poll `GET /api/agent-tasks/:taskId`, call `onEditComplete` when done.

Deliverable: Full per-element image editing working in GrapesJS.

### Step 4: NestJS TextModule + AITextEditPanel (independent of Steps 1-3)

Create `apps/server/src/text/` module. `POST /api/text/rewrite` (inline AI call). Create `AITextEditPanel.tsx`. Wire `component:selected` in `DetailPageEditor` to detect text elements.

Deliverable: Per-element text rewrite/translate in GrapesJS.

### Step 5: NestJS TemplatesModule — modify endpoint (already called by AIDesignChatPanel)

Create `apps/server/src/templates/` module. `POST /api/templates/modify` calls AI inline. This unblocks the existing `AIDesignChatPanel` which currently fails.

Deliverable: AI Design Chat panel functional.

### Step 6: NestJS TemplatesModule — render-image endpoint

Add `POST /api/render-image` to TemplatesModule. Use `RenderAgent` (Python, new) or a subprocess. Unblocks Export PNG button.

Deliverable: Export PNG functional.

### Step 7: "AI로 나머지 채우기" CTA wiring (no new backend)

In editor page, detect `draft` products with no `draftContent`. Show CTA button. On click, call `POST /api/agent-tasks` with `agentType: "content", generation_mode: "draft"`. Poll `pipelineStep === 'content_ready'` (existing 3s interval). Switch to structured edit mode when ready.

Deliverable: One-click AI fill for fresh draft products.

---

## New vs Modified: Explicit Inventory

### NEW files

| File | Type | Purpose |
|------|------|---------|
| `agents/src/agents/image_edit/__init__.py` | Python | Module init |
| `agents/src/agents/image_edit/agent.py` | Python | ImageEditAgent — wraps AIImageGenerator |
| `apps/server/src/images/images.module.ts` | NestJS | Module registration |
| `apps/server/src/images/images.controller.ts` | NestJS | POST /api/images/edit |
| `apps/server/src/images/images.service.ts` | NestJS | Creates agent_task |
| `apps/server/src/text/text.module.ts` | NestJS | Module registration |
| `apps/server/src/text/text.controller.ts` | NestJS | POST /api/text/rewrite |
| `apps/server/src/text/text.service.ts` | NestJS | Inline AI call |
| `apps/server/src/templates/templates.module.ts` | NestJS | Module registration |
| `apps/server/src/templates/templates.controller.ts` | NestJS | POST /api/templates/modify + POST /api/render-image |
| `apps/server/src/templates/templates.service.ts` | NestJS | AI call + render |
| `apps/web/src/components/editor/AITextEditPanel.tsx` | React | Text rewrite panel |

### MODIFIED files

| File | Change |
|------|--------|
| `agents/src/runner.py` | Register `ImageEditAgent` in AGENTS dict |
| `apps/server/src/agent-tasks/agent-tasks.controller.ts` | Add `"image_edit"` to VALID_AGENTS allowlist |
| `apps/server/src/app.module.ts` | Import ImagesModule, TextModule, TemplatesModule |
| `apps/web/src/components/editor/AIImageEditPanel.tsx` | Change to async: handle `{ taskId }` response, add polling loop |
| `apps/web/src/components/editor/DetailPageEditor.tsx` | Add text element detection in `component:selected` handler, mount AITextEditPanel |
| `apps/web/src/app/sourcing/[id]/editor/page.tsx` | Add "AI로 나머지 채우기" CTA logic (if `draft` status + no draftContent) |

### NOT MODIFIED (confirmed no changes needed)

| File | Reason |
|------|--------|
| `prisma/schema.prisma` | No new columns or tables needed for per-element actions |
| `agents/src/agents/content/agent.py` | ContentAgent unchanged — new ImageEditAgent is separate |
| `agents/src/agents/content/image_generator.py` | Used as-is by new ImageEditAgent |
| `agents/src/agents/content/template_pipeline.py` | Full pipeline unchanged |
| `apps/server/src/products/products.controller.ts` | All needed product endpoints exist |

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Inline FAL.AI calls from NestJS
**What:** Calling fal_client directly from NestJS TypeScript
**Why bad:** fal_client is Python-only. NestJS has no FAL SDK. Node.js FAL SDK exists but adds a new dependency and bypasses the proven agent architecture.
**Instead:** Always route image AI through Python agent_tasks. NestJS creates the task; Python executes it.

### Anti-Pattern 2: Synchronous await on image edits
**What:** NestJS endpoint blocks waiting for Python agent to complete
**Why bad:** FAL.AI edits take 10-40 seconds. This would exhaust NestJS HTTP threads under concurrent use.
**Instead:** Return taskId immediately. Frontend polls GET /api/agent-tasks/:id.

### Anti-Pattern 3: Storing per-edit results in products table
**What:** Writing each image edit back to `products.draftContent` or `products.processedData`
**Why bad:** These are pipeline outputs, not ad-hoc edit history. Pollutes the pipeline state machine.
**Instead:** Return the new image URL directly to the editor. The editor updates the `src` attribute in GrapesJS state. Only on explicit "Save" does the final HTML get persisted.

### Anti-Pattern 4: GrapesJS context menus via plugins
**What:** Adding a GrapesJS RTE plugin or custom command for text rewrite
**Why bad:** GrapesJS plugin API requires deep event integration and creates tight coupling. The existing pattern — react state + overlay panel — is already working for images.
**Instead:** Follow the `AIImageEditPanel` pattern: `component:selected` event → floating React panel → API call → `selected.set(...)`.

---

## Sources

- `apps/web/src/components/editor/DetailPageEditor.tsx` — GrapesJS setup, component selection events, AI panel mounts (direct inspection)
- `apps/web/src/components/editor/AIImageEditPanel.tsx` — existing API contract (`/api/images/edit`) (direct inspection)
- `apps/web/src/components/editor/AIDesignChatPanel.tsx` — existing API contract (`/api/templates/modify`) (direct inspection)
- `apps/server/src/products/products.controller.ts` — existing NestJS routes (direct inspection)
- `apps/server/src/agent-tasks/agent-tasks.controller.ts` — VALID_AGENTS allowlist, task creation pattern (direct inspection)
- `agents/src/agents/content/agent.py` — ContentAgent, generation_mode dispatch (direct inspection)
- `agents/src/agents/content/image_generator.py` — AIImageGenerator, RegenerationMode presets (direct inspection)
- `agents/src/runner.py` — AGENTS registry, LISTEN/NOTIFY pattern (direct inspection)
- `prisma/schema.prisma` — Product model fields (direct inspection)
- `apps/web/src/app/sourcing/[id]/editor/page.tsx` — editor page orchestration, polling, mode switching (direct inspection)
