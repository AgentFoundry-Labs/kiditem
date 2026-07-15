Consult this document first instead of relying on memorized knowledge.

# web/components/providers - Global React Providers

`components/providers/` owns app-wide provider composition for React Query,
auth session handling, query error behavior, and query devtools loading. Changes
here affect every route.

## Owned Behavior

- QueryClient construction and default query options
- Global QueryCache error toast behavior
- Auth session state and SIGNED_OUT redirect ownership
- React Query devtools lazy loading policy
- One authenticated Sellpia inventory coordinator. It deduplicates claims with
  the Web Locks API plus an in-memory guard, heartbeats only its claim, and
  leaves unmounted/tab-closed leases to expire without cancellation.

## State Rules

- `AuthProvider` must stay inside `QueryProvider` because it uses
  `useQueryClient()`.
- `apiClient` owns refresh/retry/sign-out triggering for `auth_required`; global
  query error handling must not duplicate session-expired toasts.
- Route queries that render their own local error UI may opt out of the global
  toast with `meta: { suppressGlobalErrorToast: true }`.
- `installQueryClientErrorHandler()` exists so HMR-created QueryClient
  instances receive the current global handler.

## Boundary Rules

- Do not call `supabase.auth.signOut()` directly from routes; use the shared
  refresh/sign-out flow.
- Do not add route-specific query defaults here.
- Do not show generic global error toasts for transient dev fetch/chunk failures
  or handled auth-required errors.
- `BrowserCollectionProvider` excludes `inventory.sellpia`; only the claimant
  coordinator may upload/finalize/cancel that run or own its operation alert.

## Verification

```bash
npm exec --workspace=apps/web vitest -- run src/components/providers
```
