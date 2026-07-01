Consult this document first instead of relying on memorized knowledge.

# web/coupang-shipments - Shipment Files and Extension Support

`coupang-shipments/` owns Coupang shipment helper UI, shipment extension
integration, generated shipment files, and browser download/print helpers.

## Owned Surfaces

- Coupang shipment file parsing/generation helpers
- Shipment extension bridge wrappers
- Local shipment file store and browser download flow

## State Rules

- Keep file parsing and projection helpers pure and covered by focused tests.
- Use `apiClient` for backend shipment APIs and extension bridge helpers for
  browser-side collection.
- Blob/download behavior may use browser APIs; durable shipment data remains
  backend-owned.

## Boundary Rules

- Do not update order or inventory status directly from local file helpers.
- Do not store shipment source-of-truth state only in browser storage.
- Extension behavior must stay aligned with `extensions/order-collector` or the
  relevant Coupang extension guide.

## Verification

```bash
npm exec --workspace=apps/web vitest -- run src/app/\(inventory\)/coupang-shipments
```
