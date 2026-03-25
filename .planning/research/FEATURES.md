# Feature Research

**Domain:** Multi-step AI content pipeline with human-in-the-loop editing — e-commerce seller tool (Coupang detail page generator)
**Researched:** 2026-03-25
**Confidence:** HIGH (based on existing codebase analysis + verified against current tool patterns)

---

## Context

This milestone refactors the existing one-shot `TemplatePipeline` (classification + Korean copywriting + FAL.AI image generation in a single Python agent task) into a **three-step human-in-the-loop pipeline**:

1. **Content generation** — Korean copy + theme colors, preview with original images (no FAL.AI spend)
2. **User editing** — text, colors, hero image selection in the existing editor page
3. **Image generation** — FAL.AI runs only after user confirms content

The existing infrastructure: `ContentAgent` → `TemplatePipeline` (Python), `DetailPageEditor` (GrapesJS, Next.js), `agent_tasks` table + 3-second polling (frontend), `DetailPageData` interface (shared contract).

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Content-only generation step (text + colors, no images) | FAL.AI costs $0.03-0.08/image, 20-40s per image — users expect confirmation gate before spend | MEDIUM | Requires splitting `TemplatePipeline.process()` into `generate_content()` and `generate_images()`. New agent task type or new `generation_mode` value. |
| Template preview with original (unprocessed) images | After content step, users must see what the page looks like before committing to image gen | LOW | Already partly supported — editor page fetches `raw_data.images`. Need to render `DetailPageData` with original URLs in the preview panel before image gen runs. |
| Inline text editing of AI-generated copy | Users expect to fix AI-generated Korean copy (title, hook_text, description, key_points) before paying for images | LOW | GrapesJS editor already handles HTML-level editing. The gap is editing `DetailPageData` fields *before* HTML render — needs a structured field form or direct GrapesJS trait editing. |
| Theme color editing (primary, background, badges) | AI color choices are often wrong for brand; users expect a color picker | LOW | `GeneratedContent` already exposes 7 color fields. Need color pickers bound to `DetailPageData` fields that live-update the template preview. |
| Hero image selection from source images | User must pick which raw product image to use as the base for FAL.AI generation | LOW | Source images already available in editor (`rawImages` prop). Need a dedicated image picker UI that sets the hero and previews it in the template. |
| Processing status indicator during content step | Users expect to see progress during the 10-30s LLM call | LOW | Already implemented via 3-second polling. Extend to distinguish `content_generating` vs `image_generating` sub-states. |
| Hero-based unified image generation trigger | After edits are confirmed, one button triggers banner + main + detail images from the selected hero | MEDIUM | `TemplatePipeline._edit_hero_banner()`, `_edit_main_image()`, `_edit_detail_images()` already exist but run as one block. Need to accept hero URL override from user selection rather than always using `ext_data.images[0]`. |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valuable.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Live template preview as user edits fields | Seller sees the Coupang detail page re-render as they change text/colors — reduces revision cycles | MEDIUM | `renderTemplateToHtml()` already exists in `lib/template-html.ts`. Bind `DetailPageData` state to it. React re-render on field change is sufficient; no separate API call needed. |
| "Confirm and generate images" single-action button | Eliminates the confusion of a two-button flow. User edits, hits one button, images generate | LOW | UX pattern: combine edit-save + image-gen trigger into one action. No new infrastructure — just frontend state machine change. |
| Original-vs-processed image comparison in hero picker | Show source image alongside AI-processed version when selecting hero, so user knows what FAL.AI will receive | MEDIUM | FAL.AI has not run yet at this stage, so comparison is original vs nothing. Better: show original image with a "this will be AI-processed" label. Preview of FAL.AI output only after generation. |
| Preserve editing state across page refresh | If user closes the editor mid-edit, their text/color changes are not lost | LOW | Store intermediate `DetailPageData` edits in `products.processed_data` as a `content_draft` status. Rehydrate from DB on editor load. |
| Category-aware color palette suggestions | Instead of arbitrary hex pickers, suggest 3-4 palette options based on product category (plush = warm pastels, toys = bright primaries) | LOW | `_CATEGORY_TONES` already maps categories to tone guidelines. Extend to pre-built color palette suggestions per category. Only 5-8 categories needed. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Auto-apply AI edits to GrapesJS HTML canvas inline | "Edit text right on the page" feels natural | GrapesJS canvas edits live in the DOM/GrapesJS JSON model, not in `DetailPageData` struct. Syncing back to structured fields is fragile and breaks template re-render. eBay found 95% of sellers edit content, not canvas structure. | Structured field form (left panel) + live template preview (right panel). Keep GrapesJS for final HTML export only, not for the editing step. |
| Real-time AI re-generation on every field change | Seems like a premium feature | FAL.AI is $0.03-0.08/image with 20-40s latency — real-time re-gen is economically irrational and creates an unusable lag. Multi-stage approval pipelines universally separate "draft" from "generate assets". | Generate once on explicit user trigger. Show "regenerate" button only after initial generation. |
| Free-form image crop/resize in editor | Users want to adjust how images appear | GrapesJS handles layout well but image manipulation requires separate tooling (canvas API, crop library). Out of scope for this milestone. | Support hero image selection (which image to use), not image editing. |
| Separate pages for each pipeline step (Step 1 page, Step 2 page, Step 3 page) | "Clean separation of concerns" | Creates navigation complexity, loses context between steps, and requires URL state management. PROJECT.md explicitly says to extend `/sourcing/[id]/editor`, not create new pages. | Single editor page with a step indicator / stage-aware toolbar. The URL stays the same; the page renders differently based on `pipeline_stage` state. |
| Batch editing multiple products at once | Sellers want efficiency | Adds modal complexity, conflicts with per-product hero selection (each product needs individual hero choice), and increases risk of mis-applying AI content across products. | Defer to v2+. Current milestone is single-product pipeline quality. |

