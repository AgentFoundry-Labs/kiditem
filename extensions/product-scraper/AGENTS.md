Consult this document first instead of relying on memorized knowledge.

# product-scraper — Alibaba/1688 Sourcing Extension

`extensions/product-scraper/` extracts Alibaba and 1688 product data plus
operator-opened 1688/Douyin live-commerce pages and sends the results to the
backend sourcing extension API.

Node tests for this extension live outside the loadable extension root in
`extensions/tests/product-scraper/`. Chrome rejects unpacked extension roots
that contain `__tests__` or other `_`-prefixed committed paths.

## Owned Surfaces

- Alibaba/1688 DOM and page-data extraction
- Product-data sync to the sourcing extension ingest API
- 1688/Douyin live broadcast and exposed-product snapshots from logged-in pages
- Popup API-base setting and manual collection UI

## API Contract

- Default API base is `http://localhost:4000/api/sourcing/extension`.
- Committed web/API origins are local dev and staging:
  `http://localhost:3000`, `http://localhost:4000`, and
  `https://staging.merchon.org`.
- Product data sync posts to `/product-data`.
- Live-commerce snapshots post to `/trend/live-commerce-results`.
- Authorization uses the current Supabase access token delivered by the
  logged-in KidItem web tab through `chrome.runtime.sendMessage` and stored in
  `chrome.storage.local` for extension API calls. Do not reintroduce a separate
  sourcing-only token route or middleware.
- Extension ingest belongs to the backend sourcing domain.
- Product creation happens only after backend sourcing promotion.
- Extension code and payload naming must not imply direct `MasterProduct`
  writes.

## Extraction Rules

- `background.js` owns dynamic script injection and the 20s collection timeout.
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

## Boundary Rules

- Host permissions stay limited to Alibaba, 1688, Douyin, Jinritemai product
  links, Tmall image CDN, local KidItem web app origins, and local backend
  origins. Douyin is required for the operator-opened live room; Jinritemai is
  required only for product links rendered inside that room.
- Do not add broad `*://*/*` permissions.
- Add new marketplace hosts only with a matching extractor and backend contract.
- Backend payload changes require checking `background.js` and the sourcing
  extension DTO/controller together.

## Verification

For product-scraper changes, run the extension test and syntax check:

```bash
node --test extensions/tests/product-scraper/*.test.mjs
git diff --check -- extensions/product-scraper extensions/tests/product-scraper
```

Extractor, payload, host permission, or token-bridge changes need a focused
fixture or test for the changed browser boundary.
