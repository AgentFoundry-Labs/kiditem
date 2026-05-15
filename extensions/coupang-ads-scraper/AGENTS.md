# coupang-ads-scraper - Coupang Wing And Ad-Center Extension

This extension collects Coupang Wing and ad-center data, executes approved ad
actions, and supports Wing image/thumbnail automation.

## Layout

```text
coupang-ads-scraper/
  manifest.json
  background/service-worker.js    alarms, auth token, tabs, API sync, batch jobs
  content/                        Wing/ad-center parsers and marketplace actions
  popup/                          side-panel UI and manual controls
  utils/api.js                    shared KidItem API helper
  utils/dom.js                    shared content-script DOM helpers
  icons/
```

## API Contract

- Default KidItem API origin is `http://localhost:4000`.
- Data sync posts to `/api/ads/extension/sync`.
- Approved queued ad actions are fetched from `/api/ads/actions`.
- Image sync targets are fetched from `/api/ads/scrape-targets`.
- Authorization uses `kiditem_auth_token` from `chrome.storage.local`.
- Do not send `organizationId`; backend auth resolves organization scope.

## Browser Boundary

- `externally_connectable` is limited to committed KidItem web origins.
- `content/host-bridge.js` may expose extension id and status to KidItem web only.
- Never expose `kiditem_auth_token` through host-bridge or page-world messages.
- Marketplace DOM automation runs only on Wing or advertising Coupang origins.
- Service worker owns long-running batch status in `chrome.storage.local`.
- Content scripts should report results to the service worker instead of owning global progress.

## Coupang Rules

- Wing inventory/image sync stays on Wing inventory URLs.
- Ad action execution stays on `advertising.coupang.com`.
- Do not add generic arbitrary URL fetch or navigation executors.
- Login-required states must return explicit user-facing errors, not silent success.
- Keep action execution idempotent from the backend perspective.
- Do not store Coupang account credentials, cookies, or page session dumps.

## Staging Variants

- Committed manifest is for local/dev origins.
- Staging unpacked variants belong under `.secrets/extensions/`.
- Follow `docs/runbooks/playwriter-wing-image-sync.md` when staging origins or extension ids change.

## Change Map

| Change | Also check |
|---|---|
| Sync payload shape | `content/*`, `utils/api.js`, backend advertising ingest DTO |
| Auth token flow | `popup/popup.js`, `background/service-worker.js`, `content/host-bridge.js` |
| Batch image sync | `background/service-worker.js`, `content/wing-inventory-scraper.js` |
| Thumbnail registration | `content/wing-thumbnail-register.js`, `background/service-worker.js` |
| Ad action execution | `content/ads-report.js`, backend ad action status contract |
