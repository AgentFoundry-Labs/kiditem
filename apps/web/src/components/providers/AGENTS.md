# web/components/providers - Global React Providers

`components/providers/` owns app-wide provider composition for React Query,
auth session handling, query error behavior, and query devtools loading. Changes
here affect every route.

## Owned Behavior

- QueryClient construction and default query options
- Global QueryCache error toast behavior
- Cookie-backed `/api/auth/me` state, cross-tab revalidation, explicit
  extension handoff, expiry, and signed-out redirect ownership
- React Query devtools lazy loading policy
- Sellpia freshness projection. `SellpiaInventorySyncProvider` only keeps
  freshness query state warm; server-issued OperationRuns and the extension
  browser runtime own claim, scoped collection, upload, heartbeat, and
  finalization. `inventory` collects only physical stock; `full` additionally
  stores product-profit evidence before completing the inventory generation.

## State Rules

- `AuthProvider` must stay inside `QueryProvider` because it uses
  `useQueryClient()`.
- `apiClient` emits `auth_required`; `AuthProvider` clears projections and
  redirects. Global query error handling must not duplicate session-expired
  toasts or retry 401s.
- Route queries that render their own local error UI may opt out of the global
  toast with `meta: { suppressGlobalErrorToast: true }`.
- `installQueryClientErrorHandler()` exists so HMR-created QueryClient
  instances receive the current global handler.
- `SellpiaInventorySyncProvider` is a projection only. It renders no freshness
  drawer, status entry, or manual-import UI; explicit Sellpia sync buttons call
  the shared operation hook and terminal state comes from OperationRun.
- `MallAgentLoopProvider` runs the 쇼핑몰 에이전트 자동 운전 loop while the app is
  open: passive mall login check, then order collection inside business hours.
  It mounts the runner only when auth is ready and the operator kept the loop
  on, so a disabled loop creates no query, timer, or extension traffic. One tab
  runs at a time (`navigator.locks`). The loop may only read and collect; send,
  submit, delete, and sold-out stay human-pressed on their own screens.

## Boundary Rules

- Do not persist browser credentials or redirect directly from routes; use the
  cookie-backed `AuthProvider` flow.
- Do not add route-specific query defaults here.
- Do not show generic global error toasts for transient dev fetch/chunk failures
  or handled auth-required errors.
- `BrowserCollectionProvider` excludes `inventory.sellpia`; only the extension
  browser runtime may upload/finalize/cancel that run. OperationRun is the
  terminal audit record; legacy Operation Alerts remain projection-only.
