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
- Successful Sellpia submission persists local `transmissionRequestedAt`, then
  requests `order_transmission_requested`, then invalidates freshness/history.
  Normalize legacy `sentAt` while reading only; new writes use
  `transmissionRequestedAt`.
- Mall account reads/writes go through route-local API helpers.
- Every mall account is classified exactly once from connection and collection
  state under `조치 필요`, `수집 가능`, or `설정 필요`; display text is not a
  classification input. Enabled extension-session malls remain collectable
  without stored credentials; only disabled or genuinely unsupported accounts
  require setup.
- Recovery states (`Sellpia 전송 필요`, `전송 요청됨`, `재고 반영 대기`) and
  actions render before activity charts in the canonical collection workspace.

## Boundary Rules

- Do not scrape marketplace pages from the web app directly.
- Do not treat localStorage or IndexedDB rows as durable order records.
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
