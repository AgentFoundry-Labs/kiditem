# apps/web — Next.js Frontend

`apps/web/` owns UI routes, browser integrations, client UI state, and React
Query access to NestJS APIs. Route groups document ownership but do not change
URLs.

## Shared Ownership

| Scope | Contract |
|---|---|
| `src/components/` | app-wide UI used by at least two route groups |
| `components/providers/` | singleton app wiring, auth/session, React Query, devtools |
| `components/panel/` | live panel, SSE/backfill, panel store and actions |
| `components/ui/` | presentational primitives; no API, auth, query, store, route, or domain logic |
| `src/lib/` | shared infrastructure and pure helpers |
| `src/hooks/` | cross-domain hooks and React Query access |
| `src/store/` | global client UI state, never server-response caching |

Keep route/domain code local until another route group genuinely consumes it.
Read the nearest scoped guide for route, component, hook, library, or store
details.

## API And State

- Backend data flows through NestJS using `apiClient`; use
  `get/post/patch/delete` or `fetchRaw()` for blobs. Raw `fetch` is not a backend
  API client, and direct `API_BASE` use is only for non-fetch URL resolution.
- Never import Prisma, `pg`, Supabase DB clients, or another direct DB client.
  Never send `organizationId`; the backend session owns scope.
- Server state uses React Query, domain hooks, and `queryKeys`. Poll with
  `refetchInterval`, invalidate relevant keys after mutation, and keep request
  caches out of Zustand/local state.
- Default to polling. Panel is the SSE exception and uses `PanelSseClient` with
  `credentials: 'include'`; another realtime domain requires a scoped plan and
  instruction update.

## UI, Types, And Errors

- Prefer focused shared imports such as `@kiditem/shared/inventory`. Keep
  page-only types local until multiple components share them.
- Branch API failures with `isApiError(err)` and use `sonner` for user-visible
  status. Reserve `alert()` for browser prompt/confirm flows.
- Compose Tailwind classes with `cn()` and use the semantic design tokens when
  editing UI. Lucide React is the icon library.
- Use formatting helpers from `@/lib/utils`; do not format directly with
  `Intl.*` or `toLocaleString()` in UI code.

## Auth And Transport

- `lib/auth/session.ts` owns opaque local-session persistence;
  `components/providers/AuthProvider.tsx` owns lifecycle, cross-tab propagation,
  expiry, extension sync, and login redirect.
- `apiClient` attaches the bearer token and clears the session on
  `auth_required`. There is no refresh endpoint or 401 retry path.
- CopilotKit calls same-origin `/api/chat/copilot`, rewritten to Nest locally.
  Do not add a Next.js `app/api/**/route.ts` proxy for Nest-owned APIs.

## Change Boundaries

- Do not add substantial behavior to 700+ line components; changes to 500+
  line components require explicit reconstruction classification. Split along
  pure helpers, presentational UI, hooks, and orchestration without changing API
  behavior.
- Update [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) when adding a
  route group, moving a route, or changing shared ownership.
- `app/agent-os/` intentionally owns fullscreen dark/cyan visualization.
  `components/panel/` owns the live panel; barcode print may use browser print
  APIs; settings may contain operational uploads/printers/health checks; login
  and auth routes remain outside business groups.

## Verification

Run narrower route tests/browser checks first when a scoped guide lists them,
then:

```bash
npm run build --workspace=apps/web
npx vitest run
```
