Consult this document first instead of relying on memorized knowledge.

# web/return-scan — Barcode Input + Local Scan Log

`app/(orders)/return-scan/` owns the barcode-scanner return receiving UI. All
state is local and no mutation is sent to the server.

## Owned Surfaces

- Barcode input and Enter-to-submit flow
- Product search result display
- Local scan log table

## Scan Flow

```text
barcode input
  -> submitted state
  -> useQuery(queryKeys.inventory.snapshot({ query: submitted }))
  -> GET /api/inventory/sellpia-skus?query=X
  -> first matching product auto-select
  -> product info + local scan log append
```

The scan log is a client-side array and disappears on refresh. This is
intentional for fast receiving UX; durable return records belong to a separate
workflow.

## State Rules

- Product lookup is search-only through the Sellpia MasterProduct snapshot.
- Do not call product detail APIs by id.
- `ScanLogTable` columns are timestamp, barcode, product name, and status.
- Input field stays monospace for barcode readability.
- Each new scan resets sticky success/error messages.
- The first-result auto-select `useEffect` is an intentional scanner UX
  exception.

## Boundary Rules

- Do not persist scan results from this route.
- Do not introduce a keyboard-scanner abstraction library without a scoped
  plan; raw input + Enter is intentional.
- Search criteria changes require checking the page query key and backend
  product search behavior together.
