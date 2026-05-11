# web/sourcing — Product Sourcing And Detail Editor

Sourcing UI has three stages: product list, product detail preview, and
GrapesJS detail-page editor. The complex surface is `[id]/editor`.

## Layout

```text
sourcing/
  page.tsx
  [id]/page.tsx
  [id]/editor/page.tsx
  [id]/editor/components/
    DetailPageEditor.tsx
    AIImageEditPanel.tsx
    AITextEditPanel.tsx
    ImagePickerModal.tsx
  components/list/
  components/detail/
  lib/sourcing-api.ts
  lib/template-html.tsx
  lib/types.ts
```

## List Page

- 50 rows/page.
- `processingIds` tracks in-flight products.
- Poll only while processing: `refetchInterval: hasProcessing ? 3000 : false`.
- URL scrape calls `POST /api/sourcing/scrape-url`.

## Detail Page

- Fetch product, preview, and template CSS.
- Edits are local preview state until a separate publish/save flow.
- Render preview through `parseDetailPageData()`, `getTemplate()`, and
  `renderTemplateToHtml()`.
- Do not write directly to DB from this page.

## GrapesJS Editor

- Uses `grapesjs@0.22.14` and `@grapesjs/react@2.0.0`.
- Canvas width target is Coupang detail page (860px).
- `storageManager: false`; parent/page owns persistence.
- Save exports HTML + CSS only:
  `editor.getHtml()` + `editor.getCss({ avoidProtected: true })`.
- Load uses `editor.setComponents()` and `editor.setStyle()`.
- Canvas CSS/font injection happens on `canvas:frame:load:body` with
  fingerprint dedupe.
- `DetailPageEditor.tsx` is a large component. Do not add substantial behavior
  without a split plan.

## AI Panels

Image edit:

- `AIImageEditPanel.tsx` calls `POST /api/image-ai/edit`.
- Poll `GET /api/agent-os/requests/{taskId}` every 2s up to 120s.
- On success, fetch latest run and apply `run.output.image_url`.
- `isBusy.current` prevents concurrent edits.

Text edit:

- `AITextEditPanel.tsx` calls `POST /api/text-ai/transform` synchronously.
- Apply text while pausing GrapesJS UndoManager:
  `um.stop(); applyTextToComponent(...); um.start();`.

## Images And Templates

- `ImagePickerModal` upload uses FileReader base64 passthrough; no server upload
  from the editor.
- Gallery images come from parent `rawImages` / `processedImages` props.
- `lib/template-html.tsx` renders `@kiditem/templates` React components to a
  full HTML document with CSS variables and font links.

## Hard Bans

- `editor.saveJSON()`; export HTML+CSS only.
- Server image upload from the editor.
- Local storage through GrapesJS.
- Concurrent AI edits.
- Applying AI text without UndoManager pause.
- Casual new GrapesJS plugins.
- Direct DB update from detail preview/editor pages.

## Change Map

| Change | Also update |
|---|---|
| AI preset | panel component + backend AI DTO/preset |
| custom block | `DetailPageEditor` block manager + Lucide icon map |
| template | `@kiditem/templates` component/config + `getTemplate()` |
| style sector | `DetailPageEditor` style manager |
| polling interval | `AIImageEditPanel` load impact |
| save format | editor save + detail page parse/load |
| gallery source | `ImagePickerModal` + editor props |
