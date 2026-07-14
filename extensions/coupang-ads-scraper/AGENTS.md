Consult this document first instead of relying on memorized knowledge.

# coupang-ads-scraper — Coupang Wing + Ad-Center Extension

`extensions/coupang-ads-scraper/` collects Coupang Wing, ad-center, and public
Coupang search evidence, executes approved ad actions, and supports Wing
image/thumbnail automation.

## Owned Surfaces

- Coupang Wing scrape and image/thumbnail automation
- Coupang ad-center scrape and approved action execution
- Public Coupang keyword SERP collection, bounded product-detail seller
  resolution, and server-selected seller-shop catalog collection
- Extension popup/manual control UI
- Host bridge status exposed to committed KidItem web origins

## API Contract

- Default KidItem API origin is `http://localhost:4000`.
- Data sync posts to `/api/ads/extension/sync`.
- Approved queued ad actions are fetched from `/api/ads/actions`.
- Image sync targets are fetched from `/api/ads/scrape-targets`.
- Authorization uses `kiditem_auth_token` from `chrome.storage.local`.
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

- Wing inventory/image sync stays on Wing inventory URLs.
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

## Transitional Exceptions

- Committed manifest is for local/dev origins. Staging unpacked variants belong
  under `.secrets/extensions/`.
- Follow `docs/runbooks/playwriter-wing-image-sync.md` when staging origins or
  extension ids change.

## Verification

For coupang-ads-scraper changes, run the extension syntax check:

```bash
git diff --check -- extensions/coupang-ads-scraper
```

Action execution, image sync, auth token, host bridge, or manifest changes need
a focused manual browser check against the relevant Coupang surface.
