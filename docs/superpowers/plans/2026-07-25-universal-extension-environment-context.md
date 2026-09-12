# Universal Extension Environment Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build one loadable copy of each KidItem Chrome extension that safely serves local and staging KidItem tabs at the same time without sharing authentication, requests, runs, alarms, or callbacks across environments.

**Architecture:** A canonical `KidItemEnvironmentContext` adapter owns the closed local/staging mapping, sender resolution, environment-scoped profiles, auth recovery, and namespacing helpers; exact generated copies live inside each loadable extension. Every web command derives `environmentId` from `sender.url`, collection sessions persist that owner, extension-origin popup work requires an explicit connected environment, and environment-specific release rewriting is removed.

**Tech Stack:** Chrome Extensions Manifest V3, vanilla JavaScript service workers/content scripts, `chrome.storage.local`, `chrome.alarms`, Node.js `node:test`, Vitest, TypeScript, Next.js, deterministic ZIP packaging.

## Global Constraints

- Supported web/API pairs are exactly `local = http://localhost:3000 -> http://localhost:4000` and `staging = https://staging.merchon.org -> https://staging.merchon.org`.
- Never accept, persist, or infer a KidItem API origin from a message; `sender.url` selects only a compiled environment descriptor.
- `kiditem_environment_profiles_v1` is the only authenticated-extension profile key; access tokens remain per environment and Supabase refresh tokens remain in the web app.
- All authenticated requests require an explicit `environmentId`; no last-used, last-active, localhost, or cross-environment fallback is allowed.
- Every run, persisted status, schedule, alarm, callback, cancellation, and restart path must retain its creating environment.
- Ownerless legacy runs and schedules must not resume; ambiguous legacy auth/API keys are removed and require fresh web synchronization.
- Marketplace page/content scripts must not receive KidItem access tokens or arbitrary backend URLs.
- Exact origin permissions only; do not add `<all_urls>` or a KidItem wildcard.
- Bump manifests exactly: `product-scraper 2.3.0 -> 2.3.1`, `coupang-ads-scraper 1.2.83 -> 1.2.84`, and `order-collector 0.1.81 -> 0.1.82`.
- Do not change root `VERSION`, Prisma schema/data, marketplace algorithms, credentials, or destructive-action confirmation policy.
- Do not edit or stage the unrelated user changes in `apps/web/src/app/(product-pipeline)/product-pipeline/collected-products/lib/wing-registration-flow.ts` or its spec.

---

## File Structure

- `extensions/shared/environment-context.js`: canonical closed environment mapping, profile/auth recovery, tab targeting, and key/alarm namespacing.
- `extensions/{product-scraper,coupang-ads-scraper/background,order-collector/background}/environment-context.js`: byte-identical loadable copies of the canonical adapter.
- `extensions/scripts/sync-collection-session-adapters.mjs`: synchronize and check both canonical adapters and their generated copies.
- `extensions/shared/collection-session.js`: require and publish persisted environment ownership for every browser collection session.
- `extensions/coupang-ads-scraper/background/environment-runtime.js`: Coupang-only tab bindings, environment alarm registration/parsing, and environment-scoped state access.
- `apps/web/src/lib/extension-bridge.ts`: require the universal-environment capability during discovery.
- `apps/web/src/lib/extension-auth.ts`: send only token actions; the extension derives environment from the external sender.
- Existing extension service workers remain orchestrators; new environment policy stays in the focused modules above.

---

### Task 1: Canonical environment context and generated adapters

**Files:**
- Create: `extensions/shared/environment-context.js`
- Create: `extensions/product-scraper/environment-context.js`
- Create: `extensions/coupang-ads-scraper/background/environment-context.js`
- Create: `extensions/order-collector/background/environment-context.js`
- Create: `extensions/tests/environment-context-adapters.test.mjs`
- Modify: `extensions/scripts/sync-collection-session-adapters.mjs`
- Modify: `extensions/tests/collection-session-adapters.test.mjs`

**Interfaces:**
- Consumes: Chrome storage/tabs/scripting APIs and an optional `fetchFn`.
- Produces: `KidItemEnvironmentContext.create({ chrome, fetchFn?, requiresAuth?, profileStorageKey?, legacyStorageKeys?, now?, authRefreshTimeoutMs? })` returning `resolveSender(sender)`, `requireEnvironment(environmentId)`, `connect(environmentId)`, `connectedEnvironmentIds()`, `setAccessToken(environmentId, token)`, `clearAccessToken(environmentId)`, `getAccessToken(environmentId)`, `queryWebTabs(environmentId)`, `publish(environmentId, eventName, detail)`, `authedFetch(environmentId, path, init?)`, `storageKey(base, environmentId)`, `alarmName(base, environmentId)`, `parseAlarmName(base, name)`, and `migrateLegacyStorage()`.
- Produces descriptors shaped as `{ environmentId, webOrigin, apiOrigin, webUrlPattern }` and errors with codes `forbidden_origin`, `invalid_environment`, or `environment_auth_required`.

- [ ] **Step 1: Write failing adapter tests**

Add tests that execute the canonical and all three generated files in `vm` contexts. The behavioral assertions must include this matrix:

```js
assert.deepEqual(context.resolveSender({ url: 'http://localhost:3000/orders' }), {
  environmentId: 'local',
  webOrigin: 'http://localhost:3000',
  apiOrigin: 'http://localhost:4000',
  webUrlPattern: 'http://localhost:3000/*',
});
assert.equal(
  context.resolveSender({ url: 'https://staging.merchon.org/dashboard' }).environmentId,
  'staging',
);
assert.equal(context.resolveSender({ url: 'https://merchon.org/' }), null);

await context.setAccessToken('local', 'local-token');
await context.setAccessToken('staging', 'staging-token');
assert.equal(await context.getAccessToken('local'), 'local-token');
assert.equal(await context.getAccessToken('staging'), 'staging-token');
await context.clearAccessToken('local');
assert.equal(await context.getAccessToken('local'), null);
assert.equal(await context.getAccessToken('staging'), 'staging-token');

assert.equal(context.storageKey('kiditem_status', 'local'), 'kiditem_status:local');
assert.equal(context.alarmName('auto-scrape', 'staging'), 'auto-scrape:staging');
assert.equal(context.parseAlarmName('auto-scrape', 'auto-scrape:staging'), 'staging');
```

