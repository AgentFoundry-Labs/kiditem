# web/hooks - Shared React Hooks

`src/hooks/` owns hooks used by multiple frontend domains. Route-local hooks
belong under `src/app/(group)/route/hooks/` until more than one route group
needs them.

## Owned Behavior

- `useAuth()` reads `/api/auth/me` through React Query.
- Period selector state shared by operational screens.
- Legacy/shared product-image hooks that are genuinely cross-route.
- Sellpia freshness state and refresh requests, including authenticated
  `refetchInterval` polling. Import history and current-basis reads stay with
  their owning inventory screens instead of being prefetched globally.
- `useAllMarketplaceOrderCollection()` composes the exact per-account extension
  collection, session lifecycle, zero/login classification, and generated-file
  callback shared by the order screen and dashboard.
- `useUrlControlledTab()` for allow-listed canonical workspace selection while
  preserving query parameters owned by nested views and filters.

## State Rules

- Shared hooks may use `apiClient` and React Query only when their cache keys
  are stable and documented in `queryKeys`.
- Keep auth user-record behavior aligned with `AuthProvider` and
  `apiClient` refresh handling.
- Prefer returning structured state/actions over exposing internal query client
  details.
- URL-controlled route selection is derived directly from `useSearchParams`;
  do not mirror it into local React state. Invalid values normalize to the
  declared default, and setters change only the hook's owned query key.

## Boundary Rules

- Do not place single-page hooks here.
- Do not use Zustand for server data in shared hooks.
- Do not add browser-only side effects without guarding `typeof window`.
