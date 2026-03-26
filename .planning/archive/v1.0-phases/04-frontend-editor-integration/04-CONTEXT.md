# Phase 4: Frontend Editor Integration - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Extend the editor page (`/sourcing/[id]/editor`) with a structured editing panel (text fields, color pickers, hero image selection), live template preview, and a two-step pipeline CTA flow (edit → confirm → image generation → GrapesJS). The page supports both structured editing mode and GrapesJS HTML mode.

</domain>

<decisions>
## Implementation Decisions

### Editor Layout
- **D-01:** Two modes coexist on the editor page: (1) Structured editing mode — left panel with text/color/hero fields, right panel with live template preview. (2) GrapesJS mode — full HTML canvas editing (existing). User transitions from structured mode to GrapesJS after image generation.
- **D-02:** Structured editing panel uses tabs or sections: text fields (title, hook, key_points, specs), theme colors (7 color pickers), hero image selection (reuse ImagePickerModal).

### Pipeline UX Flow (within editor)
- **D-03:** Step-by-step guided flow inside the editor:
  1. Editor opens in structured editing mode (text/color/hero fields populated from draftContent)
  2. User edits fields → changes save via PUT /api/products/:id/draft-content (debounced or on-change)
  3. Live preview updates in real-time as user edits (re-render template with current data)
  4. "이미지 생성 확정" CTA button → POST /api/products/:id/trigger-image-generation
  5. Loading/polling state while images generate (pipelineStep=images_generating)
  6. On completion → preview shows final result (processedData) → GrapesJS mode available for HTML fine-tuning
- **D-04:** The structured editing panel is visible only when draftContent exists and processedData is not yet generated (or user explicitly re-enters edit mode).

### Live Preview
- **D-05:** Preview re-renders using existing `renderTemplateToHtml()` with updated DetailPageData whenever a field changes. No backend call needed for preview — it's client-side rendering.
- **D-06:** Preview uses the same template rendering pipeline (parseDetailPageData → getTemplate → renderTemplateToHtml) — displayed in an iframe.

### Color Picker
- **D-07:** Install `react-colorful` (2.8KB, zero deps) for the 7 theme color pickers. Each color field shows a swatch + hex input + popover picker.

### Hero Image Selection
- **D-08:** Reuse existing `ImagePickerModal` component for hero image selection. Show raw_data.images as the source gallery. Selected hero is saved to draftContent.

### Saving
- **D-09:** Frontend sends the FULL draftContent object on every save (per Phase 3 D-01 — full replacement). Save triggers on: field blur, color change, hero selection. Not debounced — immediate on user action.

### Status Polling
- **D-10:** After triggering image generation, poll GET /api/products/:id every 3 seconds (existing pattern). When pipelineStep becomes null and processedData exists → show final result.

### Claude's Discretion
- Exact component structure (new components vs inline)
- Tab/section naming and grouping in the editing panel
- Animation/transition between modes
- Error handling for failed image generation

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Frontend Editor
- `apps/web/src/app/sourcing/[id]/editor/page.tsx` — Current editor page to extend
- `apps/web/src/components/editor/DetailPageEditor.tsx` — GrapesJS editor component
- `apps/web/src/components/editor/ImagePickerModal.tsx` — Image picker to reuse for hero selection
- `apps/web/CLAUDE.md` — Frontend patterns, API calling, styling rules

### Template System
- `packages/templates/src/bold-vertical/index.tsx` — Template component and DetailPageData interface
- `apps/web/src/lib/template-html.ts` — renderTemplateToHtml function

### API Endpoints (Phase 3 output)
- `apps/server/src/products/products.controller.ts` — PUT draft-content, GET preview, POST trigger-image-generation
- `apps/web/src/lib/api.ts` — API_BASE constant
- `apps/web/src/lib/sourcing-api.ts` — Existing API client patterns

### Schema Reference
- `prisma/schema.prisma` — Product model (draftContent, pipelineStep fields)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ImagePickerModal` — raw/processed/upload tabs, already accepts `rawImages` prop → hero selection
- `renderTemplateToHtml()` — client-side template rendering, can be called on every field change
- `parseDetailPageData()` — converts API response to DetailPageData
- `getTemplate()` — loads template config by ID
- `API_BASE` from `@/lib/api` — all API calls
- Existing polling pattern in sourcing detail page (3-second interval)

### Established Patterns
- `'use client'` on all pages
- Tailwind CSS with light theme (`bg-white`, `border-gray-200`, `text-gray-900`)
- `useState` + `useCallback` + `useEffect` for data flow
- `lucide-react` for icons
- No form library — manual state management

### Integration Points
- `PUT /api/products/:id/draft-content` — save edited content
- `GET /api/products/:id/preview` — load initial data
- `POST /api/products/:id/trigger-image-generation` — start image gen
- `GET /api/products/:id` — poll for completion

</code_context>

<specifics>
## Specific Ideas

- Install `react-colorful` for color pickers (recommended in research phase)
- Structured panel should feel like a form, not a canvas — clear field labels, input groups
- Preview should update instantly without loading states (client-side re-render)
- "이미지 생성 확정" button should be prominent and clearly communicate the action

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-frontend-editor-integration*
*Context gathered: 2026-03-26*
