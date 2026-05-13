# web/product-content — Product Content Management

`/product-content` is the canonical content management surface for
detail-page work products and reusable image assets.

Content work can be product-bound or standalone:

- primary work product: `ContentGeneration.id`
- optional product attachment: `ContentGeneration.masterId`
- edited HTML storage: `ContentGeneration.editedHtml`
- reusable images: `ContentAsset`
- adopted product gallery images: `MasterProductImage`

`/generate` creates detail-page content. `/product-content` manages the
resulting work products, asset library, product-bound cards, and detail-page
editor.

## Layout

```text
product-content/
  page.tsx                         work product / assets / product-bound tabs
  [productId]/page.tsx             one product's content cards
  [productId]/editor/page.tsx      legacy editor route; redirects by generationId
  detail-pages/[generationId]/editor/page.tsx
                                   canonical detail-page editor
  components/                      route-local cards/grid
  lib/                             routing, API helpers, template HTML, preview sandbox
```

## Contracts

- Work product list reads `GET /api/ai/detail-page`.
- Asset list reads `GET /api/ai/content-assets`.
- Product-bound card list reads `GET /api/products/content/cards`.
- Editor reads `GET /api/ai/detail-page/:generationId`.
- Editor saves HTML through
  `POST /api/ai/detail-page/:generationId/edited-html`.
- Alert/toast hrefs for completed detail-page generation point to
  `/product-content/detail-pages/{contentGenerationId}/editor`.
- Legacy `/sourcing/{id}/editor?kpId=...` and `?boldId=...` links normalize
  to the product-content editor. Legacy
  `/product-content/{masterId}/editor?generationId=...` also redirects to the
  canonical detail-page editor.

## Hard Bans

- Do not reintroduce `/sourcing/[id]/editor` as a canonical route.
- Do not reintroduce `/image-hub`; product-content owns image assets.
- Do not pass `organizationId` from the frontend.
- Do not query the database directly from frontend code.
- Do not call `/api/sourcing/:id/generate`; generation goes through
  `/api/ai/detail-page/generate`.
