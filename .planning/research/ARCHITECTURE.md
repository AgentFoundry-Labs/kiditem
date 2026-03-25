# Architecture Research

**Domain:** Multi-step AI pipeline with intermediate state and user editing gate
**Researched:** 2026-03-25
**Confidence:** HIGH (based on direct codebase inspection)

## Standard Architecture

### System Overview — Current (Monolithic)

```
[Frontend] /sourcing/[id]
    ↓ POST /api/agent-tasks { agentType: "content", input: { productId } }
[NestJS] agent-tasks controller → INSERT agent_tasks
    ↓ LISTEN/NOTIFY
[Python Runner] ContentAgent.execute()
    ↓ parallel
    ├── _analyze_product() — Gemini image analysis, picks detail_indices
    ├── _scan_size_charts() — PaddleOCR on description_images
    └── _generate_korean_content() — LLM copywriting → GeneratedContent
    ↓ parallel (FAL.AI — 20-40s each)
    ├── _edit_hero_banner()
    ├── _edit_main_image()
    ├── _edit_detail_images()
    └── _edit_size_charts()
    ↓
    _assemble() → DetailPageData
    ↓
    UPDATE products SET processed_data = $1, status = 'draft'
    UPDATE content_generations SET detail_page_html = $1, status = 'COMPLETED'
```

### System Overview — Target (Two-Step with Editor Gate)

```
[Frontend] /sourcing/[id]
    ↓ Step 1 trigger
    POST /api/agent-tasks { agentType: "content_step1", input: { productId } }
                                     ↓ LISTEN/NOTIFY
                          [ContentStep1Agent]
                              ├── _analyze_product()
                              ├── _scan_size_charts()
                              └── _generate_korean_content()
                                     ↓
                          UPDATE products
                            SET draft_content = $1  ← new JSONB column
                                status = 'content_ready'
                                     ↓
[Frontend] /sourcing/[id]/editor   (polls status = 'content_ready')
    ├── Renders template with original images (no FAL yet)
    ├── User edits text / theme colors / selects hero image
    └── POST /api/products/:id/draft-content { edits }
                          [NestJS] ProductsController
                              └── UPDATE products SET draft_content = merged
                                     ↓
[Frontend] confirms edits → triggers Step 2
    POST /api/agent-tasks { agentType: "content_step2", input: { productId } }
                                     ↓ LISTEN/NOTIFY
                          [ContentStep2Agent]
                              reads products.draft_content
                              ├── _edit_hero_banner()   ← uses confirmed hero_url
                              ├── _edit_main_image()
                              ├── _edit_detail_images()
                              └── _edit_size_charts()
                                     ↓
                          _assemble() → DetailPageData
                          UPDATE products
                            SET processed_data = $1
                                draft_content = NULL   ← optional cleanup
                                status = 'draft'
```

## Component Responsibilities

| Component | Responsibility | Status |
|-----------|----------------|--------|
| `ContentStep1Agent` | Parallel: image analysis + OCR + LLM copywriting. Writes `draft_content`. | NEW — split from ContentAgent |
| `ContentStep2Agent` | FAL.AI image editing using confirmed `draft_content`. Writes `processed_data`. | NEW — split from ContentAgent |
| `ContentAgent` | Existing agent. Retain for oneshot mode only. Template mode delegates to Step1+Step2. | MODIFY — route by mode |
| `products.draft_content` | Intermediate state: GeneratedContent + user overrides + confirmed hero_url + detail_indices. | NEW — Prisma schema field |
| `PUT /api/products/:id/draft-content` | Merge user edits into `draft_content`. Return 200. | NEW — NestJS endpoint |
| `GET /api/products/:id/preview` | Already exists. Extend to serve from `draft_content` when `processed_data` is null. | MODIFY |
| Editor page `/sourcing/[id]/editor` | Already fetches preview. Extend to: show edit controls, save via PUT, trigger Step 2. | MODIFY |

## Recommended Project Structure Changes

### Prisma Schema Addition

```
prisma/schema.prisma — Product model
  + draftContent   Json?   @map("draft_content")   // GeneratedContent + hero_url override
```

Run: `npm run db:push && npx prisma generate`

### Python Agent Changes

