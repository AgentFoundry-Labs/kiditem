# orders — Marketplace Order Collection Domain

`extensions/kiditem-os/background/orders/` automates marketplace order collection
from admin pages already open in the user's Chrome profile. It may read visible
order tables, trigger export UI, or call marketplace export APIs from the user's
active page session, then sends structured rows or export files back to the
KidItem web app for NestJS conversion.

## Owned Surfaces

Marketplace order exports, Rocket PO evidence, Sellpia inventory/sales/profit
reads, Sellpia order upload/tracking lookup, supported tracking registration,
cookie recovery, and versioned failure evidence live here. Use `rg --files` for
the collector inventory.

## Browser Boundary

- Resolve the KidItem environment from the verified external sender origin and
  bind every run, status lookup, cancellation, tab, alarm, and callback to that
  environment. Local and Office may run concurrently in one installed copy.
- Host permissions stay exact to the supported marketplace origins.
- Do not persist, log, return, forward, commit, or store marketplace session
  tokens, cookies, passwords, or browser credential-store values.
- Marketplace tokens are transient, function-scoped, and same-origin only;
  never persist, log, return, or send them to KidItem. Responses contain only
  export artifacts, structured rows, and non-secret metadata.
- Destructive marketplace actions such as tracking registration require an
  explicit confirmation in the KidItem web page before the allowlisted action
  is sent to the extension.
- The `cookies` permission backs only `clearCoupangCookies`, the
  supplier.coupang.com 400-recovery action, and may touch no other origin. It is
  destructive — clearing the shared `.coupang.com` cookies signs the operator out
  of every Coupang portal (supplier/WING/Rocket), so it requires an explicit
  KidItem web-page confirmation stating that blast radius. Remove cookies by
  name/path only; never read, return, forward, or store cookie values.

## Collection Failure Contract

- Return explicit zero (`success: true`, `empty: true`, `rowCount: 0`) only when
  authenticated content proves it. Missing, invalid, unloaded, or bare-404
  content is `provider_contract_changed`; auth evidence is `login_required`.
- Advertise `orderCollectionFailureEvidenceV1` only when every failure includes
  `provider`, `action`, `code`, `retryable`, and `operatorAction`. Stable codes
  are `login_required`, `operator_action_required`,
  `provider_contract_changed`, `network_failed`, and `unknown_failure`;
  provider text is display-only. Match SMS/OTP verification before login.
- The web app must distinguish a pinging but incompatible extension from a
  missing extension and show the loaded version plus missing capabilities.

## Sellpia Inventory Contract

- Advertise `collectSellpiaInventoryJsonV1` only for the managed inactive-tab
  JSON collector; reject legacy extensions instead of falling back to Excel.
- `collectSellpiaInventory` uses the inactive `product_list_total.html` page
  and fixed `soldout_manager`, `soldout_include=Y`, `limit=0` full-snapshot
  request to `/product_search.ajax.html` under the existing Sellpia permission.
- Reuse requires an exact matching tab with `active === false`. If every match
  is active, create a separate inactive managed tab; never execute the download
  request in the user's foreground tab.
- The `inventory.sellpia` lifecycle requires a valid caller run ID and forces
  deferred terminal handling even when an untrusted message omits or falsifies
  `deferTerminal`. Successful collection stays running until import
  finalization.
- Attach created tabs to the run before checks or execution so restart and
  cancellation can reclaim them.
- Accept 1–20,000 rows with valid identities and bounded stock/price integers;
  duplicates, partial rows, invalid JSON, or overflow fail the run.
- Return only versioned normalized rows sorted by identity with exact
  `rowCount`; never return raw responses, headers, cookies, or credentials.
- Only login attention retains a created inactive tab for the generic open
  action; never expose DOM text or raw error/response bodies.

## Sellpia Product-Profit Evidence Contract

- `collectSellpiaProductProfitEvidenceV1` means full-range, `buy_point=R`,
  VAT-included order-time cost with bounded zero-filled months.
- Only `scope=full` OperationRuns collect and ingest this evidence through
  NestJS before inventory publication; `inventory` never scrapes it.
- Malformed, partial, duplicate, or oversized evidence fails the whole read.

## Rocket Purchase-Order Collection Contract

- Summary and detail collection share `background/coupang-po-session.js`. A
  generic Supplier Hub dashboard tab is never a valid PO execution context;
  create an inactive managed `/scm/purchase/order/list` bootstrap tab and wait
  for the final `/po-web/purchase/order/*` route before calling PO APIs.
- A structured `coupang_po_session_required` result may trigger exactly one
  fresh managed-tab retry. Do not loop, return raw redirects, or surface the
  browser's generic `Failed to fetch` as the operator error.
- `collectRocketPoRows` delegates to the extracted
  `background/rocket-po-collection.js` collector. Keep marketplace DOM/API
  knowledge out of the service-worker dispatcher.
- Advertise `collectRocketPoRowsEvidenceV1` only when the response includes the
  complete evidence object below. The web app must reject and ask the operator
  to reload an older unpacked extension instead of treating its legacy rows as
  preview input.
- The web app creates the collection `runId`; the extension must echo that exact
  ID with structured evidence for list pages read, detail PO count, failed PO
  numbers, and truncation.
- Collect every provider-reported list page and every PO detail in the requested
  range with bounded detail concurrency. A page/detail failure or an empty
  detail response is incomplete evidence and must block preview publication in
  the backend; never silently truncate a complete provider result.
- Advertise `collectRocketPoRowsConfirmationV1` only when every publishable row
  also carries the allowlisted official-workbook fields collected from the
  authenticated Rocket list/detail response. Do not synthesize missing fields
  from display text or let the web app confirm without them.
- Use the non-display Rocket `vendorId` as identity. Missing or mixed vendor IDs
  return no publishable rows; never fall back to vendor names or display text.
- Every detail line carries a deterministic `poLineId` so collection retries
  can be hashed and compared independently of row order.
- This capability collects evidence only. It must not confirm a Rocket PO,
  submit quantities, reserve stock, or mutate Sellpia inventory.

## Sellpia Order-File Upload Contract

- Advertise `sellpiaOrderFileUploadEvidenceV1` only when the worker waits for
  Sellpia upload evidence after `#btn_om_upload` instead of treating the click
  itself as success. The web app must ask the operator to reload an older
  extension that lacks this capability.
- Pre-click validation failures return `not_submitted`. Once the upload button
  has been clicked, a missing response, Sellpia rejection dialog, timeout, or
  tab loss is uncertain unless newly accepted pending rows are observed.
- An uncertain submit must be resolved by reading Sellpia itself instead of
  asking the operator. Look the transmitted order numbers up in the
  `order_collect` pending list and then `order_stockmatch`, matching order
  number and capturing the recipient as evidence. That lookup is read-only: it
  may click only the stockmatch search button and must not register, merge,
  match stock, or number invoices. All targets found becomes `submitted` with
  `verifiedBySellpiaLookup`; none found becomes `not_submitted` so the file can
  be resent safely; a partial match stays `unknown` because resending would
  duplicate orders. Without target order numbers there is no verdict.
- A successful response includes bounded non-secret accepted/pending row counts.
  It never claims that `#save_b` registration or inventory matching completed.

## Verification

The order-collection tests are the narrow local gate:

```bash
node --test extensions/tests/order-collector-*.test.mjs
node --check extensions/kiditem-os/background/orders/worker.js
```
