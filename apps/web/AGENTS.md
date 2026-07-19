# apps/web — Next.js Frontend

`apps/web/` is the Next.js frontend. It owns UI routes, client-side state,
React Query data access, and browser-only integrations. It does not own backend
API routes or database access.

## Scoped Guide Discovery

Do not rely on this file as a route index or on remembered route rules. Before
editing a web file, use `rg --files -g AGENTS.md apps/web/src` and read every
applicable guide in path order: `apps/web/AGENTS.md`, then any `AGENTS.md`
under `src/app`, route group, route, or shared component/helper directory that
contains the target file. Route groups do not affect URLs.

When a change expands into another route group, shared frontend folder, or
nested route, rerun discovery and read the newly applicable guide before
editing there. Shared frontend guidance lives beside the owned surface:
`src/components/AGENTS.md`, `src/hooks/AGENTS.md`, `src/lib/AGENTS.md`,
`src/store/AGENTS.md`, and any nested `AGENTS.md` under those folders.
Web `Folder Map` sections are intentionally sparse; use `rg --files` for route
contents and keep local maps only when they encode ownership or exceptions.

## Shared Frontend Boundaries

| Scope | Ownership |
|---|---|
| `src/components/` | App-wide components used by 2+ routes/groups. Keep route/domain UI route-local until it is truly shared. |
| `components/providers/` | Singleton app wiring only: React Query client, global query error handling, auth session provider, devtools loading. |
| `components/panel/` | Live notification/work panel, SSE client, fallback snapshot/backfill, panel store, and panel-specific alert/task actions. |
| `components/ui/` | Presentational primitives only. No `apiClient`, React Query, auth, Zustand, route logic, or domain contracts. |
| `src/lib/` | Shared frontend infrastructure and pure helpers: `apiClient`, `queryKeys`, error helpers, auth/session helpers, browser integration helpers. |
| `src/hooks/` | Shared hooks used by 2+ domains. Server-state hooks use React Query and `queryKeys`. |
| `src/store/` | Global client UI state only. No request/response caching; panel keeps its own colocated store. |

## API + State Rules

- All backend data flows through NestJS APIs via `apiClient`.
- Use `apiClient.get/post/patch/delete`; use `apiClient.fetchRaw()` for blobs.
- Do not use raw `fetch` for backend API calls.
- Direct `API_BASE` usage is allowed only for non-fetch URL resolution.
- Do not import Prisma, `pg`, server DB adapters, Supabase DB clients, or
  direct DB clients.
- Never send `organizationId` in query/body; backend session scope owns it.
- Server state uses React Query. Prefer domain hooks and `queryKeys`.
- Polling uses `refetchInterval`, not `setInterval`.
- Mutations invalidate relevant query keys.
- Zustand is only for client UI state, not request/response server state.

## Types, Errors, Styling

- Prefer focused shared subpaths such as `@kiditem/shared/inventory`.
- Keep single-page props/types local unless 2+ components share them.
- Branch API errors with `isApiError(err)`.
- Use `sonner` toasts for user-facing success/error. Avoid `alert()` except
  browser prompt/confirm flows.
- Tailwind classes compose with `cn()` from `@/lib/utils`.
- Prefer semantic CSS variables for edited UI:
  `--surface`, `--surface-sunken`, `--surface-raised`, `--text-*`,
  `--border*`, `--primary`, `--primary-soft`.
- Lucide React is the icon library.
- Formatting goes through helpers in `@/lib/utils`; avoid direct `Intl.*` or
  `toLocaleString()` in UI code.

## Auth + Chat Transport

- 401 refresh/sign-out flow is owned by `lib/supabase/refresh.ts` and
  `components/providers/AuthProvider.tsx`. Do not add direct
  `supabase.auth.signOut()`, `window.location.assign('/login')`, or separate
  401 redirect/toast handling.
- CopilotKit browser runtime calls same-origin `/api/chat/copilot`.
  `next.config` rewrites it to Nest for local/dev. Do not add
  `app/api/.../route.ts`.

## Boundary Rules

- Do not add substantial behavior to 700+ line components.
- Changes to 500+ line components require explicit reconstruction
  classification in review.
- Split by pure helpers, presentational components, hooks, and orchestration
  while keeping API behavior stable.
- Default to polling. Panel is the SSE exception and uses `PanelSseClient`
  with `credentials: 'include'`.
- New SSE domains require a scoped plan and instruction update.
- Update [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) when a PR adds a
  route group, moves a route, or changes shared ownership.

## Local Exceptions

- `app/agent-os/` owns `/agent-os` and `/agent-os/network`, fullscreen
  visualization surfaces with intentionally hard-coded dark/cyan styling.
- `components/panel/` owns the live slide-out panel and SSE store.
- `app/(inventory)/inventory/lib/barcode-print.ts` may use browser print APIs.
- `app/settings/` may contain operational uploads, printer settings, and health
  checks.
- `app/login/` and `app/auth/` are auth shell/callback routes outside business
  route groups.

## Verification

Route guides may omit local `Verification` when this app-level gate is enough.
Add a local section only for route-specific tests, browser checks, or
cross-layer contracts that would otherwise be easy to miss. When a local
section lists narrow tests, run them before this app-level gate.

```bash
npm run build --workspace=apps/web
npx vitest run
```