```
agents/src/agents/content/
├── agent.py          — MODIFY: route template mode to step1 only; keep oneshot intact
├── step1_agent.py    — NEW: ContentStep1Agent (agentType = "content_step1")
├── step2_agent.py    — NEW: ContentStep2Agent (agentType = "content_step2")
├── template_pipeline.py  — SPLIT: step1 logic stays here; step2 image editing extracted
└── image_pipeline.py — NEW: image editing methods extracted from TemplatePipeline
```

Runner registration:

```python
# agents/src/runner.py
AGENTS = {
    "content":       ContentAgent(),      # existing — oneshot only
    "content_step1": ContentStep1Agent(), # new
    "content_step2": ContentStep2Agent(), # new
}
```

### NestJS Backend Changes

```
apps/server/src/products/
├── products.controller.ts  — ADD: PUT /:id/draft-content
└── products.service.ts     — ADD: updateDraftContent(), modify preview() to use draft_content
```

### Frontend Changes

```
apps/web/src/
├── lib/sourcing-api.ts     — ADD: saveDraftContent(), triggerStep2()
└── app/sourcing/[id]/editor/page.tsx  — MODIFY: save controls → PUT; confirm button → Step 2 trigger
```

## Intermediate State Schema

The `draft_content` JSONB column is the handoff point between Step 1 and Step 2. It must carry everything Step 2 needs without re-running LLM calls.

```typescript
interface DraftContent {
  // From GeneratedContent (Step 1 output — all editable by user)
  title_ko: string;
  hook_text: string;
  hook_title_sub: string;
  hook_subtext: string;
  description_ko: string[];
  key_points: GeneratedKeyPoint[];
  specs_ko: SpecItem[];
  materials_ko: SpecItem[];
  features: FeatureItem[];
  notes: string[];

  // Theme colors (editable)
  theme_color_main: string;
  theme_color_bg_light: string;
  theme_color_badge_1: string;
  theme_color_badge_2: string;
  theme_section_bg: string;
  theme_text_primary: string;
  theme_text_secondary: string;
  theme_border_radius: string;

  // Image selections (set in Step 1, overrideable by user)
  hero_url: string;          // user can swap from raw_data.images[]
  detail_indices: number[];  // from _analyze_product(), user can adjust
  size_indices: number[];    // from _scan_size_charts()

  // Pipeline metadata (not editable)
  step1_completed_at: string;    // ISO timestamp
  category: string;              // for banner mood resolution in Step 2
}
```

## Architectural Patterns

### Pattern 1: Status-Gated Two-Phase Agent Task

**What:** Each pipeline step writes a terminal status that the next step reads as its precondition. The user gate lives between statuses.

**When to use:** When a long-running background job has a natural human review point.

**Status state machine:**
```
draft → processing → content_ready → image_processing → draft
         (step1)                         (step2)
```

`processing` and `image_processing` are both transient "running" states. The frontend polls `GET /api/products/:id` and routes on status:
- `content_ready` → show editor with edit controls enabled and Step 2 trigger button
- `image_processing` → show spinner ("이미지 생성 중...")
- `draft` (with processedData) → show editor read-only / preview

**Trade-offs:** Simple string status is enough since there is only one active agent task at a time per product. No need for a state machine library.

### Pattern 2: Merge-on-Save for User Edits

**What:** Editor page calls `PUT /api/products/:id/draft-content` with only changed fields. NestJS merges the patch into the existing `draft_content` JSONB using Prisma's `update`.

**When to use:** When the user edits a structured form backed by a JSONB blob.

**Example (NestJS service):**
```typescript
async updateDraftContent(id: string, patch: Partial<DraftContent>) {
  const product = await this.prisma.product.findUniqueOrThrow({ where: { id } });
  const existing = (product.draftContent as DraftContent) ?? {};
  const merged = { ...existing, ...patch };
  return this.prisma.product.update({
    where: { id },
    data: { draftContent: merged as Prisma.JsonObject },
  });
}
```

**Trade-offs:** Simple JSON merge is sufficient here because `DraftContent` is a flat object (no deep nested arrays that need diff-merging). Arrays like `key_points` are replaced wholesale when the user edits them.

### Pattern 3: Preview Endpoint Serves from draft_content

**What:** `GET /api/products/:id/preview` returns `draft_content` data when `processed_data` is null, so the editor page renders the template with Step 1 content using original images.

**When to use:** When the same template rendering path must work for both intermediate and final states.

