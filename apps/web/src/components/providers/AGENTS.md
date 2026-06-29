Consult this document first instead of relying on memorized knowledge.

# web/components/providers - Global React Providers

`components/providers/` owns app-wide provider composition for React Query,
auth session handling, query error behavior, and query devtools loading. Changes
here affect every route.

## Folder Map

```text
providers/
├── AuthProvider.tsx
├── QueryProvider.tsx
├── query-client.ts
└── query-devtools.ts
```

## Owned Behavior

- QueryClient construction and default query options
- Global QueryCache error toast behavior
- Auth session state and SIGNED_OUT redirect ownership
- React Query devtools lazy loading policy

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

## Verification

```bash
npm exec --workspace=apps/web vitest -- run src/components/providers
npm run build --workspace=apps/web
```
