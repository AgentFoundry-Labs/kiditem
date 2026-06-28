# order-collector — Marketplace Order Collection Extension

`extensions/order-collector/` reads order tables from marketplace admin pages
that are already open in the user's Chrome profile and sends structured rows
back to the KidItem web app.

## Owned Surfaces

- Icecream Mall PO delivery inquiry grid capture.
- Coupang supplier ASN visible-row Label/statement download triggers.
- KidItem localhost extension-id discovery for order collection only.

## Browser Boundary

- Host permissions stay exact to the supported marketplace origins.
- The extension must not read cookies, passwords, local storage session data,
  or browser credential stores.
- The extension returns visible table data only; backend conversion and auth
  remain owned by the KidItem web app and NestJS API.
- Do not send `organizationId`; backend auth/session scope owns organization
  context.

## Verification

```bash
node -e "JSON.parse(require('fs').readFileSync('extensions/order-collector/manifest.json','utf8'))"
git diff --check -- extensions/order-collector
```