Also assert that concurrent `authedFetch('local', '/api/health')` and `authedFetch('staging', '/api/health')` call only their fixed API origins, a local `401` queries only `http://localhost:3000/*`, one retry uses only the changed local profile token, and `migrateLegacyStorage()` removes `kiditem_auth_token`, `apiBase`, and supplied legacy keys without copying their values.

- [ ] **Step 2: Run the new tests and verify RED**

Run:

```bash
rtk node --test extensions/tests/environment-context-adapters.test.mjs
```

Expected: FAIL because `extensions/shared/environment-context.js` and the `KidItemEnvironmentContext` global do not exist.

- [ ] **Step 3: Implement the canonical adapter**

Use a closed immutable descriptor table and explicit environment parameters. The public construction and request path must follow this code shape:

```js
(function installKidItemEnvironmentContext(root) {
  'use strict';

  const ENVIRONMENTS = Object.freeze({
    local: Object.freeze({
      environmentId: 'local',
      webOrigin: 'http://localhost:3000',
      apiOrigin: 'http://localhost:4000',
      webUrlPattern: 'http://localhost:3000/*',
    }),
    staging: Object.freeze({
      environmentId: 'staging',
      webOrigin: 'https://staging.merchon.org',
      apiOrigin: 'https://staging.merchon.org',
      webUrlPattern: 'https://staging.merchon.org/*',
    }),
  });

  function create(options) {
    const chromeApi = options.chrome;
    const fetchFn = options.fetchFn;
    const requiresAuth = options.requiresAuth !== false;
    const profileStorageKey = options.profileStorageKey || 'kiditem_environment_profiles_v1';
    const legacyStorageKeys = [...new Set(options.legacyStorageKeys || [])];
    const now = options.now || Date.now;
    const refreshes = new Map();

    function requireEnvironment(environmentId) {
      const descriptor = ENVIRONMENTS[environmentId];
      if (!descriptor) throw Object.assign(new Error('Unsupported KidItem environment'), { code: 'invalid_environment' });
      return descriptor;
    }

    function resolveSender(sender) {
      try {
        const origin = new URL(sender?.url || '').origin;
        return Object.values(ENVIRONMENTS).find((item) => item.webOrigin === origin) || null;
      } catch {
        return null;
      }
    }

    async function authedFetch(environmentId, path, init = {}) {
      const environment = requireEnvironment(environmentId);
      if (typeof fetchFn !== 'function') throw new Error('Authenticated fetch is unavailable');
      const token = await getAccessToken(environmentId);
      if (!token) throw Object.assign(new Error('KidItem login is required'), {
        code: 'environment_auth_required',
        environmentId,
      });
      const first = await fetchOnce(environment, path, init, token);
      if (first.status !== 401) return first;
      const nextToken = await requestFreshToken(environmentId, token);
      if (!nextToken || nextToken === token) return first;
      return fetchOnce(environment, path, init, nextToken);
    }

    return Object.freeze({
      resolveSender, requireEnvironment, connect, connectedEnvironmentIds,
      setAccessToken, clearAccessToken, getAccessToken, queryWebTabs, publish,
      authedFetch, storageKey, alarmName, parseAlarmName, migrateLegacyStorage,
    });
  }

  root.KidItemEnvironmentContext = Object.freeze({ create });
})(globalThis);
```

Implement profile writes as whole-object read/modify/write operations serialized through one promise queue, record `updatedAt`, and coalesce refreshes by `environmentId`. `fetchOnce` must build `new URL(path, `${environment.apiOrigin}/`)`, set only the owning token, apply the existing 25-second abort timeout, and never retry more than once. `publish` must call `queryWebTabs(environmentId)` and inject only the event name and sanitized detail.

For authenticated contexts (the default), `connectedEnvironmentIds()` returns only profiles with a non-empty `accessToken`, and clearing a token removes only that environment profile. For `requiresAuth: false`, `connect(environmentId)` records `{ updatedAt }` and that record is sufficient to report a connected environment; `authedFetch` remains unavailable.

`requestFreshToken` must query only the descriptor's `webUrlPattern`, wait only for that environment profile to change, and return `null` on timeout. Callers that own a collection run translate a missing profile, refresh timeout, or second `401` into `sessions.requireAttention(runId, { reason: 'environment_auth_required', message: 'KidItem login is required for this environment.' })` for that run only.

- [ ] **Step 4: Extend the adapter sync script**

Replace the script's single adapter mapping with these exact groups and preserve `--check` behavior:

```js
const adapterGroups = [
  {
    canonical: 'extensions/shared/collection-session.js',
    generated: [
      'extensions/coupang-ads-scraper/background/collection-session.js',
      'extensions/product-scraper/collection-session.js',
      'extensions/order-collector/background/collection-session.js',
    ],
  },
  {
    canonical: 'extensions/shared/environment-context.js',
    generated: [
      'extensions/coupang-ads-scraper/background/environment-context.js',
      'extensions/product-scraper/environment-context.js',
      'extensions/order-collector/background/environment-context.js',
    ],
  },
];
```

Run the script without `--check` to create the exact generated copies.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```bash
rtk node --test extensions/tests/environment-context-adapters.test.mjs extensions/tests/collection-session-adapters.test.mjs
rtk node extensions/scripts/sync-collection-session-adapters.mjs --check
```

Expected: all tests PASS and the sync check exits 0.

- [ ] **Step 6: Commit the environment adapter**

