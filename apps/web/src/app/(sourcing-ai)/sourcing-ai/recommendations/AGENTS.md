Consult this document first instead of relying on memorized knowledge.

# web/sourcing-ai/recommendations - Today Recommendations

`recommendations/` owns recommendation views and helpers for Naver keyword
research and today-recommendation row shaping.

## State Rules

- Use route-local API helpers for recommendation/keyword endpoints.
- Keep recommendation row shaping pure and tested.
- Filters and selected rows are local UI state unless they drive backend query
  params.

## Boundary Rules

- Do not create catalog products directly from recommendation rows.
- Do not hide backend recommendation errors behind default data that looks real.
- Model or source selection must remain explicit.

## Verification

```bash
npm exec --workspace=apps/web vitest -- run src/app/\(sourcing-ai\)/sourcing-ai/recommendations
```
