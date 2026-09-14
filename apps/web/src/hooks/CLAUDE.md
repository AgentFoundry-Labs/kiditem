Before working in this directory, always read this document first rather than relying on memory.

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
- `useTrendSourceCollection()` shares explicit Naver/Shorts owner collection,
  retry-key correlation, and React Query source status across Sourcing and Dashboard.
- `useUrlControlledTab()` for allow-listed canonical workspace selection while
  preserving query parameters owned by nested views and filters.
- `useMallAgentLoopRunner()` is the only place that drives the mall agent loop
  on a timer; `useMallAgentLoop()` is the read/toggle view for screens. The
  runner composes existing shared actions (`sweepMallSessions`,
  `usePersistedAllMarketplaceOrderCollection`) instead of new collectors, skips
  a round when another tab holds the lock, and never performs irreversible mall
  work. Loop settings and schedule live in `lib/mall-agent-loop.ts`.
- A round collects only the malls a human is not already blocking. The probe's
  `signedOutKeys` plus the auto-login blocks become `collectAllOrders`'
  skip list; collecting a signed-out mall only opens its login page, fails, and
  leaves one more tab behind each round. `unknown` is not a skip — no signal is
  not a logged-out signal.
- A mall that did not answer in time is asked **once** more at the end of the
  round (`RECHECK_LIMIT` of them), because a busy service worker usually answers
  the second time. The re-check never re-checks its own result, so the pass
  count is fixed; a second silence is recorded as 응답 없음 and left for the
  next round.
- `useProductAbcRecalculation()` shares Products' ABC publication trigger
  between Product Management and Dashboard: the `SOURCE_NOT_READY` and
  conflict outcomes, and refetching before reporting. Each caller passes the
  reads it renders.

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
