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
- Coupang Rocket PA collection sends the selected active Rocket
  `channelAccountId`. The backend must persist `SourceImportRun`, `Order`, and
  `OrderLineItem`, link only rows matching the active Rocket workbook, and
  return a 17-column Sellpia workbook only for those rows. Both SHIPMENT and
  MILKRUN probes run even when one transport has no matching rows. Missing
  import/workflow headers or any linkage failure is a hard failure.
- Local generated file history and seen-row detection may use browser storage
  for operator convenience only.
- Before invoking the irreversible Sellpia extension submit, durably prepare
  an intent keyed by `{rocketWorkbookExportId, transport}`; the backend returns
  that stable key as the generated file ID. If preparation fails or returns
  `already_prepared`, do not invoke the extension. An `already_prepared` file
  with local `transmissionRequestedAt` retries only idempotent finalization;
  without that marker it remains blocked for operator verification.
  `{ submitted: true }`
  immediately finalizes a strictly newer freshness generation before local
  `transmissionRequestedAt` persistence and freshness/history invalidation.
  Only explicit `{ submitted: false }` aborts the intent for safe retry;
  extension errors and tab crashes remain unresolved and conservatively stale.
  Normalize legacy `sentAt` while reading only; new writes use
  `transmissionRequestedAt`.
- Mall account reads/writes go through route-local API helpers.
- Preserve the c9 collection shell in this order: header and upload modal,
  five-stage pipeline, daily summary plus activity, flat five-column mall-card
  grid, optional preview, then generated files.
- Every configured mall remains in the single flat card grid. Enabled
  extension-session malls remain collectable without stored credentials; only
  disabled or genuinely unsupported accounts require setup.
- Sellpia transmission-request state and actions render inside the existing
  generated-file flow. Inventory freshness may appear as a compact shared
  header status; do not replace or reorder the baseline collection layout.

## Boundary Rules

- Do not scrape marketplace pages from the web app directly.
- Do not treat localStorage or IndexedDB rows as durable order records.
- For PA, server `SourceImportRun` and `Order` rows are durable truth; local
  generated-file history is only a convenience cache.
- Rocket workflow completion requires all matched transport intents to be
  finalized and a newer verified Sellpia generation; collection alone does not
  complete or subtract stock.
- Do not expose unmasked personal data in preview tables unless backend and
  route policy explicitly allow it.
- Keep extension capabilities aligned with `extensions/order-collector`.
- Do not label an extension submit as accepted or completed, auto-resend it,
  debounce refresh requests in the client, mutate stock locally, or infer
  freshness. The server owns transmission settle/coalescing policy.

## Verification

```bash
npm exec --workspace=apps/web vitest -- run src/app/\(orders\)/order-collection
```
