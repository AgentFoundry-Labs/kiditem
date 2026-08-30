# extensions — Chrome Extension

`extensions/` owns one loadable Manifest V3 extension,
`kiditem-os/`, for marketplace collection and browser-side operations. Orders,
Coupang, and sourcing are domains inside that worker; do not recreate separate
loadable extension roots.

`shared/collection-session.js` and `shared/environment-context.js` are the
canonical shared adapters. Edit them there and use
`scripts/sync-collection-session-adapters.mjs` to update the loadable copies.
Node tests stay in `extensions/tests/` because Chrome rejects unpacked roots
containing test-style underscore paths.

## Verification

    node --test extensions/tests/*.test.mjs extensions/tests/*/*.test.mjs
    node extensions/scripts/sync-collection-session-adapters.mjs --check
    node --check extensions/kiditem-os/background/service-worker.js
    node -e "JSON.parse(require('fs').readFileSync('extensions/kiditem-os/manifest.json','utf8'))"
    git diff --check -- extensions

Manifest, service-worker, permission, host-bridge, capability, or storage-key
changes also require an unpacked Chrome load and an end-to-end check of the
affected domain.