```bash
rtk git add extensions/shared/environment-context.js extensions/product-scraper/environment-context.js extensions/coupang-ads-scraper/background/environment-context.js extensions/order-collector/background/environment-context.js extensions/scripts/sync-collection-session-adapters.mjs extensions/tests/environment-context-adapters.test.mjs extensions/tests/collection-session-adapters.test.mjs
rtk git commit -m "feat: add universal extension environment context"
```

---

### Task 2: Persist environment ownership in collection sessions

**Files:**
- Modify: `extensions/shared/collection-session.js`
- Modify generated copies: `extensions/product-scraper/collection-session.js`, `extensions/coupang-ads-scraper/background/collection-session.js`, `extensions/order-collector/background/collection-session.js`
- Modify: `extensions/tests/collection-session-adapters.test.mjs`
- Modify: `extensions/tests/coupang-ads-scraper/collection-session-flow.test.mjs`
- Modify: `extensions/tests/order-collector-collection-session.test.mjs`

**Interfaces:**
- Consumes: the Task 1 environment context through `create({ chrome, storageKey, environmentContext, now? })`.
- Produces: `start({ environmentId, runId, producer, classification, restartStrategy, inputIdentity })`; public session views include `environmentId`.
- Produces: `list(environmentId)` and `getOwned(runId, environmentId)` for external callers, while `listAll()` and `get(runId)` remain available to internal lifecycle code that already loads the persisted owner.

- [ ] **Step 1: Add failing session-ownership tests**

Update `startInput()` to include `environmentId: 'local'`, then assert:

```js
await assert.rejects(
  manager.start({ ...startInput(), environmentId: undefined }),
  /Collection environment is required/,
);
const local = await manager.start(startInput());
assert.equal(local.environmentId, 'local');
assert.deepEqual(await manager.list('staging'), []);
assert.equal(await manager.getOwned(RUN_ID, 'staging'), null);
assert.equal((await manager.getOwned(RUN_ID, 'local')).runId, RUN_ID);
assert.deepEqual(runtime.calls.tabsQuery.at(-1), { url: 'http://localhost:3000/*' });
```

Seed an ownerless legacy `running` session and assert `recover()` marks it `attention_required` with reason `environment_owner_missing` and never queries a KidItem tab.

- [ ] **Step 2: Run session tests and verify RED**

```bash
rtk node --test extensions/tests/collection-session-adapters.test.mjs extensions/tests/coupang-ads-scraper/collection-session-flow.test.mjs extensions/tests/order-collector-collection-session.test.mjs
```

Expected: FAIL because `environmentId`, `list(environmentId)`, and `getOwned` are not implemented.

- [ ] **Step 3: Implement session ownership and owner-only publication**

Add the field at creation and public-view boundaries:

```js
function requireEnvironmentId(value) {
  environmentContext.requireEnvironment(value);
  return value;
}

function toPublicView(session) {
  return {
    environmentId: session.environmentId,
    runId: session.runId,
    producer: session.producer,
    classification: session.classification,
    status: session.status,
    attempt: session.attempt,
    restartStrategy: session.restartStrategy,
    progress: { ...session.progress },
    inputIdentity: { ...session.inputIdentity },
    attention: session.attention ? { ...session.attention } : null,
    startedAt: session.startedAt,
    updatedAt: session.updatedAt,
    finishedAt: session.finishedAt,
  };
}

async function publish(view) {
  return environmentContext.publish(
    view.environmentId,
    'kiditem:browser-collection-session',
    view,
  );
}
```

`restart`, `attachTab`, `progress`, `cancel`, and terminal transitions must preserve the stored owner. `list(environmentId)` filters before conversion; `getOwned` returns `null` when the owner differs. During recovery, do not assign an environment to an old record.

- [ ] **Step 4: Synchronize generated copies and update service harness dependencies**

Run:

```bash
rtk node extensions/scripts/sync-collection-session-adapters.mjs
```

Update the Coupang and order test harnesses to load `environment-context.js` before `collection-session.js` and construct sessions with `environmentContext` rather than `webUrlPatterns`.

- [ ] **Step 5: Run session tests and verify GREEN**

```bash
rtk node --test extensions/tests/collection-session-adapters.test.mjs extensions/tests/coupang-ads-scraper/collection-session-flow.test.mjs extensions/tests/order-collector-collection-session.test.mjs
rtk node extensions/scripts/sync-collection-session-adapters.mjs --check
```

Expected: all tests PASS.

- [ ] **Step 6: Commit session ownership**

```bash
rtk git add extensions/shared/collection-session.js extensions/product-scraper/collection-session.js extensions/coupang-ads-scraper/background/collection-session.js extensions/order-collector/background/collection-session.js extensions/tests/collection-session-adapters.test.mjs extensions/tests/coupang-ads-scraper/collection-session-flow.test.mjs extensions/tests/order-collector-collection-session.test.mjs
rtk git commit -m "feat: bind extension sessions to environments"
```

---

### Task 3: Gate web discovery and synchronize auth without API URLs

**Files:**
- Create: `apps/web/src/lib/__tests__/extension-bridge.spec.ts`
- Modify: `apps/web/src/lib/extension-bridge.ts`
- Modify: `apps/web/src/lib/extension-auth.ts`
- Modify: `apps/web/src/lib/__tests__/extension-auth.spec.ts`
- Modify: `apps/web/src/components/providers/__tests__/AuthProvider.spec.tsx`

**Interfaces:**
- Consumes: extension `ping` responses.
- Produces: discovery accepts only `capabilities.kiditemEnvironmentProfilesV1 === true` plus each extension's existing type capability.
- Produces auth messages exactly `{ action: 'setAuthToken', token }` and `{ action: 'clearAuthToken' }`; `apiBase` is removed.

- [ ] **Step 1: Add failing capability and message-shape tests**

Add bridge tests proving a stored ID and a host-bridge ID are rejected when ping lacks `kiditemEnvironmentProfilesV1`, then accepted when it is true. Update auth expectations to:

