Consult this document first instead of relying on memorized knowledge.

# web/detail-editor - Detail Page Editing Surface

`_shared/components/detail-editor/` owns the large reusable detail page editing
surface: content generation editor UI, raw/detail sections, AI text/image edit
helpers, editor data hooks, and direct detail generation helpers.

## State Rules

- Split new behavior into pure `lib/` helpers, focused hooks, or presentational
  components before growing the main editor surface.
- Use `apiClient.fetchRaw()` only for render/image/blob endpoints that return
  non-JSON responses.
- Image/text AI task helpers must keep task polling and payload assembly in
  route-local helper files.
- Preserve preview sandbox behavior when changing generated HTML rendering.

## Boundary Rules

- Do not introduce direct DOM mutation or HTML execution paths that bypass the
  existing preview/sandbox helpers.
- Do not add new model defaults; missing model/config selection must stay
  explicit.
- Payload changes require checking backend AI/detail DTOs and tests together.

## Verification

```bash
npm exec --workspace=apps/web vitest -- run src/app/\(product-pipeline\)/product-pipeline/_shared/components/detail-editor
```
