# Extension Supabase Auth Continuity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the Coupang and sourcing Chrome extensions authenticated with the current Supabase user access token and recover one failed authenticated request while an open KidItem tab owns session refresh.

**Architecture:** `AuthProvider` delegates extension synchronization to a testable `extension-auth.ts` orchestrator. Each authenticated extension stores `kiditem_auth_token`, requests a token-free refresh from an allowlisted KidItem tab after one `401`, waits up to 10 seconds for the stored token to change, and retries once. The obsolete sourcing-only token issuance, renewal, and middleware path is removed so the global Supabase middleware is the only server verifier.

**Tech Stack:** Next.js 15, React 19, Supabase JS, Vitest, Chrome Manifest V3, Node test runner, NestJS 11, TypeScript.

## Global Constraints

- Work in the existing `feat/coupang-rocket-po-confirm` worktree; do not create a git worktree.
- This is a cross-layer authentication-control cleanup and must not change unrelated advertising, sourcing, Channels, or order behavior.
- Store only the current Supabase access token in the Coupang and sourcing extensions; never store the Supabase refresh token.
- Do not send tokens through DOM events, page messages, URLs, logs, or error text.
- Do not give the order collector a KidItem API token.
- Retry an authenticated request at most once after a `401` and only after `kiditem_auth_token` changes.
- Keep extension absence or failure non-blocking for the web login lifecycle.
- Use the global `SupabaseAuthMiddleware` and organization guard for every sourcing and advertising API route.
- No database schema, data migration, dev-data, or `VERSION` change.

---

### Task 1: Centralize web-to-extension Supabase token synchronization

**Files:**
- Create: `apps/web/src/lib/extension-auth.ts`
- Create: `apps/web/src/lib/__tests__/extension-auth.spec.ts`
- Modify: `apps/web/src/components/providers/AuthProvider.tsx`
- Modify: `apps/web/src/components/providers/__tests__/AuthProvider.spec.tsx`
- Delete: `apps/web/src/lib/sourcing-extension-auth.ts`
- Delete: `apps/web/src/lib/__tests__/sourcing-extension-auth.spec.ts`

**Interfaces:**
- Consumes: `Session` from `@supabase/supabase-js`; `detectExtensionId()`, `detectSourcingExtensionId()`, and `sendToExtension()` from `extension-bridge.ts`; `getApiBase()` from `api.ts`.
- Produces: `syncExtensionAuth(session: Pick<Session, 'access_token'> | null): Promise<ExtensionAuthSyncResult>` and exported `EXTENSION_AUTH_REQUIRED_EVENT = 'kiditem:extension-auth-required'`.

- [ ] **Step 1: Write the failing orchestrator tests**

Create tests that require the same Supabase token to be sent to both extensions, require sourcing `apiBase`, verify sign-out clearing, and verify one detection/message failure does not block the other target.

```ts
it('stores the current Supabase token in every authenticated extension', async () => {
  mockedDetectCoupang.mockResolvedValue('coupang-ext');
  mockedDetectSourcing.mockResolvedValue('sourcing-ext');
  mockedSend.mockResolvedValue({ success: true });

  const result = await syncExtensionAuth({ access_token: 'supabase-token' });

  expect(mockedSend).toHaveBeenCalledWith('coupang-ext', {
    action: 'setAuthToken',
    token: 'supabase-token',
  });
  expect(mockedSend).toHaveBeenCalledWith('sourcing-ext', {
    action: 'setAuthToken',
    token: 'supabase-token',
    apiBase: 'http://localhost:4000/api/sourcing/extension',
  });
  expect(result.coupang.status).toBe('synced');
  expect(result.sourcing.status).toBe('synced');
});
```

- [ ] **Step 2: Run the orchestrator test and verify RED**

Run: `npm exec --workspace=apps/web vitest -- run src/lib/__tests__/extension-auth.spec.ts`

Expected: FAIL because `extension-auth.ts` does not exist.

- [ ] **Step 3: Implement the minimal orchestrator**

Use one target helper so optional extensions are isolated and the bridge stays transport-only.

