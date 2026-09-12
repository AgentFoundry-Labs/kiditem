# Extension Supabase Auth Continuity Design

## Status and Authority

Approved by the user in the design conversation on 2026-07-14.

This design is an authentication platform-boundary cleanup within PR #327. It
does not change persisted schema or data behavior, so it does not require a
`VERSION` bump or data migration.

The implementation is classified as a cross-layer authentication control. It
may cross the advertising, sourcing, shared web-provider, and extension
directories because authentication is an explicit session-boundary exception,
but it must not change their unrelated business behavior.

## Context

KidItem has three Chrome extensions with different runtime roles:

- `coupang-ads-scraper` calls authenticated KidItem advertising and Channels
  APIs directly;
- `product-scraper` calls authenticated KidItem sourcing ingest APIs directly;
- `order-collector` calls marketplace APIs and returns collected data to the
  web application, so it does not need a KidItem API token.

The Coupang extension stores a Supabase access token in
`chrome.storage.local`, but the web authentication lifecycle does not keep it
current. The rank-tracking batch action can therefore detect a healthy
extension and still receive `401` from
`GET /api/ads/keyword-rank/wing-targets`.

The sourcing extension uses a separate, short-lived sourcing token with its
own issuance, renewal, middleware, expiry metadata, and tests. The user has
chosen one authentication model for every extension that calls KidItem:
store the current Supabase user access token in the extension and keep it
synchronized from the always-open, logged-in KidItem web tab.

## Operating Assumptions

Authentication continuity is guaranteed only while all of the following are
true:

- Chrome is running;
- at least one KidItem web tab remains open and logged in;
- the browser has network access;
- the relevant extension is installed and enabled;
- the external marketplace session required by the collection remains valid.

Computer sleep, Chrome termination, network outage, disabled extensions, and
expired marketplace sessions remain explicit blockers. They are not silently
reported as successful scheduled runs.

## Goals

- Make the KidItem web session the single owner of Supabase refresh behavior.
- Store only the current Supabase access token in the Coupang and sourcing
  extensions.
- Synchronize the token on initial session load, sign-in, and every Supabase
  token refresh.
- Clear extension tokens on sign-out.
- Recover from a missed synchronization when an extension receives `401`.
- Retry the original authenticated request at most once after successful token
  recovery.
- Prevent one missing or broken extension from blocking the other extension or
  the web login lifecycle.
- Remove the superseded sourcing-only token issuance and renewal path.

## Non-goals

- Giving the order collector a KidItem token.
- Storing a Supabase refresh token in any extension.
- Allowing an extension to refresh a Supabase session independently.
- Supporting unattended execution after the KidItem web tab or Chrome closes.
- Changing marketplace login persistence.
- Adding database schema, device enrollment, or long-lived service tokens.

## Considered Approaches

### Auth events only

Push the access token on `INITIAL_SESSION`, `SIGNED_IN`, and
`TOKEN_REFRESHED`. This is small, but a lost message or an extension restart
can leave the stored token stale until the next auth event.

### Auth events plus `401` recovery handshake — selected

Push the access token during the normal auth lifecycle. If an authenticated
extension request receives `401`, the extension asks the open KidItem tab for
a refresh without exposing any token in page-world events. The web refreshes
the Supabase session, pushes the new access token, and the extension retries
once.

### Store the Supabase refresh token in extensions

This would remove the open-tab dependency but create two concurrent Supabase
refresh owners, increase credential exposure, and risk refresh-token rotation
conflicts. It is rejected.

## Architecture

```text
Supabase browser session
  -> AuthProvider
       -> extension-auth orchestrator
            -> Coupang extension: setAuthToken / clearAuthToken
            -> sourcing extension: setAuthToken / clearAuthToken

authenticated extension request
  -> KidItem API
  -> 2xx: return response
  -> 401:
       -> emit token-free auth-refresh request to an allowed KidItem tab
       -> web forces/obtains a current Supabase session
       -> extension-auth pushes the new access token
       -> extension retries the original request once
       -> second 401: fail explicitly and do not loop
```

The web owns token refresh. The extensions own only storage and use of the
current access token. NestJS continues to authenticate all extension requests
through the existing global `SupabaseAuthMiddleware` and organization guard.

## Web Components

### Extension authentication orchestrator

A shared `apps/web/src/lib/extension-auth.ts` module owns extension auth
synchronization. It:

- accepts a Supabase session or `null`;
- detects the Coupang and sourcing extensions in parallel;
- sends the same `setAuthToken` or `clearAuthToken` contract to each detected
  extension;
