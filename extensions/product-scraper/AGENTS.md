# product-scraper - Alibaba/1688 Sourcing Extension

This extension extracts Alibaba and 1688 product data and sends it to the
sourcing extension API.

## Layout

```text
product-scraper/
  manifest.json
  background.js              service worker, extraction orchestration, API sync
  content.js                 content-script message bridge and page detection
  extractors/                marketplace-specific DOM and page-data extractors
  popup.html/js/css          manual collection UI and API base setting
  icons/
```

## API Contract

- Default API base is `http://localhost:4000/api/sourcing/extension`.
- Product data sync posts to `/product-data`.
- Extension ingest belongs to the backend sourcing domain.
- Do not write `MasterProduct` directly from extension code or payload naming.
- Product creation happens only after backend sourcing promotion.

## Extraction Rules

- `background.js` owns dynamic script injection and the 20s collection timeout.
- Inject content scripts before MAIN-world bridge scripts.
- `extractors/page-bridge.js` and `extractors/1688-bridge.js` run in MAIN world only to read page data.
- MAIN-world bridge scripts communicate through serializable `window.postMessage` payloads.
- Do not pass KidItem auth tokens, cookies, or backend secrets into MAIN-world scripts.
- `content.js` normalizes platform detection and forwards extracted data to the background worker.
- 1688 description fetching stays defensive: skip data URLs, icons, logos, and duplicate image URLs.

## Permissions

- Host permissions are limited to Alibaba, 1688, Tmall image CDN, and local backend origins.
- Do not add broad `*://*/*` permissions.
- Add new marketplace hosts only with a matching extractor and backend contract.

## Change Map

| Change | Also check |
|---|---|
| Backend sourcing payload | `background.js`, backend sourcing extension DTO/controller |
| New marketplace host | `manifest.json`, `extractors/`, `content.js` platform detection |
| 1688 detail parsing | `extractors/1688.js`, `extractors/1688-bridge.js`, `fetchDescriptionContent` |
| Popup API setting | `popup.js`, `background.js` `apiBase`, `manifest.json` host permissions |
