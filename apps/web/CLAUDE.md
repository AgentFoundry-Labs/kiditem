Before working in this directory, always read this document first rather than relying on memory.

# apps/web — Next.js Frontend

`apps/web/` owns UI routes, browser integrations, client UI state, and React
Query access to NestJS APIs. Route groups document ownership but do not change
URLs. Keep route code local until another route group genuinely consumes it;
the nearest scoped guide owns route-specific composition.

## Shared Ownership

- `src/components/`: UI shared by at least two route groups.
- `components/providers/`: singleton app wiring and session/query providers.
- `components/alerts/`: the global durable-notification view.
- `components/ui/`: presentational primitives without API, auth, store, route,
  or domain behavior.
- `src/lib/`, `src/hooks/`, and `src/store/`: shared infrastructure,
  cross-domain hooks, and global UI state. Store never caches server responses.

## API And State

- Backend data uses `apiClient`; use `fetchRaw()` only for blobs. Raw
  `fetch` is not a backend client.
- Inherit the root database and organization-scope prohibitions.
- Server state uses React Query, domain hooks, and `queryKeys`. Poll with
  `refetchInterval` and invalidate only affected families after mutation.
- Collection source-status queries wrap their options in
  `collectionSourceStatusQueryOptions` and gate collection actions through
  `collectionSourceStatusRead`: block only until a first status read, then act
  on the last known status.
- Notifications use the shared Alert query: foreground polling every ten
  seconds, refetch on focus, and invalidation after dismissal. Keep progress
  and source status in their owner screens. A new realtime domain requires a
  scoped design and instruction update.
- Use focused shared types, `isApiError` for API failures, `sonner` for
  user status, `cn()` plus semantic tokens for styles, Lucide for icons, and
  shared formatting helpers.

## Auth And Transport

The HttpOnly `kiditem_session` cookie is the browser's sole credential.
`AuthProvider.tsx` projects `/api/auth/me` through React Query and owns
cross-tab revalidation, expiry, and redirect. `apiClient` always uses cookie
credentials, never reads or attaches a browser bearer token, and emits
`auth_required` without retrying a 401. Extensions receive a token only through
the explicit `/api/auth/extension-handoff` boundary. CopilotKit uses
same-origin `/api/copilotkit`; do not add a Next.js route handler for Nest-owned
APIs.

Agent interaction bootstrap is React Query server state. Its Zustand store may
hold only open/agent/session-thread/draft ephemeral UI state; never persist or
duplicate messages, replay events, or bootstrap responses. CopilotKit v2 owns
the in-memory transcript/tool state and connects only through same-origin
`/api/copilotkit`. Use public focused v2 exports; do not use `useThreads`,
Premium/Enterprise APIs, private internals, or `@copilotkit/react-ui`.

## Change Boundaries

- Split large components along pure helpers, presentational UI, hooks, and
  orchestration without changing API behavior.
- Update [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md) for route-group,
  route, or shared-ownership changes.
- Agent OS visualization, notifications, print helpers, operational settings, and
  auth routes keep their documented special ownership; do not generalize them
  into other route groups.

## Verification

Run the nearest route tests or browser checks first, then inherit the root
frontend build gate. Use `npx vitest run` when the change spans shared web
behavior.
