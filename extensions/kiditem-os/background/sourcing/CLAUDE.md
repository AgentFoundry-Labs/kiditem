Before working in this directory, always read this document first rather than relying on memory.

# sourcing — shared source-attempt wire

Sourcing collection (1688 trends, live commerce, TikTok Creative Center, Coupang
keyword suggestions, Wing search, the popup's current-product capture) runs as
operation kinds `sourcing.*` in the TypeScript runtime: collectors in
`extensions/src/collectors/sourcing.*`, page reading in `extensions/src/sites/*`
(KID-360). This directory keeps only `source-attempt-wire.js`, the owner-attempt
HTTP and retry helper that Coupang and Orders source owners still load.

## Rules

- Keep `source-attempt-wire.js` owner-neutral: it carries attempt HTTP,
  correlation and transport retry; plan interpretation and failure policy stay
  in each caller.
- Add new sourcing collection only as a runtime kind under `extensions/src/`.
- Content scripts under `content/sourcing/` are injected by the runtime sites as
  files. Inject ISOLATED extractors before MAIN-world bridges; bridges only read
  page data and talk through serializable `window.postMessage` payloads. Never
  pass KidItem tokens, cookies, or backend secrets into MAIN-world scripts.
- Page-world `_detail_url` is untrusted: `sites/product-page/description.ts`
  fetches only HTTPS 1688/Alibaba hosts without credentials or non-default
  ports, with `redirect: 'error'`.
- Host permissions stay limited to Alibaba, 1688, Douyin, Jinritemai product
  links, Tmall image CDN, TikTok Ads, and KidItem origins.

## Verification

Inherits [`extensions/CLAUDE.md`](../../../CLAUDE.md#verification).
