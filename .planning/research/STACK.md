# Stack Research

**Domain:** Multi-step AI content pipeline with structured form editing
**Researched:** 2026-03-25
**Confidence:** HIGH (existing stack verified from codebase; new additions verified via npm/official sources)

---

## Context: What Already Exists (Do Not Re-add)

The existing `apps/web/package.json` already contains:

- `zustand` ^5.0.12 — global state
- `@radix-ui/react-popover` ^1.1.15 — accessible popover primitive
- `@radix-ui/react-dialog` ^1.1.15 — modal dialogs
- `grapesjs` ^0.22.14 + `@grapesjs/react` ^2.0.0 — HTML editor
- `lucide-react` ^0.577.0 — icons
- `next` 14.2.35, `react` ^18 — framework

No new framework or state management library is needed. The additions below fill only the gaps.

---

## Recommended Stack Additions

### New Frontend Libraries

| Library | Version | Purpose | Why Recommended |
|---------|---------|---------|-----------------|
| `react-colorful` | 5.6.1 | Hex color picker + hex input | 2.8 KB, zero dependencies, ships `HexColorPicker` + `HexColorInput`, React 18 compatible. Last published 4 years ago but stable/complete — no active bugs, no API churn. Alternative `@uiw/react-color` is heavier (20+ KB). |

### No New Backend Libraries Needed

The NestJS backend needs no new npm packages. The multi-step pipeline is implemented via:
- A new `pipeline_step` field on `products` table (String, values: `null | "content_ready" | "awaiting_image_gen"`)
- Storing intermediate `GeneratedContent` JSON in `processed_data` at Step 1 completion
- Existing `AgentTask` + `agent_tasks` table for Step 3 image generation trigger
- Existing polling (3-second frontend interval) for status detection

### No New Python Agent Libraries Needed

The Python agent splits the existing `TemplatePipeline.process()` into two separate entry-point functions. No new pip packages required.

---

## Architecture of the Pipeline Split (No New Libraries)

### State Machine: Product.status + Product.pipelineStep

Pipeline state is tracked on the existing `Product` model using two fields:

| Field | Type | Values |
|-------|------|--------|
| `status` | String (existing) | `draft` → `processing` → `draft` (after Step 1) → `processing` (during Step 3) → `processed` |
| `pipelineStep` | String (NEW, nullable) | `null` (no pipeline started), `content_ready` (Step 1 done, awaiting edit), `images_generating` (Step 3 in progress) |

This avoids a new table. `pipelineStep` is stored in `products` as a new nullable String column. The Prisma schema change requires `npm run db:push`.

### Intermediate Data Storage

Step 1 result (`GeneratedContent` — text + theme colors, NO AI images) is stored in `products.processed_data` as a JSON object. This reuses the existing field without schema migration.

Structure of `processed_data` at Step 1 completion:
```json
{
  "pipeline_stage": "content_ready",
  "generated_content": { ...GeneratedContent fields... },
  "hero_image_url": "https://...",
  "source_images": ["url1", "url2"]
}
```

At Step 3 completion, `processed_data` is replaced with the full `DetailPageData` JSON (same as today).

### Editor Side Panel: Structured Form (No Library)

The structured editor (text fields, color pickers, image selector) is a React component built inline. It does NOT replace GrapesJS — it sits alongside it. Implementation:

- Tailwind-styled form with `<input type="text">` for copy fields
- `react-colorful`'s `HexColorPicker` + `HexColorInput` inside `@radix-ui/react-popover` (already installed) for color fields
- Existing `ImagePickerModal` for hero image selection
- State: local `useState` inside the panel (no Zustand store addition needed — this is ephemeral edit state that gets POSTed on confirm)

---

## Installation

```bash
# apps/web only — one new package
cd apps/web
npm install react-colorful@5.6.1
```

