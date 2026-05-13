# web/product-content — Product Content Workspace Archive

`/product-content` is the canonical archive for AI-produced product content.
Top-level cards are workspace summaries, not raw generated rows and not raw
asset rows.

Workspace identity:

- Product workspace: the canonical `ContentGenerationGroup` with
  `groupType='product_workspace'` and `targetMasterId=<MasterProduct.id>`.
- Unlinked workspace: one `ContentGenerationGroup` containing product-less
  generated rows.
- Individual output: `ContentGeneration.id`.
- Asset library files: `ContentAsset`; never top-level cards. The images
  currently used by one generated output are `ContentGenerationAssetUsage`.
- Adopted product gallery images: `MasterProductImage`, still owned by the
  products domain.

`/generate` creates detail-page content. `/product-content` manages the
generated workspaces, reruns, product attachment, and detail-page editor.

## Layout

```text
product-content/
  page.tsx                         product + unlinked workspace index
  [productId]/page.tsx             product workspace sections
  [productId]/editor/page.tsx      legacy editor route; redirects by generationId
  detail-pages/[generationId]/editor/page.tsx
                                   canonical detail-page editor
  groups/[groupId]/page.tsx        unlinked generation-group workspace
  components/                      route-local cards/grid
  lib/                             routing, API helpers, template HTML, preview sandbox
```

## Contracts

- Workspace index reads `GET /api/ai/content-archive/workspaces`.
- Product workspace reads `GET /api/ai/content-archive/products/:productId`.
- Unlinked workspace reads `GET /api/ai/content-archive/groups/:groupId`.
- Attach action calls
  `POST /api/ai/content-archive/groups/:groupId/attach-product`.
- `재생성` calls `POST /api/ai/content-archive/:generationId/rerun`.
- Editor reads `GET /api/ai/detail-page/:generationId`.
- Editor saves HTML through
  `POST /api/ai/detail-page/:generationId/edited-html`.
- Editor save is the persistence boundary for AI image edits. Temporary
  edit-output URLs are promoted to permanent asset URLs, the editor HTML is
  rewritten, and the current image usage set is synced on save.
- Alert/toast hrefs for completed detail-page generation point to
  `/product-content/detail-pages/{contentGenerationId}/editor`.
- Product workspace `추가 생성` starts a new generation for that target
  product. `재생성` reruns an existing generation into its explicit group.
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
