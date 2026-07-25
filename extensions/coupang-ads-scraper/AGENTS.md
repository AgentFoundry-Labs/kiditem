Consult this document first instead of relying on memorized knowledge.

# coupang-ads-scraper — Coupang Wing + Ad-Center Extension

`extensions/coupang-ads-scraper/` collects Coupang Wing catalog and ad-center
data plus public Coupang search evidence, executes approved ad actions, and
supports explicit Wing page automation.

## Owned Surfaces

- Resumable Coupang Wing full-catalog collection: products, sellable options,
  and provider media
- Coupang ad-center scrape and approved action execution
- Public Coupang keyword SERP collection, bounded product-detail seller
  resolution, and server-selected seller-shop catalog collection
- Extension popup/manual control UI
- Host bridge status exposed to committed KidItem web origins

## API Contract

- KidItem environment profiles are fixed: local web/API use
  `http://localhost:3000` / `http://localhost:4000`, and staging web/API use
  `https://staging.merchon.org`.
- Resolve the active profile from the verified external sender origin. Never
  trust a message-provided environment id or keep one global API/token pair.
- Data sync posts to `/api/ads/extension/sync`.
- Approved queued ad actions are fetched from `/api/ads/actions`.
- Full catalog collection uses the account-scoped
  `/api/channels/accounts/:channelAccountId/catalog-imports/coupang-wing/runs`
  start/status/chunk/finalize contract.
- Authorization profiles use `kiditem_environment_profiles_v1` in
  `chrome.storage.local`; tokens and operational state stay environment-bound.
- Do not send `organizationId`; backend auth resolves organization scope.

## Browser Boundary

- `externally_connectable` is limited to committed KidItem web origins.
- `content/host-bridge.js` may expose extension id and status only.
- Never expose `kiditem_auth_token` through host bridge or page-world messages.
- Marketplace DOM automation runs only on committed Wing, advertising, public
  Coupang search/product-detail, or server-selected seller-shop origins.
- Service worker owns long-running batch status in `chrome.storage.local`.
- Content scripts report results to the service worker instead of owning global
  progress.

## Coupang Rules

- Wing catalog collection stays on Wing inventory and product-detail URLs.
- Ad action execution stays on `advertising.coupang.com`.
- Public SERP collection stays on Coupang search URLs; seller enrichment may
  fetch only exact `www.coupang.com/vp/products/{id}` links discovered in that
  SERP and must remain bounded and rate-limited.
- Seller-shop catalog collection stays on exact `shop.coupang.com` URLs selected
  by the backend from resolved competitor identities and must remain bounded.
- Do not add generic arbitrary URL fetch or navigation executors.
- Login-required states return explicit user-facing errors, not silent success.
- Keep action execution idempotent from the backend perspective.
- Do not store Coupang account credentials, cookies, or page session dumps.

## Environment Boundary

- One installed extension supports local and staging simultaneously.
- The popup requires an explicit environment selection when both profiles are
  authenticated and auto-selects only when exactly one profile is available.
- Follow `docs/runbooks/coupang-wing-catalog-collection.md` for local and
  staging browser acceptance.

## Verification

For coupang-ads-scraper changes, run the extension syntax check:

```bash
node --test extensions/tests/*.test.mjs
node --check extensions/coupang-ads-scraper/background/service-worker.js
git diff --check -- extensions/coupang-ads-scraper
```

Action execution, catalog collection, auth token, host bridge, or manifest
changes need a focused manual browser check against the relevant Coupang
surface. Catalog collection must preserve accepted chunks across service-worker
suspension and advertise `coupangCatalogSnapshot = true` to KidItem.
