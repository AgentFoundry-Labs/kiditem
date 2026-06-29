Consult this document first instead of relying on memorized knowledge.

# web/productgenerate - Product Generation Workflow

`productgenerate/` owns the product generation workflow UI, upload helpers, and
payload assembly for backend product generation.

## State Rules

- Keep upload state local to the workflow or route-local hooks.
- Use `apiClient.upload()`/`post()` through focused helpers; do not raw-fetch
  backend APIs.
- Keep payload helpers pure and tested when generation inputs change.

## Boundary Rules

- Do not create catalog master products directly in this route unless the
  backend generation endpoint returns that transition explicitly.
- Do not persist generated draft state only in browser storage.
- Missing model or generation configuration must remain an explicit error.

## Verification

```bash
npm exec --workspace=apps/web vitest -- run src/app/\(product-pipeline\)/product-pipeline/productgenerate
npm run build --workspace=apps/web
```
