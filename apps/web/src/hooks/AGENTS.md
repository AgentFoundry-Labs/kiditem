Consult this document first instead of relying on memorized knowledge.

# web/hooks - Shared React Hooks

`src/hooks/` owns hooks used by multiple frontend domains. Route-local hooks
belong under `src/app/(group)/route/hooks/` until more than one route group
needs them.

## Owned Behavior

- `useAuth()` reads `/api/auth/me` through React Query.
- Period selector state shared by operational screens.
- Legacy/shared product-image hooks that are genuinely cross-route.

## State Rules

- Shared hooks may use `apiClient` and React Query only when their cache keys
  are stable and documented in `queryKeys`.
- Keep auth user-record behavior aligned with `AuthProvider` and
  `apiClient` refresh handling.
- Prefer returning structured state/actions over exposing internal query client
  details.

## Boundary Rules

- Do not place single-page hooks here.
- Do not use Zustand for server data in shared hooks.
- Do not add browser-only side effects without guarding `typeof window`.

## Verification

```bash
npm exec --workspace=apps/web vitest -- run src/hooks
```