- includes the approved sourcing API base configuration when messaging the
  sourcing extension;
- isolates failures with `Promise.allSettled()`;
- returns a structured result for tests and diagnostics without showing
  optional-extension errors to the user.

`extension-bridge.ts` remains transport-only. Detecting or pinging an
extension must not mutate authentication state.

### AuthProvider integration

`AuthProvider` invokes the orchestrator after:

- the initial `getSession()` result;
- `SIGNED_IN`;
- `TOKEN_REFRESHED`;
- `USER_UPDATED` when a session is present;
- `SIGNED_OUT`, with `null` to clear tokens;
- browser `online` and visible/focused recovery events.

The provider also listens for a token-free extension auth-refresh event. On
that event it calls `supabase.auth.refreshSession()` and synchronizes the
result. Concurrent refresh events share one in-flight web refresh operation.
Extension synchronization remains non-blocking for rendering and navigation.

## Extension Contract

Both authenticated extensions support:

```ts
{ action: "setAuthToken", token: string, apiBase?: string }
{ action: "clearAuthToken" }
```

The sourcing extension stores the token under the common
`kiditem_auth_token` key. Its former sourcing-token expiry and maximum-expiry
metadata are removed.

When an authenticated request receives `401`, the extension:

1. records the token value used for the failed request;
2. dispatches a token-free `kiditem:extension-auth-required` signal only to
   the allowlisted KidItem web origins;
3. waits up to 10 seconds for `kiditem_auth_token` to change;
4. retries the same request exactly once with the new token;
5. returns the second response without another refresh attempt.

Concurrent `401` responses within one extension share one in-flight refresh
wait so they do not create a refresh storm. Request bodies used by retryable
calls must remain reusable; streaming bodies are not part of this contract.

No access or refresh token is placed in DOM events, page messages,
`localStorage`, URLs, logs, or error text.

## Server Cleanup

The sourcing-specific token path becomes dead code and is removed:

- `POST /api/sourcing/extension/session`;
- `POST /api/sourcing/extension/session/renew`;
- `SourcingExtensionTokenService`;
- `SourcingExtensionAuthMiddleware` and its route registration;
- the sourcing-token prefix bypass in `SupabaseAuthMiddleware`;
- sourcing token issuance, verification, and renewal tests.

The sourcing ingest endpoints remain protected by the global Supabase auth
middleware and organization guard. No endpoint becomes public or uses a dev
authentication shortcut.

## Failure Semantics

- Missing extension: synchronization records `not_installed`; web login
  continues.
- Extension message failure: synchronization records `failed`; the other
  extension still synchronizes.
- Initial `401`: request enters the bounded refresh handshake.
- No open logged-in KidItem tab or refresh timeout: request fails with an
  explicit authentication error and scheduled work records a failed attempt.
- Second `401`: request fails immediately; there is no recursive retry.
- Sign-out: both extension token stores are cleared even if one clear message
  fails.

## Testing

Web tests cover:

- both installed extensions receiving the same Supabase access token;
- sourcing API base propagation;
- missing or failing extensions not blocking other synchronization;
- sign-out clearing both extensions;
- initial session, token refresh, sign-out, online, visibility, and auth-refresh
  event integration in `AuthProvider`.

Extension tests cover:

- common token storage and clearing;
- bearer use on Coupang and sourcing API requests;
- one `401` requesting refresh and retrying with a changed token;
- no retry when the token does not change before timeout;
- one shared refresh wait for concurrent `401` responses;
- no second retry after another `401`;
- no token exposure through the refresh signal.

Server tests cover:

- sourcing extension routes accepting valid Supabase bearer authentication;
- missing, invalid, or expired Supabase tokens returning `401`;
- organization context continuing to scope sourcing ingest and advertising
  reads/writes;
- removal of the sourcing-token route and middleware registration.

Required verification includes focused web, extension, auth, advertising, and
sourcing suites; server and web builds; extension syntax and manifest checks;
`npm run dev:server` boot; tenant and IDOR guards; and a live browser check
showing `전체 상품 순위 수집` passes the former `wing-targets` authentication
boundary without `401`.

## Rollout and Compatibility

The committed extensions are local/development variants. After updating the
extension files, Chrome must reload the unpacked extensions before manual
verification. Existing sourcing scoped tokens may remain in old extension
storage but are no longer read; the first web synchronization writes the
common Supabase token. Sign-out clears both the new key and any legacy sourcing
token keys during the transition.

No database migration, backfill, or dev-data update is required.
