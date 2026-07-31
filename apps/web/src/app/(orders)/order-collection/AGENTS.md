Consult this document first instead of relying on memorized knowledge.

# web/order-collection - Marketplace Order Collection

`order-collection/` owns operator flows that collect marketplace order rows via
the order-collector extension or uploads, convert rows through backend APIs, and
manage local generated-file history.

## State Rules

- Extension collection goes through `lib/order-collection-extension.ts` and
  `@/lib/extension-bridge`.
- Session startup requires both `browserCollectionSessions` and
  `orderCollectionFailureEvidenceV1`. Preserve `ready`, `incompatible`, and
  `not_found` discovery states so a loaded stale extension reports its version
  and missing capabilities instead of being mislabeled as absent.
- Backend conversion/upload flows use `apiClient.fetchRaw()` for file/blob
  responses.
- Coupang Rocket PA collection sends the selected active Rocket
  `channelAccountId`. The backend must persist `SourceImportRun`, `Order`, and
  `OrderLineItem`, link exact rows matching the active Rocket workbook, and
  return a 17-column Sellpia workbook containing every collected row for the
  selected transport. Unmatched rows stay visible for operator selection. Both
  SHIPMENT and MILKRUN probes run; a non-empty response requires import and
  transmission headers, while workbook export linkage is optional.
- Local generated file history and seen-row detection may use browser storage
  for operator convenience only.
- Before invoking the irreversible Sellpia extension submit, durably prepare
  the backend key `rocket-final-order:{sourceImportRunId}:{transport}`; the
  generated file uses that stable key as its ID. The hard `already_prepared`
  block applies only to files that carry a backend-issued stable
  `transmissionIntentKey` (Rocket/Coupang-directship irreversible orders). For
  those, if preparation fails or returns `already_prepared` or
  `already_finalized`, do not invoke the extension unless an owner/admin
  explicitly confirms in the UI that Sellpia did not receive the file; that
  recovery records an audited `not_submitted` reconciliation, reopens the same
  stable intent key, and prepares it again before one retry, and without the
  confirmation the file stays blocked for operator verification. Simple mall
  files (KidKids and peers) key the intent by their unique generated file id, so
  a stray `already_prepared` there only means a prior attempt ended without a
  submission marker; the transmitter auto-records the `not_submitted`
  reconciliation, re-prepares, and resends without prompting, and the
  extension's own Sellpia order-history match is the duplicate safeguard. An
  already-finalized intent remains idempotent for every file.
  `{ submitted: true }` is valid only after the extension observes Sellpia
  upload evidence such as newly accepted pending rows. It immediately finalizes
  a strictly newer freshness generation before local
  `transmissionRequestedAt` persistence and freshness/history invalidation.
  Only explicit `{ submitted: false }` aborts the intent for safe retry;
  extension errors and tab crashes remain unresolved for operator verification
  but do not block other collection or inventory synchronization. An explicit
  Sellpia rejection displays the provider message and may offer manual inventory
  synchronization; it never automatically refreshes or resubmits.
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
  generated-file flow. Do not add a shared inventory freshness drawer or header
  status, and do not replace or reorder the baseline collection layout.
- Generated-file operations lock by file ID, not by the entire panel. Batch
  sends snapshot their selected IDs, overlapping actions are rejected, and
  disjoint files remain usable. Sellpia sends execute through one ordered queue
  so repeated clicks cannot overlap irreversible submissions.

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
- Require `sellpiaOrderFileUploadEvidenceV1` before sending an order file. Do
  not label a click without upload evidence as accepted or completed, auto-resend it,
  debounce refresh requests in the client, mutate stock locally, or infer
  freshness. The server owns transmission settle/coalescing policy.

## Verification

```bash
npm exec --workspace=apps/web vitest -- run src/app/\(orders\)/order-collection
```