No new server-side or agent-side packages.

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `react-colorful` 5.6.1 | `@uiw/react-color` | If you need multi-format pickers (HSL, RGB sliders) in addition to hex. 20+ KB vs 2.8 KB — overkill for theme color selection with 6 hex fields. |
| `react-colorful` 5.6.1 | Build color swatch inline | Acceptable if only swatches (no freeform hex). For arbitrary theme colors, a picker is better UX. |
| `zustand` (existing) for pipeline step | `react-hook-form` | Use react-hook-form only if the structured panel grows to 20+ fields with complex validation. For 6–10 fields with simple hex + text types, useState + direct POST is sufficient. |
| `products.pipelineStep` String column | New `pipeline_runs` table | New table only when one product needs to track multiple concurrent runs. Single-pipeline-per-product: new String column is sufficient. |
| Polling (existing, 3s) | Server-sent events / WebSocket | SSE is better UX but requires new infrastructure. Polling is already implemented and acceptable for the 20–40 second image generation window. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `react-color` (casesandberg) | Unmaintained since 2020, 30+ KB, no TypeScript types | `react-colorful` |
| `react-hook-form` for this editor panel | Adds form library overhead where `useState` suffices. No async validation or complex field arrays needed. | Local `useState` + direct fetch POST |
| New `pipeline_stages` table | Over-engineering. Adding a `pipelineStep` String to `products` achieves the same result without migration complexity | `products.pipelineStep` column |
| New Zustand slice for pipeline state | Pipeline state lives in DB, not client. Frontend reads via polling. Client doesn't need to own this state. | Server state via fetch polling |
| GrapesJS for the structured editor panel | GrapesJS edits raw HTML. The Step 2 structured editor edits `DetailPageData` fields before HTML is even rendered. Wrong tool for the job. | Custom React form panel alongside GrapesJS |

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `react-colorful@5.6.1` | `react@18` | Peer dep is `react >= 16.8`. Works with React 18. No issues. |
| `react-colorful@5.6.1` | `@radix-ui/react-popover@1.1.15` | Not directly coupled — colorful renders inside popover content. Works. |
| New `pipelineStep` DB column | `prisma@7.5.0` | Standard nullable String field. No native enum. Follows existing patterns. |

---

## Stack Patterns by Variant

**If the Step 2 editor only edits the 6 theme colors + title/copy (expected scope):**
- Use local `useState` for the panel fields
- `react-colorful` inside `@radix-ui/react-popover` for each color
- On "Confirm", POST `/api/products/{id}/pipeline/step2-confirm` with the edited fields
- No form library needed

**If the Step 2 editor expands to edit all 20+ DetailPageData fields (scope creep):**
- Add `react-hook-form` at that point
- Still use `react-colorful` for color fields via Controller integration

**If polling becomes a UX problem (> 60s waits):**
- Add NestJS SSE endpoint: `GET /api/products/{id}/pipeline/status/stream`
- No new library needed — NestJS supports SSE natively via `@Sse()` decorator

---

## Sources

- Codebase (`apps/web/package.json`) — existing dependencies verified directly
- [react-colorful npm](https://www.npmjs.com/package/react-colorful) — version 5.6.1, zero dependencies confirmed (MEDIUM confidence — npm page returned 403, confirmed via search results)
- [react-colorful GitHub](https://github.com/omgovich/react-colorful) — bundle size 2.8 KB, React 16.8+ peer dep
- [Radix UI Popover docs](https://www.radix-ui.com/primitives/docs/components/popover) — already in project at ^1.1.15
- `agents/src/agents/content/models.py` — `GeneratedContent` and `DetailPageData` field structure verified from source
- `agents/src/agents/content/template_pipeline.py` — current pipeline flow verified from source
- `prisma/schema.prisma` — existing `Product` model and `processed_data: Json?` field verified

---

*Stack research for: Multi-step AI pipeline with user editing (KidItem v1.0)*
*Researched: 2026-03-25*
