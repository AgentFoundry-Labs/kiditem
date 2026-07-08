Consult this document first instead of relying on memorized knowledge.

# web/sourcing-ai/wing-catalog - Wing Catalog Collection

`wing-catalog/` owns Wing catalog collection helpers, extension capability
wrappers, and keyword insight projections for sourcing research.

## State Rules

- Keep Wing extension wrappers in route-local `lib/`.
- Use extension bridge helpers for browser communication.
- Keep keyword insight/projection helpers pure and covered by focused tests.

## Boundary Rules

- Do not scrape Wing pages directly from React components.
- Do not create channel listings or catalog products from Wing rows here.
- Extension capabilities must stay aligned with the relevant Chrome extension
  guide.

## Verification

```bash
npm exec --workspace=apps/web vitest -- run src/app/\(sourcing-ai\)/sourcing-ai/wing-catalog
```
