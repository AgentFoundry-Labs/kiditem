Consult this document first instead of relying on memorized knowledge.

# product-scraper — Alibaba/1688 Sourcing Extension

`extensions/product-scraper/` extracts Alibaba and 1688 product data and sends
it to the backend sourcing extension API.

## Folder Map

```text
product-scraper/
├── manifest.json
├── background.js              # service worker, extraction orchestration, API sync
├── host-bridge.js             # KidItem web app extension-id discovery
├── content.js                 # content-script message bridge and page detection
├── extractors/                # marketplace-specific DOM and page-data extractors
├── popup.html/js/css          # manual collection UI and API base setting
└── icons/
```

Node tests for this extension live outside the loadable extension root in
`extensions/tests/product-scraper/`. Chrome rejects unpacked extension roots
that contain `__tests__` or other `_`-prefixed committed paths.

## Owned Surfaces

- Alibaba/1688 DOM and page-data extraction
- Product-data sync to the sourcing extension ingest API
- Popup API-base setting and manual collection UI

## API Contract

- Default API base is `http://localhost:4000/api/sourcing/extension`.
- Committed web/API origins are local dev and staging:
  `http://localhost:3000`, `http://localhost:4000`, and
  `https://staging.merchon.org`.
- Product data sync posts to `/product-data`.
- Authorization uses the sourcing-only `kiditem_sourcing_ingest_token` in
  `chrome.storage.local`, minted by the backend for the logged-in KidItem web
  session and delivered through `chrome.runtime.sendMessage`.
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

- Host permissions stay limited to Alibaba, 1688, Tmall image CDN, local
  KidItem web app origins, and local backend origins.
- Do not add broad `*://*/*` permissions.
- Add new marketplace hosts only with a matching extractor and backend contract.
- Backend payload changes require checking `background.js` and the sourcing
  extension DTO/controller together.