```ts
expect(sendToExtension).toHaveBeenCalledWith('coupang-ext', {
  action: 'setAuthToken',
  token: 'supabase-token',
});
expect(sendToExtension).toHaveBeenCalledWith('sourcing-ext', {
  action: 'setAuthToken',
  token: 'supabase-token',
});
expect(sendToExtension).not.toHaveBeenCalledWith(
  expect.any(String),
  expect.objectContaining({ apiBase: expect.anything() }),
);
```

Preserve the AuthProvider assertions for initial session, sign-in, token refresh, visibility/online recovery, and sign-out.

- [ ] **Step 2: Run web unit tests and verify RED**

```bash
rtk npm run test --workspace=apps/web -- src/lib/__tests__/extension-bridge.spec.ts src/lib/__tests__/extension-auth.spec.ts src/components/providers/__tests__/AuthProvider.spec.tsx
```

Expected: FAIL because discovery currently accepts old pings and sourcing auth still sends `apiBase`.

- [ ] **Step 3: Implement the capability gate and token-only sync**

Use one shared predicate in every detector:

```ts
function supportsEnvironmentProfiles(response: ExtensionPingResponse): boolean {
  return response.capabilities?.kiditemEnvironmentProfilesV1 === true;
}

export async function detectExtensionId(timeoutMs = 1200): Promise<string | null> {
  return detectExtensionIdWithHandshake({
    storageKey: KIDITEM_EXTENSION_ID_KEY,
    requestType: 'kiditem:request-ext-id',
    responseType: 'kiditem:ext-id',
    timeoutMs,
    accepts: supportsEnvironmentProfiles,
  });
}
```

Compose the same predicate with `sourcingProductScraper` and requested order capabilities. Remove `getApiBase`, `sourcingExtensionApiBase`, and the `apiBase` parameter from `syncTarget`; do not add an environment field because the extension must derive it from the Chrome external sender.

- [ ] **Step 4: Run web unit tests and build**

```bash
rtk npm run test --workspace=apps/web -- src/lib/__tests__/extension-bridge.spec.ts src/lib/__tests__/extension-auth.spec.ts src/components/providers/__tests__/AuthProvider.spec.tsx
rtk npm run build --workspace=apps/web
```

Expected: tests PASS and Next.js build exits 0.

- [ ] **Step 5: Commit the web protocol**

```bash
rtk git add apps/web/src/lib/extension-bridge.ts apps/web/src/lib/extension-auth.ts apps/web/src/lib/__tests__/extension-bridge.spec.ts apps/web/src/lib/__tests__/extension-auth.spec.ts apps/web/src/components/providers/__tests__/AuthProvider.spec.tsx
rtk git commit -m "feat: require universal extension auth protocol"
```

---

### Task 4: Make product-scraper environment-aware

**Files:**
- Modify: `extensions/product-scraper/background.js`
- Modify: `extensions/product-scraper/1688-trend-collector.js`
- Modify: `extensions/product-scraper/live-commerce-collector.js`
- Modify: `extensions/product-scraper/tiktok-cc-collector.js`
- Modify: `extensions/product-scraper/popup.html`
- Modify: `extensions/product-scraper/popup.js`
- Modify: `extensions/product-scraper/popup.css`
- Modify: `extensions/product-scraper/manifest.json`
- Modify: `extensions/tests/product-scraper/background-auth.test.mjs`
- Create: `extensions/tests/product-scraper/popup-environment.test.mjs`

**Interfaces:**
- Consumes: Task 1 context and Task 2 session manager.
- Produces: `backendRequestConfig(environmentId)` and collector calls `trendCollector.start(keywords, maxResults, environmentId)`, `tiktokCcCollector.start(options, environmentId)`, `liveCommerceCollector.collect(url, runId, environmentId)`.
- Produces popup runtime message `{ type: 'COLLECT_CURRENT', tabId, environmentId }`; `apiBase` is deleted from UI and messages.

- [ ] **Step 1: Add failing origin, isolation, run-owner, and popup tests**

Extend the background harness to import `environment-context.js`. Assert local and staging token sync stores two profiles, a local clear preserves staging, ping advertises `kiditemEnvironmentProfilesV1: true`, and an unknown sender returns `{ success: false, error: 'forbidden_origin' }`.

Assert two product submissions use these URLs and bearer tokens:

```js
assert.equal(localCall.url, 'http://localhost:4000/api/sourcing/extension/product-data');
assert.equal(new Headers(localCall.init.headers).get('authorization'), 'Bearer local-token');
assert.equal(stagingCall.url, 'https://staging.merchon.org/api/sourcing/extension/product-data');
assert.equal(new Headers(stagingCall.init.headers).get('authorization'), 'Bearer staging-token');
```

Popup tests cover zero profiles (collect disabled with login guidance), one profile (auto-selected), and two profiles (collect disabled until the operator selects local or staging).

- [ ] **Step 2: Run product tests and verify RED**

```bash
rtk node --test extensions/tests/product-scraper/background-auth.test.mjs extensions/tests/product-scraper/popup-environment.test.mjs
```

Expected: FAIL because product-scraper still has global `apiBase`/`kiditem_auth_token` and no popup selector.

- [ ] **Step 3: Replace global auth/API state with environment context**

Load the adapters in this order:

```js
importScripts('environment-context.js');
importScripts('collection-session.js');
```

Construct the context with `legacyStorageKeys: ['kiditem_auth_token', 'apiBase', 'kiditem_sourcing_ingest_token', 'kiditem_sourcing_ingest_token_expires_at']`, run `migrateLegacyStorage()` on install/startup, and create sessions with `environmentContext`.

At the top of `onMessageExternal`, resolve once:

```js
const environment = environmentContext.resolveSender(sender);
if (!environment) {
  sendResponse({ success: false, error: 'forbidden_origin' });
  return;
}
const environmentId = environment.environmentId;
void environmentContext.connect(environmentId);
```

Pass `environmentId` to every start/status/cancel/restart path and use `getOwned` for web session reads. Auth actions call only `setAccessToken(environmentId, token)` or `clearAccessToken(environmentId)`. `backendRequestConfig(environmentId)` delegates requests to `environmentContext.authedFetch` with `/api/sourcing/extension/...`; remove `DEFAULT_API`, `apiBase`, `normalizeApprovedApiBase`, and every message-supplied API base.