```ts
export const EXTENSION_AUTH_REQUIRED_EVENT = 'kiditem:extension-auth-required';

type SyncStatus = { status: 'synced' | 'cleared' | 'not_installed' | 'failed' };
export type ExtensionAuthSyncResult = Record<'coupang' | 'sourcing', SyncStatus>;

export async function syncExtensionAuth(
  session: Pick<Session, 'access_token'> | null,
): Promise<ExtensionAuthSyncResult> {
  const [coupang, sourcing] = await Promise.all([
    syncTarget('coupang', detectExtensionId, session, undefined),
    syncTarget('sourcing', detectSourcingExtensionId, session, sourcingApiBase()),
  ]);
  return { coupang, sourcing };
}
```

- [ ] **Step 4: Run the orchestrator test and verify GREEN**

Run: `npm exec --workspace=apps/web vitest -- run src/lib/__tests__/extension-auth.spec.ts`

Expected: PASS with all new synchronization cases green.

- [ ] **Step 5: Write failing AuthProvider lifecycle and recovery tests**

Replace the sourcing-only mock with `syncExtensionAuth`. Add `refreshSessionMock` and tests for initial sync, `TOKEN_REFRESHED`, sign-out clearing, `online`, visible `visibilitychange`, and coalesced `kiditem:extension-auth-required` events.

```ts
it('refreshes Supabase once for concurrent extension auth-required events', async () => {
  refreshSessionMock.mockResolvedValue({
    data: { session: { access_token: 'rotated' } },
    error: null,
  });

  window.dispatchEvent(new Event(EXTENSION_AUTH_REQUIRED_EVENT));
  window.dispatchEvent(new Event(EXTENSION_AUTH_REQUIRED_EVENT));

  await waitFor(() => expect(refreshSessionMock).toHaveBeenCalledTimes(1));
  expect(syncExtensionAuthMock).toHaveBeenCalledWith({ access_token: 'rotated' });
});
```

- [ ] **Step 6: Run AuthProvider tests and verify RED**

Run: `npm exec --workspace=apps/web vitest -- run src/components/providers/__tests__/AuthProvider.spec.tsx`

Expected: FAIL because `AuthProvider` still imports `syncSourcingExtensionAuth` and does not handle recovery events.

- [ ] **Step 7: Implement AuthProvider synchronization and recovery**

Keep one in-flight forced refresh promise inside the provider effect. Register and clean up `online`, `focus`, `visibilitychange`, and `EXTENSION_AUTH_REQUIRED_EVENT` listeners.

```ts
let refreshInFlight: Promise<void> | null = null;

const forceRefreshAndSync = () => {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = supabase.auth.refreshSession()
    .then(({ data, error }) => {
      if (!error && data.session) return syncExtensionAuth(data.session).then(() => undefined);
    })
    .finally(() => { refreshInFlight = null; });
  return refreshInFlight;
};
```

Normal session callbacks call `void syncExtensionAuth(session)`. Recovery listeners never block rendering or navigation.

- [ ] **Step 8: Run focused web tests and verify GREEN**

Run: `npm exec --workspace=apps/web vitest -- run src/lib/__tests__/extension-auth.spec.ts src/components/providers/__tests__/AuthProvider.spec.tsx`

Expected: PASS.

- [ ] **Step 9: Remove the superseded sourcing-only web helper and commit**

Delete the old helper and test, then run:

```bash
git add apps/web/src/lib/extension-auth.ts \
  apps/web/src/lib/__tests__/extension-auth.spec.ts \
  apps/web/src/components/providers/AuthProvider.tsx \
  apps/web/src/components/providers/__tests__/AuthProvider.spec.tsx \
  apps/web/src/lib/sourcing-extension-auth.ts \
  apps/web/src/lib/__tests__/sourcing-extension-auth.spec.ts
git commit -m "fix: synchronize extension Supabase auth"
```

### Task 2: Convert the sourcing extension to the common token and one-shot recovery

**Files:**
- Modify: `extensions/product-scraper/background.js`
- Modify: `extensions/product-scraper/1688-trend-collector.js`
- Modify: `extensions/product-scraper/live-commerce-collector.js`
- Modify: `extensions/tests/product-scraper/background-auth.test.mjs`
- Modify: `extensions/tests/product-scraper/1688-trend-collector.test.mjs`
- Modify: `extensions/tests/product-scraper/live-commerce-collector.test.mjs`

