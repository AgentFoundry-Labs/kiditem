Consult this document first instead of relying on memorized knowledge.

# web/sourcing-ai/routes - Sourcing Research Routes

`sourcing-ai/` is the nested route surface for sourcing research and candidate
selection. It coordinates keyword research, market analysis, recommendation,
validation, Wing catalog, 1688 search, and final selection helpers.

## State Rules

- Keep sourcing API wrappers under route-local `lib/` unless another route group
  imports them.
- Use `queryKeys.sourcing.*` when source candidates or scrape status are shared
  across components.
- Local caches may improve operator UX but must not become source-of-truth for
  candidate promotion.
- Keep ranking/matching helpers pure and covered by focused tests.

## Boundary Rules

- Do not mutate catalog master products directly from sourcing routes.
- Do not add silent model fallbacks.
- Extension-backed collection must use the focused extension bridge helper and
  stay aligned with the relevant extension guide.

## Verification

```bash
npm run build --workspace=apps/web
```
