# sourcing — Alibaba/1688 Sourcing Domain

`background/sourcing/` owns supplier-product, trend, and live-commerce capture.
Source owners on the server validate and publish the captured data.

## API Contract

- Use the verified KidItem environment and shared authentication handoff;
  source modules do not introduce their own auth routes or credentials.
- Begin through the source-specific owner, follow its frozen plan, and submit
  to that attempt with `x-source-attempt-token`. Persist only attempt ID and
  idempotency correlation for recovery; keep the token in memory.
- Share owner HTTP, correlation and transport retry mechanics in the existing
  source wire helper. Keep plan interpretation, extraction, normalization and
  collection failure policy in each collector.
- Preserve collector URLs, targets/counts, region, pagination, deduplication,
  field mapping and timeout/retry semantics during lifecycle changes. Prove
  target-plan and normalized-output parity with characterization tests.
- Treat collected products as Sourcing candidates. Catalog promotion is a
  separate backend owner action; no payload implies direct `MasterProduct`
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
- Capture the existing attempt ID per extraction invocation and validate the
  tab/environment/attempt on returned events before terminal submission. An
  old same-tab event cannot complete a newer extraction.
- 1688 description fetching skips data URLs, icons, logos, and duplicate image
  URLs.
- Office CDP owns server-side 1688 keyword/image batches. Preserve its browser
  profile and collection policy; extension transport does not introduce a
  fresh-profile fallback or navigate/close an operator-owned tab.
- Page-world `_detail_url` is untrusted input. `url-policy.js` must be loaded
  before `worker.js`; call only `KiditemSourcingUrlPolicy.parseAllowedSupplierUrl`
  and use `fetch(..., { redirect: 'error', credentials: 'include' })`. Do not
  fetch localhost, literal IPs, userinfo URLs, non-HTTPS URLs, non-default
  ports, or hosts outside the reviewed 1688/Alibaba suffix allowlist.

## Boundary Rules

- Host permissions stay limited to Alibaba, 1688, Douyin, Jinritemai product
  links, Tmall image CDN, local KidItem web app origins, and local backend
  origins. Douyin is required for the operator-opened live room; Jinritemai is
  required only for product links rendered inside that room.
- Do not add broad `*://*/*` permissions.
- Add new marketplace hosts only with a matching extractor and backend contract.
- Payload changes require checking the actual collector, focused shared schema
  and owner DTO/controller together. Preserve the product extractor's
  snake_case commercial fields rather than introducing a parallel wire version.

## Verification

Inherits [`extensions/AGENTS.md`](../../../AGENTS.md#verification). The
sourcing tests are the narrow gate for this domain:

```bash
node --test extensions/tests/product-scraper/*.test.mjs
node --check extensions/kiditem-os/background/sourcing/worker.js
```

Extractor, payload, host permission, or token-bridge changes need a focused
fixture or test for the changed browser boundary.