When a run-owned product request cannot recover auth or returns a second `401`, call `sessions.requireAttention` only for that run/environment. A non-run popup collection returns `environment_auth_required` without changing another session.

- [ ] **Step 4: Thread owners through product collectors and popup work**

Each collector `sessions.start` call must include its received `environmentId`; stored run restarts reuse `session.environmentId`. The popup must render a `<select id="environmentSelect">`, populate it from `connectedEnvironmentIds`, and send only the selected ID. Use this selection function:

```js
function selectedEnvironmentId(connected) {
  if (connected.length === 1) return connected[0];
  const chosen = dom.environmentSelect.value;
  return connected.includes(chosen) ? chosen : null;
}
```

Do not persist the selection and remove the editable API details section entirely.

- [ ] **Step 5: Bump manifest and run product tests**

Set manifest version `2.3.1`, keep both exact web origins, and add `https://staging.merchon.org/*` as the staging API permission already shared with its web origin.

```bash
rtk node --test extensions/tests/product-scraper/background-auth.test.mjs extensions/tests/product-scraper/popup-environment.test.mjs extensions/tests/collection-session-adapters.test.mjs
rtk node -e "JSON.parse(require('fs').readFileSync('extensions/product-scraper/manifest.json','utf8'))"
```

Expected: all tests PASS and manifest parsing exits 0.

- [ ] **Step 6: Commit product-scraper migration**

```bash
rtk git add extensions/product-scraper extensions/tests/product-scraper extensions/tests/collection-session-adapters.test.mjs
rtk git commit -m "feat: isolate product scraper environments"
```

---

### Task 5: Centralize Coupang KidItem API routing and tab ownership

**Files:**
- Create: `extensions/coupang-ads-scraper/background/environment-runtime.js`
- Create: `extensions/tests/coupang-ads-scraper/environment-runtime.test.mjs`
- Modify: `extensions/coupang-ads-scraper/background/service-worker.js`
- Modify: `extensions/coupang-ads-scraper/background/collection-runs.js`
- Modify: `extensions/coupang-ads-scraper/background/collection-window.js`
- Modify: `extensions/coupang-ads-scraper/background/coupang-catalog-import.js`
- Modify: `extensions/coupang-ads-scraper/content/ads-report.js`
- Modify: `extensions/coupang-ads-scraper/utils/api.js`
- Modify: `extensions/tests/coupang-ads-scraper/auth-recovery.test.mjs`
- Modify: `extensions/tests/coupang-ads-scraper/collection-session-flow.test.mjs`
- Delete: `extensions/coupang-ads-scraper/background/kiditem-auth.js`

**Interfaces:**
- Consumes: `KidItemEnvironmentContext` and environment-owned collection sessions.
- Produces: `KidItemCoupangEnvironmentRuntime.create({ chrome, environmentContext })` with `bindTab(tabId, environmentId, runId?)`, `environmentForTab(tabId)`, `clearTab(tabId)`, `stateKey(base, environmentId)`, `ensureAlarms(environmentId)`, and `parseAlarm(name)`.
- Produces internal service-worker message `{ action: 'kiditemApiRequest', environmentId?, path, method?, headers?, body? }` and serializable response `{ success, ok, status, body }`; content scripts never receive a token or full API URL, and the service worker derives their environment from the sender tab binding.

- [ ] **Step 1: Add failing runtime and routing tests**

Test that tab bindings persist as `{ tabId, environmentId, runId }`, reject invalid environments, and survive a fresh runtime instance. Test `stateKey('kiditem_batch_scrape', 'staging')`, environment alarm creation, and exact alarm parsing.

Move auth recovery expectations from `KidItemAuth` to the canonical context and add a concurrent local/staging `401` case. Add source-contract assertions:

```js
assert.doesNotMatch(adsReportSource, /kiditem_auth_token/);
assert.doesNotMatch(adsReportSource, /payload\.apiUrl/);
assert.doesNotMatch(apiHelperSource, /const KIDITEM_API\s*=/);
assert.match(adsReportSource, /action:\s*["']kiditemApiRequest["']/);
```

- [ ] **Step 2: Run Coupang focused tests and verify RED**

```bash
rtk node --test extensions/tests/coupang-ads-scraper/environment-runtime.test.mjs extensions/tests/coupang-ads-scraper/auth-recovery.test.mjs extensions/tests/coupang-ads-scraper/collection-session-flow.test.mjs
```

Expected: FAIL because the environment runtime does not exist and content/API helpers still read the global token and local URL.

- [ ] **Step 3: Implement the focused Coupang runtime**

Persist bindings under `kiditem_coupang_environment_tab_bindings_v1` and define alarm bases exactly:

```js
const ENVIRONMENT_ALARMS = Object.freeze({
  'auto-scrape': { periodInMinutes: 180 },
  'keyword-rank-check': { periodInMinutes: 720 },
  'wing-sales-rank-resume': { periodInMinutes: 1 },
  'coupang-keyword-serp-rank': { periodInMinutes: 720 },
});
```

`ensureAlarms(environmentId)` creates `base:environmentId` names. `parseAlarm` returns `{ base, environmentId }` only for those definitions. Keep `storage-cleanup` global because it does not perform environment-owned work.

- [ ] **Step 4: Route service-worker and content-script API calls**

Import `environment-context.js`, `environment-runtime.js`, then collection modules. Remove `API_URL`, `AUTH_TOKEN_KEY`, and the `KidItemAuth` construction. Use:

```js
const environmentContext = KidItemEnvironmentContext.create({
  chrome,
  fetchFn: fetch,
  legacyStorageKeys: ['kiditem_auth_token'],
});
const coupangEnvironment = KidItemCoupangEnvironmentRuntime.create({
  chrome,
  environmentContext,
});
const authedFetch = (environmentId, path, init) =>
  environmentContext.authedFetch(environmentId, path, init);
```