**Example (NestJS controller):**
```typescript
@Get(':id/preview')
async preview(@Param('id') id: string) {
  const product = await this.productsService.findOne(id);
  if (!product) throw new NotFoundException();

  // Step 2 done → serve final
  if (product.processedData) {
    return { template: 'bold-vertical', data: product.processedData };
  }
  // Step 1 done → serve draft with original images for editor
  if (product.draftContent) {
    const draft = product.draftContent as DraftContent;
    const raw = (product.rawData as ExtensionRawData) ?? {};
    return {
      template: 'bold-vertical',
      data: buildPreviewFromDraft(draft, raw),  // maps draft → DetailPageData
    };
  }
  // Fallback
  return { template: null, data: product.rawData ?? {} };
}
```

## Data Flow

### Step 1 Flow

```
User clicks "AI 가공" button
    ↓
sourcing-api.ts process(id, { generation_mode: 'template' })
    ↓ POST /api/agent-tasks { agentType: "content_step1" }
NestJS agent-tasks controller → INSERT agent_tasks
    ↓ UPDATE products SET status = 'processing'
Python LISTEN/NOTIFY → ContentStep1Agent.execute()
    ↓ asyncio.gather(analyze, ocr, copywrite)
    ↓ UPDATE products SET draft_content = $1, status = 'content_ready'
Frontend poll (3s) detects status = 'content_ready'
    ↓ redirect to /sourcing/[id]/editor
Editor fetches GET /api/products/:id/preview
    ↓ returns draft_content mapped to DetailPageData (original images)
Editor renders template preview
```

### User Edit + Step 2 Flow

```
User edits text/colors/images in editor
    ↓ onChange → debounced PUT /api/products/:id/draft-content { patch }
NestJS merges patch into draft_content

User clicks "이미지 생성 확정"
    ↓ POST /api/agent-tasks { agentType: "content_step2", input: { productId } }
NestJS → INSERT agent_tasks
    ↓ UPDATE products SET status = 'image_processing'
Python ContentStep2Agent.execute()
    ↓ reads products.draft_content
    ↓ asyncio.gather(FAL banner, main, details, size_charts)
    ↓ _assemble() → DetailPageData with processed image URLs
    ↓ UPDATE products SET processed_data = $1, status = 'draft'
Frontend poll detects status = 'draft' (with processedData)
    ↓ editor refreshes preview with final images
```

## New vs Modified Components

### New Components

| Component | Type | Purpose |
|-----------|------|---------|
| `agents/src/agents/content/step1_agent.py` | Python | ContentStep1Agent — text+analysis pipeline |
| `agents/src/agents/content/step2_agent.py` | Python | ContentStep2Agent — FAL image pipeline |
| `prisma/schema.prisma` field `draftContent` | DB | Intermediate state storage |
| `PUT /api/products/:id/draft-content` | NestJS | User edit save endpoint |
| `buildPreviewFromDraft()` | NestJS helper | Maps DraftContent → DetailPageData for preview |

### Modified Components

| Component | Change |
|-----------|--------|
| `agents/src/runner.py` | Register content_step1 and content_step2 agents |
| `agents/src/agents/content/agent.py` | Template mode → content_step1 only; oneshot unchanged |
| `apps/server/src/products/products.controller.ts` | Add PUT /:id/draft-content route |
| `apps/server/src/products/products.service.ts` | Add updateDraftContent(), modify preview() logic |
| `apps/web/src/lib/sourcing-api.ts` | Add saveDraftContent(), triggerStep2() |
| `apps/web/src/app/sourcing/[id]/editor/page.tsx` | Add save-on-change, Step 2 trigger button, status polling |

## Suggested Build Order

The dependency chain is: DB schema → Python agent → NestJS API → Frontend.

**Phase 1 — Foundation (no functional breakage to existing flow)**
1. Add `draftContent Json?` to Prisma Product model, run `db:push`
2. Add `content_step1` and `content_step2` to `AGENTS` dict in runner.py (empty stubs first)
3. Validate that existing `content` agent still works end-to-end

**Phase 2 — Split the Python Agent**
4. Extract Step 1 logic from `ContentAgent.execute()` into `ContentStep1Agent`
   - Same three parallel tasks: `_analyze_product`, `_scan_size_charts`, `_generate_korean_content`
   - Output: `UPDATE products SET draft_content = $1, status = 'content_ready'`