---

## Feature Dependencies

```
[Content Generation Step]
    └──requires──> [agent_task: content_only mode OR new pipeline_stage]
                       └──produces──> [DetailPageData with text+colors, original image URLs]

[Template Preview with Original Images]
    └──requires──> [Content Generation Step output]
                       └──requires──> [renderTemplateToHtml() receives original URLs]

[Inline Text + Color Editing]
    └──requires──> [Template Preview with Original Images]
                       └──enhances──> [Live Template Preview on field change]

[Hero Image Selection]
    └──requires──> [Raw source images available (already in rawImages prop)]
    └──enhances──> [Image Generation Step] (user-selected hero overrides ext_data.images[0])

[Image Generation Step]
    └──requires──> [Content Generation Step output]
    └──requires──> [Hero Image Selection] (optional override, defaults to first image)
    └──requires──> [User confirmation action]
    └──produces──> [DetailPageData with FAL.AI-processed URLs]

[Live Template Preview]
    └──requires──> [DetailPageData state bound to renderTemplateToHtml()]
    └──enhances──> [Inline Text + Color Editing]

[Pipeline Stage State]
    └──conflicts──> [One-shot pipeline (already runs both steps)]
    Note: one-shot mode is out of scope per PROJECT.md
```

### Dependency Notes

- **Content Generation requires agent task split:** The Python `ContentAgent` currently runs `TemplatePipeline.process()` which is a single async coroutine combining content + images. Splitting requires either a new `generation_mode` value (`content_only`) or a new agent type. New `generation_mode` is lower friction — add `content_only` to `GenerationMode` enum, branch in `ContentAgent.execute()`.

- **Hero Image Selection enhances Image Generation:** The image generation step already uses `ext_data.images[0]` as hero. Override requires passing `hero_image_url` in the agent task input (already partially supported via `reference_image_url` field in `ContentAgent`).

- **Live Template Preview depends on `renderTemplateToHtml` being stateless:** Currently `renderTemplateToHtml()` in `lib/template-html.ts` takes `DetailPageData` as input. If editing state lives in React state and re-renders call this function, preview updates without API round-trips.

- **Structured field editing conflicts with GrapesJS canvas as edit source:** Do not try to sync GrapesJS DOM back to `DetailPageData`. Use GrapesJS only for final HTML export (save to HTML for download/listing), not as the primary editing surface for this milestone.

---

## MVP Definition

### Launch With (v1 — this milestone)

- [ ] **Content-only agent task mode** — `generation_mode: 'content_only'` in Python agent skips FAL.AI, saves `DetailPageData` with original image URLs, sets product status to `content_draft` — *essential gating of image cost*
- [ ] **Content draft status + polling** — frontend polls for `content_draft` status, transitions to edit mode when ready — *user knows when to edit*
- [ ] **Structured field editor panel** — left panel in editor page shows editable fields for title, hook_text, hook_subtext, description_ko, theme colors — *core editing capability*
- [ ] **Live template preview** — right panel re-renders template on field change using existing `renderTemplateToHtml()` — *user sees result without guessing*
- [ ] **Hero image picker** — grid of source images, user selects one, sets it as hero for image gen — *removes the "wrong image" frustration*
- [ ] **"Generate images" confirmation button** — single CTA that fires image-gen agent task with user-confirmed content + hero URL — *cost gate, main UX flow*
- [ ] **Image generation agent task** — `generation_mode: 'image_only'` (or equivalent) accepts `hero_image_url` override, runs FAL.AI calls, updates product to `processed` — *completes the pipeline*

### Add After Validation (v1.x)

