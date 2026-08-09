Consult this document first instead of relying on memorized knowledge.

# sourcing — Alibaba/1688 Sourcing Domain

`extensions/kiditem-os/background/sourcing/` extracts Alibaba and 1688 product data plus
operator-opened 1688/Douyin live-commerce pages and sends the results to the
backend sourcing extension API.

Node tests for this extension live outside the loadable extension root in
`extensions/tests/product-scraper/`. Chrome rejects unpacked extension roots
that contain `__tests__` or other `_`-prefixed committed paths.

## Owned Surfaces

- Alibaba/1688 DOM and page-data extraction
- Product-data sync to the sourcing extension ingest API
- 1688/Douyin live broadcast and exposed-product snapshots from logged-in pages
- TikTok Creative Center trend snapshots (hashtags, top products, keywords)
- Popup API-base setting and manual collection UI

## API Contract

- Default API base is `http://localhost:4000/api/sourcing/extension`.
- Committed web/API origins are local dev and Office:
  `http://localhost:3000`, `http://localhost:4000`,
  and `http://kiditem-office`.
- Product data sync posts to `/product-data`.
- Live-commerce snapshots post to `/trend/live-commerce-results`.
- TikTok Creative Center reads targets from `/trend/tiktok-cc-targets` and posts
  snapshots to `/trend/tiktok-cc-results`.
- Authorization uses the current KidItem opaque session token delivered by the
  logged-in KidItem web tab through `chrome.runtime.sendMessage` and stored in
  `chrome.storage.local` for extension API calls. Do not reintroduce a separate
  sourcing-only token route or middleware.
- Extension ingest belongs to the backend sourcing domain.
- Product creation happens only after backend sourcing promotion.
- Extension code and payload naming must not imply direct `MasterProduct`
  writes.

## Extraction Rules

- `worker.js` owns dynamic script injection and the 20s collection timeout.
- Inject content scripts before MAIN-world bridge scripts.
- `extractors/page-bridge.js` and `extractors/1688-bridge.js` run in MAIN world
  only to read page data.
- MAIN-world bridge scripts communicate through serializable
  `window.postMessage` payloads.
- Do not pass KidItem auth tokens, cookies, or backend secrets into MAIN-world
  scripts or `host-bridge.js` page messages.
- `content.js` normalizes platform detection and forwards extracted data to the
  background worker.
- 1688 description fetching skips data URLs, icons, logos, and duplicate image
  URLs.
- Page-world `_detail_url` is untrusted input. `url-policy.js` must be loaded
  before `worker.js`; call only `KiditemSourcingUrlPolicy.parseAllowedSupplierUrl`
  and use `fetch(..., { redirect: 'error', credentials: 'include' })`. Do not
  fetch localhost, literal IPs, userinfo URLs, non-HTTPS URLs, non-default
  ports, or hosts outside the reviewed 1688/Alibaba suffix allowlist.

## Boundary Rules

- Host permissions stay limited to Alibaba, 1688, Douyin, Jinritemai product
  links, `ads.tiktok.com` (TikTok Creative Center Trends), Tmall image CDN, local
  KidItem web app origins, and local backend origins. Douyin is required for the
  operator-opened live room; Jinritemai is required only for product links
  rendered inside that room. `ads.tiktok.com` hosts the bot/region-gated Creative
  Center, whose own `creative_radar_api` responses are captured by a MAIN-world
  hook (`tiktok-cc-hook.js`) that never receives KidItem tokens or backend URLs.
- Do not add broad `*://*/*` permissions.
- Add new marketplace hosts only with a matching extractor and backend contract.
- Backend payload changes require checking `worker.js`, the shared v1/v2
  sourcing schema, and the server DTO/controller together. Deployed v1 keeps
  snake_case commercial field names; new producers use the strict v2 endpoint.

## Verification

Inherits [`extensions/kiditem-os/AGENTS.md`](../../AGENTS.md#verification). The
sourcing tests are the narrow gate for this domain:

```bash
node --test extensions/tests/product-scraper/*.test.mjs
node --check extensions/kiditem-os/background/sourcing/worker.js
```

Extractor, payload, host permission, or token-bridge changes need a focused
fixture or test for the changed browser boundary.
