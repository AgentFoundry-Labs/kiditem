Before working in this directory, always read this document first rather than relying on memory.

# extensions — Chrome Extension

`extensions/` owns one loadable Manifest V3 extension,
`kiditem-os/`, for marketplace collection and browser-side operations. Orders,
Coupang, and sourcing are domains inside that worker; do not recreate separate
loadable extension roots.

`shared/collection-session.js` and `shared/environment-context.js` are the
canonical shared adapters. Edit them there and use
`extensions/scripts/sync-collection-session-adapters.mjs` to update the loadable copies.
Node tests stay in `extensions/tests/` because Chrome rejects unpacked roots
containing test-style underscore paths.

## Build

- New runtime code is TypeScript in `extensions/src/` (conventions in
  `src/README.md`). `npm run extension:build` bundles it into the committed
  `kiditem-os/runtime/kiditem-runtime.js`, one IIFE exposing only the
  `KidItemRuntime` global, loaded last by the service worker.
- Rebuild and commit the bundle only when `src/` (or a bundled
  `@kiditem/shared` source) changes; CI fails on a stale bundle.
- The old JS modules are loaded unbundled; do not route them through the build.
- Keep the manifest `key`; it pins the extension ID
  ([runbook](../docs/runbooks/extension-releases.md)).

## Runtime layers

- Add new collection only under `src/collectors/<kind>/` and `src/sites/<site>/`;
  talk to the server only through `src/core/operation-client.ts`. The four
  layers and their import rules are in `src/README.md`, enforced by
  `npm run check:extension-runtime-layers`.
- A collector declares the site shape it needs as an interface in its folder;
  `entry/site-handles.ts` hands it the `sites/<site>` implementation. The Wing
  catalog kinds (`channels.wing_catalog_*`, KID-354) are the reference collectors.

## Owner boundary

- The extension captures and transports provider data; the server-side source
  owner is the only canonical writer. The extension never decides that a
  source is complete and never publishes downstream calculations.
- A source collection uses a server-issued attempt ID and token, bound to the
  exact producer and environment. Every chunk and terminal submission carries
  that identity and is idempotent; stale, expired, or post-terminal writes are
  rejected and stop local collection.
- Raw provider rows go only to the fenced owner ingest API. Do not persist a
  second canonical copy in extension storage or infer a successful snapshot
  from a partial response.

## Browser boundary

- Popup, content, page, host, and external messages are untrusted. Validate
  exact action/type and payload before tabs, fetches, or marketplace actions.
- Keep permissions minimal and never persist or commit tokens, cookies,
  credentials, or copied marketplace sessions. Backend calls use NestJS APIs
  and inherit organization and source-owner authorization.

## Verification

    npm run extension:check && npm run extension:test
    node --test extensions/tests/*.test.mjs extensions/tests/*/*.test.mjs
    node extensions/scripts/sync-collection-session-adapters.mjs --check
    node --check extensions/kiditem-os/background/service-worker.js
    node -e "JSON.parse(require('fs').readFileSync('extensions/kiditem-os/manifest.json','utf8'))"
    git diff --check -- extensions

Manifest, service-worker, permission, host-bridge, capability, or storage-key
changes also require an unpacked Chrome load and an end-to-end check of the
affected domain.
