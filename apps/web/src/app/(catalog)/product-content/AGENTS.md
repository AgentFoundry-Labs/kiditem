# web/product-content — Product Content Management

`/product-content` is the canonical product content management surface.

It is master-bound, not sourcing-candidate-bound:

- primary entity: `MasterProduct.id`
- content rows: `ContentGeneration.masterId`
- edited HTML storage: `MasterProduct.draftContent.editedHtml`
- supporting images: `MasterProductImage`

`/generate` creates detail-page content. `/product-content` manages the
resulting cards, history entry points, and detail-page editor.

## Layout

```text
product-content/
  page.tsx                         content card list
  [productId]/page.tsx             one product's content cards
  [productId]/editor/page.tsx      detail-page editor
  components/                      route-local cards/grid
  lib/                             routing, API helpers, template HTML, preview sandbox
```

## Contracts

- Card list reads `GET /api/products/content/cards`.
- Editor reads `GET /api/ai/detail-page/:generationId` when a generation is
  explicitly selected.
- Editor saves HTML through `POST /api/products/:masterId/edited-html`.
- Alert/toast hrefs for completed detail-page generation point to
  `/product-content/{masterId}/editor?generationId={contentGenerationId}`.
- Legacy `/sourcing/{id}/editor?kpId=...` and `?boldId=...` links normalize
  to the product-content editor.

## Hard Bans

- Do not reintroduce `/sourcing/[id]/editor` as a canonical route.
- Do not pass `organizationId` from the frontend.
- Do not query the database directly from frontend code.
- Do not call `/api/sourcing/:id/generate`; generation is master-bound through
  `/api/ai/detail-page/generate`.