**Interfaces:**
- Consumes: external `setAuthToken` and `clearAuthToken` messages from Task 1.
- Produces: common `kiditem_auth_token` storage, token-free refresh signal, and `fetchKidItem(url, init)` with one-shot `401` recovery used by product ingest, 1688 trend ingest, and live-commerce ingest.

- [ ] **Step 1: Write failing sourcing extension tests**

Update the VM harness to provide `chrome.storage.onChanged`, `chrome.tabs.query`, and `chrome.scripting.executeScript`. Require the common key, legacy-key cleanup, bearer use, one retry after a changed token, no retry without a changed token, and a refresh signal with no token payload.

```js
test('requests web refresh and retries once after 401 with a changed token', async () => {
  const env = loadBackground({ kiditem_auth_token: 'expired-token' }, [
    { status: 401 },
    { status: 200, ok: true },
  ]);

  const pending = env.context.sendToBackend({ source_url: VALID_1688_URL });
  env.storageApi.set({ kiditem_auth_token: 'rotated-token' });
  await pending;

  assert.equal(env.fetchCalls.length, 2);
  assert.equal(new Headers(env.fetchCalls[1].init.headers).get('authorization'), 'Bearer rotated-token');
  assert.equal(env.dispatchedEvents[0], 'kiditem:extension-auth-required');
});
```

- [ ] **Step 2: Run the sourcing extension test and verify RED**

Run: `node --test extensions/tests/product-scraper/background-auth.test.mjs`

Expected: FAIL because the extension still stores `kiditem_sourcing_ingest_token` and never recovers from `401`.

- [ ] **Step 3: Implement common storage and bounded recovery**

Replace sourcing token metadata and renewal with:

```js
const AUTH_TOKEN_KEY = 'kiditem_auth_token';
const LEGACY_AUTH_TOKEN_KEYS = [
  'kiditem_sourcing_ingest_token',
  'kiditem_sourcing_ingest_token_expires_at',
  'kiditem_sourcing_ingest_token_max_expires_at',
];
const AUTH_REFRESH_TIMEOUT_MS = 10_000;
let authRefreshInFlight = null;
```

`setAuthToken` stores the common key and removes legacy keys. `clearAuthToken` removes both common and legacy keys. The authenticated fetch helper registers a storage-change listener before signaling the web tab, waits at most 10 seconds, and retries once only with a different non-empty token. Concurrent `401` calls share `authRefreshInFlight`.

`backendRequestConfig()` exposes the authenticated request function alongside the approved base. Both collector runtimes call `config.request(url, init)` for KidItem ingest and retain raw `fetch` only for marketplace pages.

- [ ] **Step 4: Run the sourcing extension test and verify GREEN**

Run: `node --test extensions/tests/product-scraper/background-auth.test.mjs`

Expected: PASS.

- [ ] **Step 5: Run all product-scraper tests and commit**

Run: `node --test extensions/tests/product-scraper/*.test.mjs`

Expected: PASS with zero failures.

```bash
git add extensions/product-scraper/background.js \
  extensions/product-scraper/1688-trend-collector.js \
  extensions/product-scraper/live-commerce-collector.js \
  extensions/tests/product-scraper/1688-trend-collector.test.mjs \
  extensions/tests/product-scraper/live-commerce-collector.test.mjs \
  extensions/tests/product-scraper/background-auth.test.mjs
git commit -m "fix: refresh sourcing extension auth"
```

### Task 3: Add one-shot auth recovery to the Coupang extension

**Files:**
- Create: `extensions/coupang-ads-scraper/background/kiditem-auth.js`
- Modify: `extensions/coupang-ads-scraper/background/service-worker.js`
- Create: `extensions/tests/coupang-ads-scraper/auth-recovery.test.mjs`

**Interfaces:**
- Consumes: `setAuthToken` and `clearAuthToken` messages from Task 1.
- Produces: `KidItemAuth.create(options)` and an `authedFetch(path, init)` binding that retries one `401` after the common stored token changes.

- [ ] **Step 1: Write the failing Coupang recovery test**

Load `background/kiditem-auth.js` directly in a focused VM harness. Require one token-free refresh signal, a changed bearer on the retry, one shared wait for concurrent `401` responses, and no recursion after a second `401`.