Every collection entrypoint takes `environmentId`; `collection-runs.js`, `collection-window.js`, and catalog dependencies pass it unchanged. Bind marketplace tabs when they are created/claimed and reject `kiditemApiRequest` from a tab without a binding. Replace `reportAction` and `fetchApprovedQueuedActions` in `ads-report.js` with `chrome.runtime.sendMessage({ action: 'kiditemApiRequest', path, method, headers, body })`; the service worker supplies the bound environment, rejects paths that do not begin with `/api/`, strips any incoming `Authorization` header, calls `authedFetch`, and serializes the parsed JSON response into `{ success, ok, status, body }`.

At the first line of `onMessageExternal`, resolve the descriptor from `sender.url`; reject unknown origins with `forbidden_origin`, connect the resolved profile, and pass that single `environmentId` through every handler. Remove both existing internal/global `setAuthToken` branches so only a verified external KidItem sender can set or clear the profile for its own origin.

- [ ] **Step 5: Scope status, callbacks, restarts, and auth recovery**

Replace environment-colliding keys with `coupangEnvironment.stateKey(base, environmentId)`. `notifyDashboard(environmentId)` uses `environmentContext.publish(environmentId, 'kiditem-sync')`. External session list/get/cancel/restart validates the sender owner. Stored run recovery reads `session.environmentId`; an ownerless run becomes `attention_required` and is not restarted. A missing profile, auth-refresh timeout, or second `401` marks only the owning run `attention_required` with reason `environment_auth_required`.

- [ ] **Step 6: Run focused tests and verify GREEN**

```bash
rtk node --test extensions/tests/coupang-ads-scraper/environment-runtime.test.mjs extensions/tests/coupang-ads-scraper/auth-recovery.test.mjs extensions/tests/coupang-ads-scraper/collection-session-flow.test.mjs
```

Expected: all tests PASS.

- [ ] **Step 7: Commit Coupang API isolation**

```bash
rtk git add extensions/coupang-ads-scraper/background extensions/coupang-ads-scraper/content/ads-report.js extensions/coupang-ads-scraper/utils/api.js extensions/tests/coupang-ads-scraper/environment-runtime.test.mjs extensions/tests/coupang-ads-scraper/auth-recovery.test.mjs extensions/tests/coupang-ads-scraper/collection-session-flow.test.mjs
rtk git commit -m "feat: isolate coupang extension api environments"
```

---

### Task 6: Scope Coupang popup actions and automatic jobs

**Files:**
- Modify: `extensions/coupang-ads-scraper/popup/popup.html`
- Modify: `extensions/coupang-ads-scraper/popup/popup.js`
- Modify: `extensions/coupang-ads-scraper/background/service-worker.js`
- Modify: `extensions/coupang-ads-scraper/manifest.json`
- Create: `extensions/tests/coupang-ads-scraper/popup-environment.test.mjs`
- Create: `extensions/tests/coupang-ads-scraper/environment-alarms.test.mjs`
- Modify: `extensions/tests/coupang-ads-scraper/manifest-permissions.test.mjs`

**Interfaces:**
- Consumes: Task 5 runtime and `connectedEnvironmentIds()`.
- Produces popup service-worker requests with explicit `environmentId`; service worker validates that it is connected.
- Produces automatic alarm dispatch functions `autoScrape(environmentId)`, `runScheduledWingSalesRankCheck(environmentId)`, `resumeInterruptedWingSalesRankCheck(environmentId)`, and `runScheduledKeywordRankCheck(environmentId)`.

- [ ] **Step 1: Add failing popup/alarm/manifest tests**

Cover zero, one, and two connected environments. For two profiles, assert no fetch/message occurs until selection. Assert dashboard buttons open `http://localhost:3000` or `https://staging.merchon.org`, never an API origin.

For alarms, assert both `auto-scrape:local` and `auto-scrape:staging` dispatch with their own environment and status key, while ownerless old alarm names do nothing. Manifest tests require version `1.2.84`, both exact web/API origins, and no wildcard.

- [ ] **Step 2: Run tests and verify RED**

```bash
rtk node --test extensions/tests/coupang-ads-scraper/popup-environment.test.mjs extensions/tests/coupang-ads-scraper/environment-alarms.test.mjs extensions/tests/coupang-ads-scraper/manifest-permissions.test.mjs
```

Expected: FAIL because popup and alarms are global and staging API permission is absent.

- [ ] **Step 3: Implement explicit popup selection**

Add a visible environment section and use descriptors returned by a background `getConnectedKidItemEnvironments` action. Every popup API operation goes through:

```js
async function popupApiRequest(path, init = {}) {
  const environmentId = requireSelectedEnvironment();
  const response = await chrome.runtime.sendMessage({
    action: 'kiditemApiRequest',
    environmentId,
    path,
    method: init.method,
    headers: init.headers,
    body: init.body,
  });
  if (!response?.success) throw new Error(response?.error || 'KidItem request failed');
  return response;
}
```

Do not persist the selected value. Pass `environmentId` into manual sync and approved-action messages; remove `API_URL`, `POPUP_AUTH_TOKEN_KEY`, direct `fetch`, and `apiUrl` payloads.

- [ ] **Step 4: Dispatch only namespaced automatic jobs**

On profile connection, call `ensureAlarms(environmentId)`. Parse alarm owners through the runtime and call the environment-parameterized job. Each job checks only its environment token/profile and uses only scoped status/cancel keys. The global cleanup alarm may prune expired records in both namespaces but must not start work.

- [ ] **Step 5: Update the manifest and run Coupang suite**

Set version `1.2.84`; retain localhost permissions and add `https://staging.merchon.org/*` to `host_permissions`. Keep both exact web origins in `externally_connectable` and host bridge matches.

```bash
rtk node --test extensions/tests/coupang-ads-scraper/*.test.mjs
rtk node -e "JSON.parse(require('fs').readFileSync('extensions/coupang-ads-scraper/manifest.json','utf8'))"
```

