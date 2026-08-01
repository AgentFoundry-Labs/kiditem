Consult this document first instead of relying on memorized knowledge.

# web/components/providers - Global React Providers

`components/providers/` owns app-wide provider composition for React Query,
auth session handling, query error behavior, and query devtools loading. Changes
here affect every route.

## Owned Behavior

- QueryClient construction and default query options
- Global QueryCache error toast behavior
- Auth session state, cross-tab/extension synchronization, absolute expiry, and
  signed-out redirect ownership
- React Query devtools lazy loading policy
- Sellpia freshness projection. `SellpiaInventorySyncProvider` only keeps
  freshness query state warm; server-issued OperationRuns and the extension
  browser runtime own claim, collection, upload, heartbeat, and finalization.

## State Rules

- `AuthProvider` must stay inside `QueryProvider` because it uses
  `useQueryClient()`.
- `apiClient` owns local-session clearing for `auth_required`; global query
  error handling must not duplicate session-expired toasts or retry 401s.
- Route queries that render their own local error UI may opt out of the global
  toast with `meta: { suppressGlobalErrorToast: true }`.
- `installQueryClientErrorHandler()` exists so HMR-created QueryClient
  instances receive the current global handler.
- `SellpiaInventorySyncProvider` is a projection only. It renders no freshness
  drawer, status entry, or manual-import UI; explicit Sellpia sync buttons call
  the shared operation hook and terminal state comes from OperationRun.

## Boundary Rules

- Do not clear auth storage or redirect directly from routes; use the shared
  local-session/AuthProvider flow.
- Do not add route-specific query defaults here.
- Do not show generic global error toasts for transient dev fetch/chunk failures
  or handled auth-required errors.
- `BrowserCollectionProvider` excludes `inventory.sellpia`; only the extension
  browser runtime may upload/finalize/cancel that run. OperationRun is the
  terminal audit record; legacy Operation Alerts remain projection-only.

## Verification

```bash
npm exec --workspace=apps/web vitest -- run src/components/providers
```