```js
test('retries a KidItem API request once with the refreshed token', async () => {
  const env = loadAuthRuntime({ kiditem_auth_token: 'expired' }, [401, 200]);
  const pending = env.context.authedFetch('/api/ads/keyword-rank/wing-targets');
  env.setToken('rotated');
  const response = await pending;

  assert.equal(response.status, 200);
  assert.deepEqual(env.authorizationHeaders, ['Bearer expired', 'Bearer rotated']);
  assert.deepEqual(env.dispatchedEvents, ['kiditem:extension-auth-required']);
});
```

- [ ] **Step 2: Run the Coupang recovery test and verify RED**

Run: `node --test extensions/tests/coupang-ads-scraper/auth-recovery.test.mjs`

Expected: FAIL because current `authedFetch` returns the first `401`.

- [ ] **Step 3: Implement bounded recovery in the service worker**

Create a buildless MV3 runtime that exposes `globalThis.KidItemAuth.create({ chrome, fetchFn, apiUrl, tokenKey, webOrigins, timeoutMs })`. It owns token reads, the storage-change wait, token-free page notification, request timeout, and one retry. Import it before the current service-worker dependencies and bind the existing `authedFetch` name to the returned runtime.

```js
const kiditemAuth = KidItemAuth.create({
  chrome,
  fetchFn: fetch,
  apiUrl: API_URL,
  tokenKey: AUTH_TOKEN_KEY,
  webOrigins: ['http://localhost:3000'],
  timeoutMs: 25_000,
});
const authedFetch = kiditemAuth.authedFetch;
```

- [ ] **Step 4: Run the Coupang recovery and existing extension tests**

Run: `node --test extensions/tests/coupang-ads-scraper/*.test.mjs extensions/tests/coupang-catalog-action-coverage.test.mjs extensions/tests/coupang-catalog-collector.test.mjs`

Expected: PASS with zero failures.

- [ ] **Step 5: Commit the Coupang extension recovery**

```bash
git add extensions/coupang-ads-scraper/background/service-worker.js \
  extensions/coupang-ads-scraper/background/kiditem-auth.js \
  extensions/tests/coupang-ads-scraper/auth-recovery.test.mjs
git commit -m "fix: recover Coupang extension auth"
```

### Task 4: Remove the sourcing-only server authentication path

**Files:**
- Modify: `apps/server/src/sourcing/adapter/in/http/sourcing-extension-ingest.controller.ts`
- Modify: `apps/server/src/auth/auth.module.ts`
- Modify: `apps/server/src/app.module.ts`
- Modify: `apps/server/src/auth/middleware/supabase-auth.middleware.ts`
- Modify: `apps/server/src/types/express.d.ts`
- Modify: `apps/server/src/auth/__tests__/sourcing-extension-route-security.spec.ts`
- Modify: `apps/server/src/auth/AGENTS.md`
- Delete: `apps/server/src/auth/sourcing-extension-token.service.ts`
- Delete: `apps/server/src/auth/middleware/sourcing-extension-auth.middleware.ts`
- Delete: `apps/server/src/auth/__tests__/sourcing-extension-token.service.spec.ts`
- Delete: `apps/server/src/auth/__tests__/sourcing-extension-auth.middleware.spec.ts`

**Interfaces:**
- Consumes: valid Supabase bearer tokens written by Tasks 1–3.
- Produces: sourcing extension ingest routes authenticated only by global `SupabaseAuthMiddleware` and `OrganizationScopeGuard`.

- [ ] **Step 1: Rewrite the route-security test to require only global Supabase auth**

```ts
it('runs global Supabase authentication for sourcing extension routes', () => {
  const forRoutes = vi.fn();
  const apply = vi.fn().mockReturnValue({ forRoutes });

  new AppModule().configure({ apply } as never);

  expect(apply).toHaveBeenCalledTimes(1);
  expect(apply).toHaveBeenCalledWith(SupabaseAuthMiddleware);
  expect(forRoutes).toHaveBeenCalledWith('*');
});
```

Also assert that the controller no longer exposes `extension/session` or `extension/session/renew` metadata in its method set.

- [ ] **Step 2: Run focused server auth tests and verify RED**

