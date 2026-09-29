Before working in this directory, always read this document first rather than relying on memory.

# coupang — Coupang Wing + Ad-Center Domain

`extensions/kiditem-os/background/coupang/` supports explicit Wing page
automation and the popup. Ad-center collection is the runtime kind
`advertising.ad_report` (KID-371); approved campaign registrations are the
runtime kind `advertising.ad_action` (KID-386), claimed from the popup. Do not
add ad-center writes back to this worker or a content script.

## Owned Surfaces

- Extension popup/manual control UI
- Host bridge status exposed to committed KidItem web origins

## API Contract

- KidItem environment profiles are fixed: local web/API use
  `http://localhost:3000` / `http://localhost:4000`, office web/API use
  `http://kiditem-office`.
- Resolve the active profile from the verified external sender origin. Never
  trust a message-provided environment id or keep one global API/token pair.
- The Wing catalog is not collected here: it runs in the TypeScript operation
  runtime (`extensions/src/collectors/channels.wing_catalog_*`, KID-354). Wing
  traffic and item winner are runtime kinds too (`advertising.wing_traffic`,
  `advertising.wing_itemwinner`, KID-362); no content script runs on every Wing
  page.
- Tracked Wing products, Wing rank, public SERP rank, product-detail seller
  identity and seller-shop catalogs are not collected here either: they are
  the runtime kinds `advertising.*` (KID-362) on `sites/wing`,
  `sites/coupang-search`, `sites/coupang-product` and `sites/coupang-shop`.
- Authorization profiles use `kiditem_environment_profiles_v1` in
  `chrome.storage.local`; tokens and operational state stay environment-bound.

## Browser Boundary

- `externally_connectable` is limited to committed KidItem web origins.
- `content/host-bridge.js` may expose extension id and status only.
- Never expose `kiditem_auth_token` through host bridge or page-world messages.
- Marketplace DOM automation runs only on committed Wing, advertising, public
  Coupang search/product-detail, or server-selected seller-shop origins.
- Service worker owns long-running batch status in `chrome.storage.local`.
- Content scripts report results to the service worker instead of owning global
  progress.
- Wing registration waits for the bounded `wingFormReady` v2 probe on the exact
  final Wing URL before filling. Every command carries a `formSessionId`; the
  content script returns the same in-flight/completed result for duplicate IDs.

## Coupang Rules

- The runtime SERP site stays on Coupang search URLs; seller identity opens
  only the server-planned `www.coupang.com/vp/products/{id}` links and catalogs
  only the server-planned `shop.coupang.com` URLs, bounded and rate-limited.
- Do not add generic arbitrary URL fetch or navigation executors.
- Login-required states return explicit user-facing errors, not silent success.
- Keep action execution idempotent from the backend perspective.
- Do not store Coupang account credentials, cookies, or page session dumps.

## Environment Boundary

- One installed extension supports local and Office simultaneously.
- The popup requires an explicit environment selection when both profiles are
  authenticated and auto-selects only when exactly one profile is available.
- Follow `docs/runbooks/coupang-wing-catalog-collection.md` for local and Office
  browser acceptance.

## Verification

Inherits [`extensions/CLAUDE.md`](../../../CLAUDE.md#verification). The
Coupang tests are the narrow gate for this domain:

```bash
node --test extensions/tests/coupang-*.test.mjs extensions/tests/coupang-ads-scraper/*.test.mjs
node --check extensions/kiditem-os/background/coupang/worker.js
```

Action execution, auth token, host bridge, or manifest changes need a focused
manual browser check against the relevant Coupang surface.
