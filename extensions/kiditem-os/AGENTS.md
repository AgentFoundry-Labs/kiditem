# kiditem-os — Unified Manifest V3 Extension

`extensions/kiditem-os/` is the single browser-automation extension. The
service worker loads the domain registry, shared foundation, worker globals,
domain modules, then the Orders, Coupang, and Sourcing workers. The nearest
domain guide owns marketplace-specific behavior.

## Single-Worker Contract

- Only `background/service-worker.js` calls `importScripts` and owns load
  order. Domain workers consume registered globals and must not import again.
- Every script shares one global scope. Keep top-level names unique and prefix
  domain instances.
- `external-dispatch.js` is the sole responder for ping and shared collection
  session list/get/cancel/restart/finalize/attention actions.
- Domain workers register exact browser-operation handlers and disjoint producer
  prefixes through `KidItemDomains.register`. Do not add generic action or URL
  execution.
- Domain listeners ignore actions and alarms they do not own. Shared storage
  keys are explicitly documented; every other storage/alarm name is
  domain-unique.
- `kiditem_environment_profiles_v1` intentionally shares one KidItem session
  per environment. Connection merges profile fields rather than replacing
  another domain's state.
- Capability responses are merged into one ping result so the web app can
  distinguish missing, stale, and supported extension versions.

The registry, load-order, collision, dispatch, and storage contracts are
executable in [extensions/tests/](../tests/). Treat those tests as the detailed
module map instead of duplicating every handler in this guide.

## Browser Boundary

- Keep Manifest V3 and exact committed KidItem origins. One installed copy
  serves local and Office while every run, callback, tab, and auth context is
  isolated by verified sender origin.
- The host bridge exposes only extension identity/status. It never exposes
  tokens through page-world messages.
- Popup, content, page, and external messages are untrusted. Validate exact
  action/type and payload before tabs, fetches, or marketplace actions.
- Keep host permissions minimal. Cookies remain limited to the documented
  Coupang recovery action and debugger access to the reviewed Coupang surfaces.
- Backend communication uses NestJS APIs and inherits the root organization and
  database boundaries.
- Never persist or commit tokens, cookies, credentials, or copied marketplace
  sessions.
- Operation-backed browser work uses OperationRun.id as its collection-session
  identity. Claim only the exact registered producer/environment, heartbeat and
  report with the current attempt token, and stop/close owned background tabs
  when the fence is lost or the API lifecycle is not ACCEPTING.
- The extension is never a canonical Sourcing or Ads writer. Post raw provider
  rows only to the fenced owner ingest API; terminal operation reports contain
  safe counts/references, never raw rows or credentials.
- One environment has one active browser claim for extension_coupang work.
  Attention is a human login/OTP/CAPTCHA state, not an automatic retry. A
  lifecycle-cancelled run is not resumed or reactivated after maintenance; a
  later explicit retry receives a new run identity.