- [ ] **Category-aware color palette suggestions** — trigger: if users frequently undo AI color choices, palette suggestions reduce editing friction
- [ ] **Preserve draft edits across refresh** — trigger: if analytics show users close editor before confirming (session data from activity events)
- [ ] **Regenerate content without losing hero selection** — trigger: if users want to re-run LLM copywriting without starting over
- [ ] **Detail image selection** — allow user to pick which raw images to use as detail shots (not just hero) — trigger: if image quality complaints arise

### Future Consideration (v2+)

- [ ] **Batch pipeline** — process multiple products through content step simultaneously — defer: adds UI complexity, hero selection is per-product
- [ ] **Template switching in editor** — switch between bold-vertical / simple-vertical after content generated — defer: template backward-compat not guaranteed
- [ ] **Version history for edits** — revert to previous content draft — defer: requires versioning layer in DB

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Content-only generation (text + colors) | HIGH | MEDIUM | P1 |
| Hero image picker | HIGH | LOW | P1 |
| Image generation trigger (user-confirmed) | HIGH | MEDIUM | P1 |
| Structured field editor (text + colors) | HIGH | LOW | P1 |
| Live template preview on edit | HIGH | LOW | P1 |
| Content draft status + polling | MEDIUM | LOW | P1 |
| Category-aware color suggestions | MEDIUM | LOW | P2 |
| Preserve draft edits across refresh | MEDIUM | LOW | P2 |
| Detail image selection | MEDIUM | MEDIUM | P2 |
| Batch pipeline | LOW | HIGH | P3 |
| Template switching in editor | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Must have for launch (this milestone)
- P2: Add when core is validated
- P3: Future consideration

---

## Competitor Feature Analysis

Context: eBay, Shopify Magic, and Coupang's own AI tools represent the closest analogues for AI-assisted seller content workflows.

| Feature | eBay AI Description | Shopify Magic | Our Approach |
|---------|---------------------|---------------|--------------|
| Draft → Review → Publish | AI generates draft, seller edits inline on listing form | AI generates section text in theme editor, merchant edits in-place | Content-only step → structured form editor → image gen trigger |
| Image handling | Seller uploads photos separately from text generation | Image generation is a separate tool (Shopify Magic Images) | Hero selection built into same editor page — tighter integration |
| Color/theme | Not handled by seller tool | Theme editor has AI color suggestions | Category-aware palette suggestions in editor panel |
| Intermediate save | No intermediate save — draft lives in browser | Theme changes auto-save as draft | Save `DetailPageData` to `processed_data` at `content_draft` status |
| Multi-step gating | No explicit cost gate (eBay pays for gen) | Magic Images requires explicit per-image trigger | Explicit "generate images" button as cost gate — matches FAL.AI $0.03/image economics |

---

## Existing Infrastructure Leveraged

Documenting what does NOT need to be built:

| Existing Component | Reused As |
|-------------------|-----------|
| `ContentAgent` + `TemplatePipeline._generate_korean_content()` | Content-only step (strip image gen calls) |
| `DetailPageEditor` (GrapesJS) + `renderTemplateToHtml()` | Template preview panel |
| `ImagePickerModal` component | Hero image picker (already exists, check if suitable) |
| `agent_tasks` table + polling (3s interval) | Pipeline stage status tracking |
| `DetailPageData` Pydantic model | Shared contract between steps — no schema change needed |
| `rawImages` prop in editor | Source image pool for hero picker |
| `AIImageEditPanel` | Post-generation individual image re-edits (not in-pipeline) |
| `theme_color_*` fields in `GeneratedContent` | Color editing — all 7 fields already exist |

---

## Sources

- Codebase analysis: `agents/src/agents/content/agent.py`, `template_pipeline.py`, `models.py` — HIGH confidence
- Codebase analysis: `apps/web/src/components/editor/DetailPageEditor.tsx`, `sourcing-api.ts` — HIGH confidence
- Codebase analysis: `apps/web/src/app/sourcing/[id]/editor/page.tsx` — HIGH confidence
- [Built a Fully Automated AI Content Creation Pipeline with Multi-Stage Approvals](https://medium.com/@goodnessprosper27/built-a-fully-automated-ai-content-creation-pipeline-with-multi-stage-approvals-5e708253d2dd) — MEDIUM confidence (community pattern)
- [How AI Content Generation Tools Handle Content Approval Workflows](https://storyteq.com/blog/how-do-ai-content-generation-tools-handle-content-approval-workflows/) — MEDIUM confidence
- [Retailers test generative AI for product detail page content](https://www.digitalcommerce360.com/2023/09/21/retailers-test-generative-ai-to-create-product-detail-page-content/) — MEDIUM confidence (eBay 95% edit rate finding)
- [FAL.AI Pricing](https://fal.ai/pricing) — HIGH confidence (cost justification for gating)

---

*Feature research for: KidItem v1.0 multi-step AI content pipeline*
*Researched: 2026-03-25*