Expected: all tests PASS and manifest parsing exits 0.

- [ ] **Step 6: Commit popup and schedules**

```bash
rtk git add extensions/coupang-ads-scraper/popup extensions/coupang-ads-scraper/background/service-worker.js extensions/coupang-ads-scraper/manifest.json extensions/tests/coupang-ads-scraper
rtk git commit -m "feat: scope coupang popup and schedules"
```

---

### Task 7: Bind order-collector commands, sessions, and Sellpia cache to environments

**Files:**
- Modify: `extensions/order-collector/background/service-worker.js`
- Modify: `extensions/order-collector/background/order-collection-lifecycle.js`
- Modify: `extensions/order-collector/manifest.json`
- Modify: `extensions/tests/order-collector-collection-session.test.mjs`
- Modify: `extensions/tests/order-collector-sellpia-sales-cache.test.mjs`
- Modify: `extensions/tests/order-collector-action-coverage.test.mjs`

**Interfaces:**
- Consumes: Task 1 context created with `requiresAuth: false` and without `fetchFn`, plus Task 2 environment-owned sessions.
- Produces: `orderCollectionLifecycle.run(message, environmentId, inputIdentity, operation)` and owner-checked cancel/finalize methods.
- Produces Sellpia keys `sellpiaSaleSummaryOrganizationId:<environmentId>`, `sellpiaSaleSummaryCache:<environmentId>`, and alarm `sellpiaSaleSummaryDaily:<environmentId>`.

- [ ] **Step 1: Add failing order isolation tests**

Assert external local/staging commands create sessions with their sender owner and an unknown sender is rejected. Assert local cancellation cannot cancel a staging run. For Sellpia, store distinct organization IDs/caches in both namespaces, fire each alarm, and verify `getSellpiaSalesCache`/`clearSellpiaSalesCache` touch only the sender environment. Assert an old `sellpiaSaleSummaryDaily` alarm and an ownerless stored session do not run.

- [ ] **Step 2: Run order tests and verify RED**

```bash
rtk node --test extensions/tests/order-collector-collection-session.test.mjs extensions/tests/order-collector-sellpia-sales-cache.test.mjs extensions/tests/order-collector-action-coverage.test.mjs
```

Expected: FAIL because lifecycle and Sellpia state have no environment owner.

- [ ] **Step 3: Resolve sender environment before dispatch**

Import `environment-context.js` before `collection-session.js`, create the context with `requiresAuth: false` and without `fetchFn`, and at the start of `onMessageExternal` resolve and connect the sender exactly as in Task 4. Ping must advertise `kiditemEnvironmentProfilesV1: true`.

Pass `environmentId` into every `orderCollectionLifecycle.run`, external session control, sales-cache action, and scheduled-binding write. Change lifecycle begin logic to reject an existing run when either producer, input identity, or `current.environmentId` differs:

```js
if (
  current.producer !== producer ||
  current.environmentId !== environmentId ||
  !sameIdentity(current.inputIdentity, inputIdentity)
) {
  throw new Error('Collection run does not belong to this environment input');
}
```

- [ ] **Step 4: Namespace Sellpia schedule ownership**

Create the alarm only when a web-originated `collectSellpiaSaleSummary` stores a valid organization binding for that sender environment. Alarm dispatch parses the environment, loads only the corresponding binding, and writes only the corresponding cache. Do not add a KidItem token or API host permission.

- [ ] **Step 5: Bump manifest and run the order suite**

Set version `0.1.82`. Add `https://staging.merchon.org/*` to `host_permissions` only because the committed host bridge content script already runs there; keep the same exact `externally_connectable` and content-script matches.

```bash
rtk node --test extensions/tests/order-collector*.test.mjs
rtk node -e "JSON.parse(require('fs').readFileSync('extensions/order-collector/manifest.json','utf8'))"
```

Expected: all tests PASS and manifest parsing exits 0.

- [ ] **Step 6: Commit order environment ownership**

```bash
rtk git add extensions/order-collector extensions/tests/order-collector-collection-session.test.mjs extensions/tests/order-collector-sellpia-sales-cache.test.mjs extensions/tests/order-collector-action-coverage.test.mjs
rtk git commit -m "feat: isolate order collector environments"
```

---

### Task 8: Replace staging-specific packaging with universal releases

**Files:**
- Modify: `scripts/manage-extension-release.mjs`
- Modify: `scripts/__tests__/manage-extension-release.spec.ts`
- Modify: `scripts/README.md`
- Modify: `docs/runbooks/extension-releases.md`

**Interfaces:**
- Consumes: committed universal manifests.
- Produces CLI `node scripts/manage-extension-release.mjs <pack|publish> --extension <directory> [--output-dir <path>] [--dry-run true] [--release-state draft|published]`.
- Produces output `output/extensions/<directory>/<version>/universal/`, tag `extension-<directory>-v<version>`, asset `kiditem-<directory>-v<version>-universal.zip`, and metadata `target: 'universal'` with no `webOrigin`/`apiOrigin` fields.

- [ ] **Step 1: Rewrite release tests to the universal contract**

Remove `--target`, `--web-origin`, and `--api-origin` from invocations. Assert:

```ts
expect(metadata).toMatchObject({
  schemaVersion: 'kiditem.extension.release.v1',
  extension: 'order-collector',
  manifestVersion: version,
  target: 'universal',
  tag: `extension-order-collector-v${version}`,
});
expect(metadata).not.toHaveProperty('webOrigin');
expect(metadata).not.toHaveProperty('apiOrigin');
expect(packagedManifest.externally_connectable.matches).toEqual([
  'http://localhost:3000/*',
  'https://staging.merchon.org/*',
]);
expect(readFileSync(unpackedWorkerPath, 'utf8')).toContain('http://localhost:3000');
expect(readFileSync(unpackedWorkerPath, 'utf8')).toContain('https://staging.merchon.org');
```

