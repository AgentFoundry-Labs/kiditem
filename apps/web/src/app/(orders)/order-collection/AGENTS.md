Consult this document first instead of relying on memorized knowledge.

# web/order-collection - Marketplace Order Collection

`order-collection/` owns operator flows that collect marketplace order rows via
the order-collector extension or uploads, convert rows through backend APIs, and
manage local generated-file history.

## State Rules

- Extension collection goes through `lib/order-collection-extension.ts` and
  `@/lib/extension-bridge`.
- Backend conversion/upload flows use `apiClient.fetchRaw()` for file/blob
  responses.
- Local generated file history and seen-row detection may use browser storage
  for operator convenience only.
- Mall account reads/writes go through route-local API helpers.

## Boundary Rules

- Do not scrape marketplace pages from the web app directly.
- Do not treat localStorage or IndexedDB rows as durable order records.
- Do not expose unmasked personal data in preview tables unless backend and
  route policy explicitly allow it.
- Keep extension capabilities aligned with `extensions/order-collector`.

## Verification

```bash
npm exec --workspace=apps/web vitest -- run src/app/\(orders\)/order-collection
```
