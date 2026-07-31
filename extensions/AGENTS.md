Consult this document first instead of relying on memorized knowledge.

# extensions — Chrome Extensions

`extensions/` owns the KidItem Chrome Manifest V3 extension that collects
marketplace data and sends it to KidItem NestJS APIs.

There is exactly one loadable extension, `kiditem-os/`. Order collection,
Coupang Wing/ad-center, and sourcing used to ship as three separate extensions
that operators installed and reloaded independently; they are now three domains
inside one extension. Do not reintroduce a second loadable extension root.

## Scoped Guides

| Path | Focus |
|---|---|
| [`kiditem-os/AGENTS.md`](kiditem-os/AGENTS.md) | Extension rules: layout, single-worker constraints, browser boundary |
| [`kiditem-os/background/orders/AGENTS.md`](kiditem-os/background/orders/AGENTS.md) | Marketplace order collection helpers |
| [`kiditem-os/background/coupang/AGENTS.md`](kiditem-os/background/coupang/AGENTS.md) | Coupang Wing and ad-center operations |
| [`kiditem-os/background/sourcing/AGENTS.md`](kiditem-os/background/sourcing/AGENTS.md) | Alibaba/1688 sourcing ingest |

## Shared Adapters

`shared/collection-session.js` and `shared/environment-context.js` are the
canonical copies. They live outside the extension root because Chrome only loads
files under it, so `scripts/sync-collection-session-adapters.mjs` copies them
into `kiditem-os/background/`. Edit the canonical file, then rerun the script.

Node tests live in `tests/`, outside the extension root: Chrome rejects unpacked
roots containing `_`-prefixed paths such as `__tests__`.

## Verification

```bash
node --test extensions/tests/*.test.mjs extensions/tests/*/*.test.mjs
node extensions/scripts/sync-collection-session-adapters.mjs --check
node --check extensions/kiditem-os/background/service-worker.js
node -e "JSON.parse(require('fs').readFileSync('extensions/kiditem-os/manifest.json','utf8'))"
git diff --check -- extensions
```