Keep deterministic archive/checksum, root manifest, Git SHA, permission preservation, duplicate-release refusal, and main-cleanliness tests.

- [ ] **Step 2: Run script tests and verify RED**

```bash
rtk npx vitest run --config scripts/vitest.config.ts scripts/__tests__/manage-extension-release.spec.ts
```

Expected: FAIL because the CLI still requires a staging target and rewrites origins.

- [ ] **Step 3: Remove runtime rewriting from the packager**

Delete `textExtensions`, `sourceWebOrigins`, `sourceApiOrigins`, `normalizeOrigin`, `patchRuntimeFiles`, and `patchManifest`. Package the copied source directly and set:

```js
const target = 'universal';
const releaseDirectory = resolve(outputDirectory, extension, version, target);
const assetBase = `kiditem-${extension}-v${version}-universal`;
const metadata = {
  schemaVersion: 'kiditem.extension.release.v1',
  extension,
  displayName: manifest.name,
  manifestVersion: version,
  target,
  gitSha: gitSha(),
  tag: `extension-${extension}-v${version}`,
  archive: { fileName: archiveFileName, sha256, size: statSync(archivePath).size },
};
```

Keep documentation filtering and deterministic timestamps. Update release titles/notes to say `universal`; old `*-staging` releases remain immutable and are never modified.

- [ ] **Step 4: Update runbook and script inventory prose**

Document exact pack/dry-run/publish commands without environment flags, the universal output/tag contract, loading the unpacked extension once for both local and staging, historical staging release immutability, Chrome Store publication being out of scope, and the manual acceptance sequence from the approved design.

- [ ] **Step 5: Run release tests and inventory checks**

```bash
rtk npm run test:scripts
rtk npm run check:scripts-inventory
```

Expected: all tests and inventory checks PASS.

- [ ] **Step 6: Commit universal release packaging**

```bash
rtk git add scripts/manage-extension-release.mjs scripts/__tests__/manage-extension-release.spec.ts scripts/README.md docs/runbooks/extension-releases.md
rtk git commit -m "refactor: package universal extensions"
```

---

### Task 9: Full regression, security scan, and manual acceptance handoff

**Files:**
- Modify only when a failing in-scope regression requires correction: files already listed in Tasks 1-8.
- Verify: `docs/superpowers/specs/archive/2026-07-25-universal-extension-environment-context-design.md`
- Verify: `docs/superpowers/plans/2026-07-25-universal-extension-environment-context.md`

**Interfaces:**
- Consumes: all previous task deliverables.
- Produces: one verified universal extension set and a clean, reviewable branch that excludes unrelated user changes.

- [ ] **Step 1: Run all automated extension and release gates**

```bash
rtk node --test extensions/tests/*.test.mjs extensions/tests/coupang-ads-scraper/*.test.mjs extensions/tests/product-scraper/*.test.mjs
rtk node extensions/scripts/sync-collection-session-adapters.mjs --check
rtk npm run test:scripts
rtk npm run check:scripts-inventory
rtk npm run build --workspace=apps/web
rtk node -e "JSON.parse(require('fs').readFileSync('extensions/product-scraper/manifest.json','utf8'))"
rtk node -e "JSON.parse(require('fs').readFileSync('extensions/coupang-ads-scraper/manifest.json','utf8'))"
rtk node -e "JSON.parse(require('fs').readFileSync('extensions/order-collector/manifest.json','utf8'))"
rtk git diff --check
```

Expected: every command exits 0.

- [ ] **Step 2: Run source-level blocker scans**

```bash
rtk rg -n "kiditem_auth_token|apiBase|const API_URL = \"http://localhost:4000\"|payload\.apiUrl" extensions/product-scraper extensions/coupang-ads-scraper extensions/order-collector
rtk rg -n "<all_urls>|https://\*\.merchon\.org|http://\*\.localhost" extensions/*/manifest.json
rtk rg -n "extension-.*-staging|patchRuntimeFiles|patchManifest|--web-origin|--api-origin" scripts/manage-extension-release.mjs docs/runbooks/extension-releases.md scripts/README.md
```

Expected: the first scan finds only explicit migration-key removal/tests, the second finds no matches, and the third finds only the runbook sentence explaining immutable historical staging releases.

- [ ] **Step 3: Inspect branch scope before browser acceptance**

```bash
rtk git status --short
rtk git diff --stat origin/develop...HEAD
rtk git diff --name-only origin/develop...HEAD
```

Expected: only the approved web auth bridge, three extensions, extension tests, release automation/runbook, spec, and plan appear in committed changes. The two unrelated `wing-registration-flow` working-tree files remain unstaged.

- [ ] **Step 4: Perform the manual Chrome acceptance sequence**

Load each committed extension directory once in `chrome://extensions`; open and sign into local and staging in the same Chrome profile; confirm the same installed IDs and `kiditemEnvironmentProfilesV1`; run safe read-only local and staging collections concurrently; verify local calls only localhost and staging calls only staging; sign out from one and verify the other continues; inspect separate alarm/status storage; restart each service worker and verify owned runs retain their environment.

Record an explicit blocker and stop rollout if any request lacks an owner, any auth refresh queries both origins, any state/alarm key collides, any ownerless legacy run resumes, or either environment falls back to the other.

- [ ] **Step 5: Correct failures at their owning task boundary**

If verification finds an in-scope defect, return to the Task 1-8 test that owns that behavior, add a regression assertion there, make it fail, apply the correction in that task's listed files, rerun that task's exact GREEN command, and execute that task's existing commit step to create a new correction commit. Do not amend or rewrite commits. Restart Task 9 from Step 1; if no correction is required, continue without creating an empty commit.

- [ ] **Step 6: Prepare PR verification without publishing or merging**

```bash
rtk npm run check:pr-reconstruction -- --base origin/develop --head HEAD
rtk npm run check:pr-release-contract -- --base origin/develop --head HEAD
```

Expected: both guards PASS. Chrome Store upload, GitHub Release publication, PR creation, and merge remain separate user-authorized actions.
