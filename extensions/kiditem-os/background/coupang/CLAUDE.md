Before working in this directory, always read this document first rather than relying on memory.

# coupang — Coupang Wing + Ad-Center Domain

`extensions/kiditem-os/background/coupang/` collects Coupang ad-center
data plus public Coupang search evidence, executes approved campaign
registrations, and supports explicit Wing page automation.

## Owned Surfaces

- Coupang ad-center scrape and approved campaign-registration execution
- Public Coupang keyword SERP collection, bounded product-detail seller
  resolution, and server-selected seller-shop catalog collection
- Extension popup/manual control UI
- Host bridge status exposed to committed KidItem web origins

## API Contract

- KidItem environment profiles are fixed: local web/API use
  `http://localhost:3000` / `http://localhost:4000`, office web/API use
  `http://kiditem-office`.
- Resolve the active profile from the verified external sender origin. Never
  trust a message-provided environment id or keep one global API/token pair.
- Ad-center collection uses its named source-owner attempt APIs; the retired
  generic extension sync endpoint is not a producer path.
- Approved queued ad actions are fetched from `/api/ads/actions`.
- The Wing catalog is not collected here: it runs in the TypeScript operation
  runtime (`extensions/src/collectors/channels.wing_catalog_*`, KID-354). Wing
  traffic and item winner are runtime kinds too (`advertising.wing_traffic`,
  `advertising.wing_itemwinner`, KID-362); no content script runs on every Wing
  page.
- Every chunk and terminal request of an ad-center attempt carries the
  server-issued attempt ID/token and uses the owner's deterministic receipt
  identity. Replays are safe; stale, expired, or post-terminal mutations stop
  the worker and leave the prior complete snapshot untouched.
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
- A missing managed collection window may be replaced only while the same
  owner-issued attempt token remains valid. Never adopt an arbitrary user tab,
  cross an environment/producer owner boundary, or loop window replacement.

## Coupang Rules

- Ad keyword collection (`advertising.ad_keyword`) reads the ad centre's own
  JSON APIs from the content script (isolated world) and never navigates:
  `tetris-api/campaigns` for the campaign roster and its `groupList`,
  `tetris-api/campaign/{id}/ad-group/{id}` for the ad -> vendorItemId map, and
  `cmg-api/tableMetric` (`tableType='keyword'`) for the keyword table. Do not
  reopen the modal and scrape its DOM. A one-day metric window returns nothing,
  so always ask for a trailing multi-day window and send explicit
  `startDate`/`endDate`. The sweep is budgeted per run and resumes from
  sessionStorage, so a large account completes across several runs.
- Ad action execution stays on `advertising.coupang.com` and applies only
  `create_campaign`. Write to Coupang only after the server accepts the
  action's claim (its running report). The
  server refuses every claim for the actions the operator applies by hand with
  `EXECUTION_REPORT_MANUAL_ACTION` (`MANUAL_AD_ACTION_TYPES` in
  `apps/server/src/advertising/domain/execution-task-lifecycle.ts`).
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