Run: `npm exec --workspace=apps/server vitest -- run src/auth/__tests__/sourcing-extension-route-security.spec.ts src/auth/__tests__/supabase-auth.middleware.spec.ts`

Expected: FAIL because the sourcing-only middleware is still registered.

- [ ] **Step 3: Remove sourcing-only issuance, renewal, middleware, and types**

Remove the two controller methods and their token service injection. Delete the service, middleware, and tests. Simplify `AuthModule` to export only `SupabaseAuthMiddleware`, simplify `AppModule.configure()` to apply it once to `'*'`, remove the sourcing-token prefix bypass, and remove `Request.sourcingExtensionToken`.

```ts
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(SupabaseAuthMiddleware).forRoutes('*');
  }
}
```

Update `apps/server/src/auth/AGENTS.md` so Supabase bearer/cookie auth is the only extension API contract and no removed scoped-token guidance remains.

- [ ] **Step 4: Run focused server tests and verify GREEN**

Run: `npm exec --workspace=apps/server vitest -- run src/auth src/sourcing/adapter/in/http`

Expected: PASS with zero failures.

- [ ] **Step 5: Run tenancy guards and commit**

Run:

```bash
npm run check:idor
npm run check:tenant-scope
```

Expected: both checks PASS.

```bash
git add apps/server/src/app.module.ts apps/server/src/auth \
  apps/server/src/sourcing/adapter/in/http/sourcing-extension-ingest.controller.ts \
  apps/server/src/types/express.d.ts
git commit -m "refactor: unify extension authentication"
```

### Task 5: Full verification and browser acceptance

**Files:**
- Modify if required by implementation drift: `docs/superpowers/specs/archive/2026-07-14-extension-supabase-auth-continuity-design.md`
- Modify if required by implementation drift: `docs/superpowers/plans/2026-07-14-extension-supabase-auth-continuity.md`

**Interfaces:**
- Consumes: all completed tasks.
- Produces: verified PR-ready implementation and live proof that the former rank-tracking `401` is gone.

- [ ] **Step 1: Run all focused web and extension suites**

```bash
npm exec --workspace=apps/web vitest -- run \
  src/lib/__tests__/extension-auth.spec.ts \
  src/components/providers/__tests__/AuthProvider.spec.tsx
node --test extensions/tests/product-scraper/*.test.mjs
node --test extensions/tests/coupang-ads-scraper/*.test.mjs \
  extensions/tests/coupang-catalog-action-coverage.test.mjs \
  extensions/tests/coupang-catalog-collector.test.mjs
node --check extensions/product-scraper/background.js
node --check extensions/coupang-ads-scraper/background/service-worker.js
```

Expected: all commands exit `0` with zero failed tests.

- [ ] **Step 2: Run application builds and backend boot**

```bash
npm run build --workspace=apps/web
npm run build --workspace=apps/server
npm run dev:server
```

Expected: both builds exit `0`; Nest reports zero compile errors and listens on port `4000`.

- [ ] **Step 3: Run repository policy gates**

```bash
npm run check:idor
npm run check:tenant-scope
npm run check:pr-reconstruction -- --base origin/develop --head HEAD
npm run check:pr-release-contract -- --base origin/develop --head HEAD
git diff --check origin/develop...HEAD
```

Expected: every guard exits `0`.

- [ ] **Step 4: Reload unpacked extensions and verify the live browser flow**

Reload `product-scraper` and `coupang-ads-scraper` in Chrome, reload the open KidItem tab, confirm the extensions receive the current session, then click `전체 상품 순위 수집` on `/rank-tracking`.

Acceptance evidence:

- `GET /api/ads/keyword-rank/wing-targets` no longer returns `401`;
- the rank batch returns `started: true` or a valid no-target result;
- no access token appears in console, page DOM, URL, or error text;
- a forced stale-token test emits one refresh request and retries once;
- sign-out clears both extension token stores.

- [ ] **Step 5: Review the final diff and commit any verification-only adjustments**

Run: `git status --short`, `git diff --stat origin/develop...HEAD`, and `git diff --check origin/develop...HEAD`.

If verification required source or documentation adjustments, commit them with a focused `fix:`, `test:`, or `docs:` prefix. Do not create an empty verification commit.