5. Extract Step 2 logic: FAL image edits → assemble → `UPDATE products SET processed_data = $1`
   - Reads `draft_content` for `hero_url`, `detail_indices`, `GeneratedContent` fields
6. Integration test: trigger step1, inspect `draft_content` in DB, trigger step2, inspect `processed_data`

**Phase 3 — NestJS API**
7. Add `PUT /api/products/:id/draft-content` endpoint + `updateDraftContent()` service method
8. Modify `GET /api/products/:id/preview` to serve from `draft_content` when `processed_data` is null
   - Implement `buildPreviewFromDraft()` helper that maps DraftContent fields + raw image URLs to DetailPageData shape

**Phase 4 — Frontend Editor**
9. In `sourcing-api.ts`: add `saveDraftContent(id, patch)` and `triggerStep2(id)`
10. In editor page: add save-on-change for text/color/hero edits (debounced PUT)
11. Add "이미지 생성 확정" button that calls `triggerStep2()`
12. Extend status polling: handle `content_ready` (editor active) and `image_processing` (spinner) states
13. On `image_processing → draft` transition, reload preview to show final processed images

## Anti-Patterns

### Anti-Pattern 1: Running Step 2 Automatically After Step 1

**What people do:** Chain step1 completion to immediately queue step2 inside the agent.

**Why it's wrong:** Bypasses the entire purpose of the split — user confirmation before expensive FAL.AI calls (20-40s, billed per call).

**Do this instead:** Set `status = 'content_ready'` and wait. Only the frontend "확정" button triggers step2.

### Anti-Pattern 2: Storing Edits Only in Frontend State

**What people do:** Hold edited content in React state, only submit on "확정".

**Why it's wrong:** User loses edits on page refresh. Editor state is unrecoverable if browser closes between step1 and step2.

**Do this instead:** Debounced PUT on every edit field change. `draft_content` in DB is the single source of truth. Editor hydrates from `GET /api/products/:id` on load.

### Anti-Pattern 3: Returning Processed Images in Step 1 Preview

**What people do:** Run a quick FAL call in step1 to show "preview" images.

**Why it's wrong:** Incurs FAL cost and latency before user confirms. Defeats the cost-saving purpose.

**Do this instead:** Step 1 preview uses original `raw_data.images[]` directly. The template renders with unedited source images. FAL only runs in step2.

### Anti-Pattern 4: New Agent Type for Every Pipeline Variant

**What people do:** Create `content_template_step1`, `content_template_step2`, `content_oneshot_step1`, etc.

**Why it's wrong:** Exponential agent type proliferation. Runner.py becomes a routing mess.

**Do this instead:** Two agent types only: `content_step1` and `content_step2`. Oneshot continues to use the existing `content` agent type unchanged.

## Integration Points

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Frontend → NestJS | REST + polling | `GET /api/products/:id` every 3s for status |
| NestJS → Python | `agent_tasks` INSERT + LISTEN/NOTIFY | Existing pattern, no change |
| Python Step1 → Python Step2 | `products.draft_content` JSONB | No direct agent-to-agent communication |
| Python Step2 → Frontend | `products.processed_data` + `status = 'draft'` | Frontend detects via polling |

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| FAL.AI | HTTP via `AIClient.fal_edit_image()` | Only called in step2. 20-40s per call. |
| Gemini/OpenAI | HTTP via `AIClient.generate_with_healing()` | Only called in step1. |
| PaddleOCR | Local CPU inference | Only called in step1. Slow on first call (model load). |

## Sources

- Direct inspection of `agents/src/agents/content/agent.py` — current monolith structure
- Direct inspection of `agents/src/agents/content/template_pipeline.py` — pipeline internals
- Direct inspection of `prisma/schema.prisma` — existing Product model, AgentTask pattern
- Direct inspection of `agents/src/runner.py` — LISTEN/NOTIFY polling pattern
- Direct inspection of `apps/server/src/products/products.controller.ts` — existing preview endpoint
- Direct inspection of `apps/web/src/app/sourcing/[id]/editor/page.tsx` — current editor flow
- Direct inspection of `apps/web/src/lib/sourcing-api.ts` — agent task trigger pattern
- `.planning/PROJECT.md` — milestone requirements and constraints

---
*Architecture research for: KidItem v1.0 pipeline refactoring (two-step with editor gate)*
*Researched: 2026-03-25*
