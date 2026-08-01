Consult this document first instead of relying on memorized knowledge.

# kiditem-os — Unified KidItem Chrome Extension

`extensions/kiditem-os/` is the single Manifest V3 extension for every KidItem
browser automation domain. It replaces the former `order-collector`,
`coupang-ads-scraper`, and `product-scraper` extensions, which operators had to
install and keep in sync separately.

## Folder Map

| Path | Owner |
|---|---|
| `background/service-worker.js` | Loads every module, wires the unified dispatch. The only MV3 entrypoint. |
| `background/domain-registry.js` | `KidItemDomains`: producer-prefix -> domain lookup and merged capabilities. |
| `background/external-dispatch.js` | `ping` and the shared collection-session actions. |
| `background/worker-globals.js` | Globals the three domains had duplicated: web URL patterns, `collectionSessions`, `interactiveTabs`. |
| `background/{environment-context,collection-session,interactive-tabs}.js` | Shared foundation. The first two are generated from `extensions/shared/`. |
| `background/coupang/`, `background/orders/`, `background/sourcing/` | Domain workers and their domain-only modules. |
| `content/host-bridge.js` | Answers all three extension-id handshakes with the one extension id. |
| `content/coupang/`, `content/sourcing/` | Marketplace content scripts. |
| `popup/` | Side panel. `sourcing-panel.js` owns the sourcing section. |

## Owned Surfaces

The merge did not change what each domain does. Read the domain guides for
behaviour contracts, which still apply in full:

| Domain | Guide |
|---|---|
| Marketplace order collection, Sellpia, Rocket PO | [`background/orders/AGENTS.md`](background/orders/AGENTS.md) |
| Coupang Wing catalog, ad center, SERP | [`background/coupang/AGENTS.md`](background/coupang/AGENTS.md) |
| Alibaba/1688/Douyin/TikTok sourcing | [`background/sourcing/AGENTS.md`](background/sourcing/AGENTS.md) |

## Single-Worker Rules

MV3 allows one service worker, so the three domain workers share one global
scope and one `chrome.storage.local`. These rules keep them from colliding.

- Domain workers must not call `importScripts`. `background/service-worker.js`
  owns the load order: registry, shared foundation, `worker-globals.js`, domain
  modules, then domain workers last. A domain worker uses those globals at its
  top level, so reordering breaks boot.
- Top-level declarations share one scope. Before adding a top-level `const` or
  `function` to a domain worker, confirm the other two do not declare the same
  name. Domain-specific instances carry a domain prefix
  (`adsEnvironmentContext`, `ordersEnvironmentContext`,
  `sourcingEnvironmentContext`).
- Only `background/external-dispatch.js` answers `ping` and the collection
  session actions (`list`/`get`/`cancel`/`restart`/`finalize`/
  `openCollectionAttentionTab`). A domain worker that also answers them creates
  competing responses to the same message, and the first responder wins
  non-deterministically.
- A domain worker publishes its capabilities, exact browser-operation handlers,
  and its cancel/restart/finalize implementations through `KidItemDomains.register`.
  Browser handlers are dispatched only by exact operation key; never accept a
  generic action or URL executor. Capabilities are merged
  into one `ping` response; the web app would otherwise see only the first
  responder's domain and treat the rest as "extension not installed".
- Producer prefixes are the routing key and must stay disjoint: `orders` and
  `inventory` for order collection, `advertising`, `channels`, and `dashboard`
  for Coupang, `sourcing` for sourcing. `KidItemDomains.register` throws on a
  duplicate prefix.
- Domain-specific external actions stay in the domain worker. Every listener
  ignores actions it does not own, so they do not interfere.
- Internal `chrome.runtime.onMessage` actions collide the same way.
  `getConnectedKidItemEnvironments` is answered only by the Coupang worker and
  returns both `environmentIds` and `environments` because the side panel and
  the sourcing section read different shapes.
- One `chrome.storage.local` is shared. `kiditem_collection_sessions` is
  intentionally common; every other key must stay domain-unique. Alarm base
  names must stay unique too, and each alarm listener must ignore alarms it does
  not own.
- `kiditem_environment_profiles_v1` is shared, so one KidItem session token per
  environment serves all three domains. Signing out clears it for every domain.
  `environmentContext.connect()` merges into the stored profile instead of
  replacing it; replacing it would erase another domain's token on every order
  collection message.

## Browser Boundary

- Use Manifest V3. Do not add MV2 APIs or persistent background assumptions.
- `externally_connectable` is limited to the committed KidItem web origins. One
  installed copy must serve local, office, and staging; keep auth and run state
  isolated by the verified external sender origin instead of shipping variants.
- `content/host-bridge.js` may expose the extension id and status only. Never
  expose `kiditem_auth_token` through the host bridge or page-world messages.
- Treat popup, content script, page bridge, and external web messages as
  untrusted input. Validate message `type` / `action` before triggering tabs,
  fetches, or marketplace actions.
- Keep host permissions minimal and exact; explain new hosts in the domain
  guide. The extension holds the union of the three former permission sets, so
  `cookies` and `debugger` now span every host: `cookies` backs only
  `clearCoupangCookies` on supplier.coupang.com, and `debugger` stays on the
  Coupang surfaces that already required it.
- Backend calls go through NestJS HTTP APIs. No direct DB or Supabase client.
- Do not send `organizationId`; backend auth/session scope owns organization
  context.
- Do not commit tokens, cookies, credentials, or copied marketplace sessions.

## Verification

```bash
node --test extensions/tests/*.test.mjs extensions/tests/*/*.test.mjs
node --check extensions/kiditem-os/background/service-worker.js
node -e "JSON.parse(require('fs').readFileSync('extensions/kiditem-os/manifest.json','utf8'))"
git diff --check -- extensions
```

Manifest, service-worker wiring, host-bridge, capability, or storage-key changes
also need an unpacked load in Chrome: confirm the worker boots without a console
error, `ping` returns the merged capabilities, and the affected domain still
runs end to end.
