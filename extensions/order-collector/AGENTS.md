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
- Sellpia delivery-tracking lookup and order-file upload.
- Sellpia option-product inventory workbook download from the fixed
  `kiditem.sellpia.com` product-list contract.
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

- `collectSellpiaInventory` runs only against the inactive
  `https://kiditem.sellpia.com/product_list_total.html` page and posts fixed
  fields `downopt=2` and `downtype=excel` to
  `/product_search.down.html`. The existing `https://*.sellpia.com/*` host
  permission covers this authenticated same-origin request.
- Validate the observed `#div_prod_down #downForm` selector/request contract
  before downloading. Do not depend on translated visible labels for runtime
  selection.
- Accept bounded OLE2/XLSX envelopes and a fully walked raw BIFF worksheet
  stream. Raw BIFF requires a supported worksheet BOF, bounded records, LABEL
  evidence, and an exact terminal EOF with no trailing bytes.
- Only login attention retains an extension-created inactive Sellpia tab for
  the explicit generic open action. Never return cookies, credentials, response
  headers, DOM text, or raw error/response bodies.

## Verification

```bash
node -e "JSON.parse(require('fs').readFileSync('extensions/order-collector/manifest.json','utf8'))"
git diff --check -- extensions/order-collector
```
