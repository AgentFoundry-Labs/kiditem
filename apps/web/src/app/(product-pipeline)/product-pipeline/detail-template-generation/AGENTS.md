Consult this document first instead of relying on memorized knowledge.

# web/detail-template-generation - Template Detail Generation

`detail-template-generation/` owns detail-page generation from templates,
source references, image ordering, whitespace crop helpers, preview HTML, and
generation form/workflow hooks.

## State Rules

- Keep generation payload assembly and source-reference helpers in route-local
  `lib/`.
- Keep image/crop/order helpers pure and covered by focused tests.
- Generation hooks call backend AI/detail endpoints through `apiClient`.
- Preview HTML helpers must preserve sandboxing and generated-template CSS
  assumptions.

## Boundary Rules

- Do not add template prompt/model defaults in UI code.
- Do not mutate product workspace state except through explicit backend content
  workspace or generation endpoints.
- Payload shape changes require checking backend DTOs and route tests together.

## Verification

```bash
npm exec --workspace=apps/web vitest -- run src/app/\(product-pipeline\)/product-pipeline/detail-template-generation
npm run build --workspace=apps/web
```
