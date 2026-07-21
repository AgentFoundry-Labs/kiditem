Consult this document first instead of relying on memorized knowledge.

# order-collector — Marketplace Order Collection Extension

`extensions/order-collector/` automates supported marketplace order collection
from admin pages that are already open in the user's Chrome profile. It may
read visible order tables, trigger marketplace export UI, or call supported
marketplace export APIs from the user's active page session, then sends
structured rows or export files back to the KidItem web app for NestJS
conversion.

## Owned Surfaces

- Icecream Mall PO delivery inquiry grid capture.
- Coupang supplier ASN visible-row Label/statement download triggers.
- Supported marketplace order export capture, including Kakao Shopping Seller.
- Coupang Rocket purchase-order list/detail collection for purchase quantity
  previews and confirmation-workbook evidence.
- Sellpia delivery-tracking lookup and order-file upload.
- Sellpia 판매현황(sale_summary) 몰별·일별 매출 조회(읽기 전용) + `chrome.alarms`
  매일 자동수집 캐시(웹앱이 백엔드로 flush).
- Sellpia 상품별 이익현황(stat_prd_profit) 상품×월별 소진(판매수량) 조회(읽기 전용).
- Sellpia option-product inventory full-snapshot collection from the fixed
  authenticated `kiditem.sellpia.com` product-search JSON contract.
- Domeggook and Onchannel tracking registration initiated from the KidItem
  order-collection page.
- KidItem localhost extension-id discovery for order operations only.

## Browser Boundary

- Host permissions stay exact to the supported marketplace origins.
- Do not persist, log, return, forward, commit, or store marketplace session
  tokens, cookies, passwords, or browser credential-store values.
- A supported marketplace collector may read a marketplace session token only
  transiently when that marketplace's export API requires it. Use the token only
  for same-marketplace origin requests, keep it in function scope, and never
  include it in extension responses to KidItem.
- Extension responses to the web app and backend carry only export artifacts,
  structured order data, and non-secret metadata such as `xlsxBase64`,
  `csvBase64`, file names, counts, and rows. Backend conversion, analysis, and
  auth remain owned by the KidItem web app and NestJS API; marketplace tokens
  must never be sent to KidItem.
- Destructive marketplace actions such as tracking registration require an
  explicit confirmation in the KidItem web page before the allowlisted action
  is sent to the extension.
- Do not send `organizationId`; backend auth/session scope owns organization
  context.

## Sellpia Inventory Contract

- Advertise `collectSellpiaInventoryJsonV1` only for the hardened inactive-tab,
  managed-lifecycle JSON collector. The web app must reject an older unpacked
  extension and request a reload instead of falling back to an Excel collector.
- `collectSellpiaInventory` runs only against the inactive
  `https://kiditem.sellpia.com/product_list_total.html` page and posts the fixed
  `mode=soldout_manager`, `soldout_include=Y`, and `limit=0` full-snapshot
  request to `/product_search.ajax.html`. The existing
  `https://*.sellpia.com/*` host permission covers this authenticated
  same-origin request.
- Reuse requires an exact matching tab with `active === false`. If every match
  is active, create a separate inactive managed tab; never execute the download
  request in the user's foreground tab.
- The `inventory.sellpia` lifecycle requires a valid caller run ID and forces
  deferred terminal handling even when an untrusted message omits or falsifies
  `deferTerminal`. Successful collection stays running until import
  finalization.
- Attach extension-created tabs to the run as owned immediately after creation,
  before readiness checks or page execution, so restart and cancellation can
  reclaim them.
- Accept only a bounded, non-empty response of at most 20,000 rows. Every row
  must have a valid product/option identity and bounded stock/price integers;
  duplicate identities, partial rows, invalid JSON, and oversized responses
  fail the run.
- Return only the versioned normalized snapshot fields required by Inventory,
  sorted by product-option identity with an exact `rowCount`. Never return the
  raw Sellpia response, response headers, cookies, or credentials.
- Only login attention retains an extension-created inactive Sellpia tab for
  the explicit generic open action. Never return cookies, credentials, response
  headers, DOM text, or raw error/response bodies.

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
- Collect at most 20 list pages and 40 PO details per run. Limit exhaustion,
  detail failure, or an empty detail response is incomplete evidence and must
  block preview publication in the backend.
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

## Verification

```bash
node -e "JSON.parse(require('fs').readFileSync('extensions/order-collector/manifest.json','utf8'))"
git diff --check -- extensions/order-collector
```
