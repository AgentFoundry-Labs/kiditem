# apps/web — Next.js Frontend

Frontend only. No API routes or route handlers. All data flows through the
NestJS API via `apiClient`.

Local dev usually sets `NEXT_PUBLIC_API_URL=http://localhost:4000`.
Staging/production should leave it empty so browser calls stay same-origin
(`/api/*`) through the edge proxy.

## Chat Transport Exception

CopilotKit browser runtime calls same-origin `/api/chat/copilot`. `next.config`
rewrites that path to Nest for local/dev. This is transport only; do not add
`app/api/.../route.ts`. Other domains use `apiClient` and the backend API.

## Run

```bash
npm run dev
npm run build
npx vitest run
```

## Scope Instructions

- Read the route-scoped `AGENTS.md` before editing a route that has one.
- Shared frontend rules live here. Do not append history; replace or compact
  nearby rules when adding durable guidance.

## API And State

- Use `apiClient.get/post/patch/delete`; use `apiClient.fetchRaw()` for blobs.
- Do not use raw `fetch` for backend API calls.
- Direct `API_BASE` usage is allowed only for non-fetch URL resolution.
- Frontend code must not import Prisma, `pg`, server DB adapters, or direct DB
  clients.
- Never send `organizationId` in query/body. Tenant scope is resolved by the
  backend session.
- Server state uses React Query. Prefer domain hooks; otherwise use inline
  `useQuery`/`useMutation` with `queryKeys`.
- Polling uses `refetchInterval`, not `setInterval`.
- Mutations invalidate the relevant query key.
- Zustand is only for client UI state such as sidebar/panel preferences or SSE
  queues, not request/response server state.

## Types And Errors

- Prefer focused shared subpaths such as `@kiditem/shared/inventory`.
- Do not expand the root `@kiditem/shared` barrel for new domains.
- Keep single-page props/types local unless 2+ components share them.
- Branch API errors with `isApiError(err)`.
- Use `sonner` toasts for user-facing errors/success. No `alert()` except
  browser prompt/confirm flows.

## Styling

- Tailwind + `cn()` from `@/lib/utils`.
- No conditional template-literal class strings; use `cn('base', condition &&
  'class')`.
- Prefer semantic CSS variables for edited UI:
  `--surface`, `--surface-sunken`, `--surface-raised`, `--text-*`,
  `--border*`, `--primary`, `--primary-soft`.
- Hard-coded `bg-white` / `text-slate-*` is legacy; convert when editing.
- Use `useChartTheme()` for charts and `<ThemedToaster />` for toasts.
- Lucide React is the icon library.
- Formatting goes through helpers in `@/lib/utils`; do not call `Intl.*` or
  `toLocaleString()` directly in UI code.

## Route Structure

```text
app/(group-name)/{domain}/
  page.tsx
  components/
  hooks/
  lib/
```

Shared directories (`src/components`, `src/hooks`, `src/lib`) are only for code
used by 2+ domains. Route-group private shared code can live in
`app/(group)/_shared/`.

The current frontend directory map and route/shared structure contracts live in
[`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md#frontend-directory-architecture).
When a PR adds a route group, moves a route, or changes shared ownership,
update that map in the same PR.

Route groups do not affect URLs:

| Group | Routes |
|---|---|
| `(advertising)` | ad-ops |
| `(analytics)` | dashboard |
| `(automation)` | agents, workflows, marketplace, action-board |
| `(catalog)` | products, product-hub |
| `(sourcing)` | sourcing, sourcing-ai, suppliers, purchase-orders |
| `(inventory)` | inventory, inventory-hub, stock-ops, warehouses, unshipped-items, outbound |
| `(orders)` | orders, order-hub, order-status-hub, returns, reviews, return-scan, cs-management |
| `(finance)` | finance-hub, profit-loss, sales-analysis, supplier-hub, reports |
| `(media-ai)` | thumbnails, thumbnail-editor, image-hub, generate |

## Large Components

- Do not add substantial behavior to 700+ line components.
- Changes to 500+ line components require explicit reconstruction
  classification in review.
- Split by pure helpers, presentational components, hooks, and orchestration
  while keeping API behavior stable.

## SSE

- Default to polling.
- Panel is the SSE exception. Use `PanelSseClient` only; it sends cookies with
  `credentials: 'include'`.
- New SSE domains require a scoped plan and instruction update.

## Domain Guides

Read these before editing the matching route:

| Path | Focus |
|---|---|
| [`src/app/(automation)/workflows/AGENTS.md`](<src/app/(automation)/workflows/AGENTS.md>) | workflow page/query behavior |
| [`src/app/(catalog)/product-hub/matching/AGENTS.md`](<src/app/(catalog)/product-hub/matching/AGENTS.md>) | product matching |
| [`src/app/(media-ai)/thumbnail-editor/AGENTS.md`](<src/app/(media-ai)/thumbnail-editor/AGENTS.md>) | thumbnail editor generation workflow |
| [`src/app/(media-ai)/thumbnails/AGENTS.md`](<src/app/(media-ai)/thumbnails/AGENTS.md>) | thumbnails polling/batch UI |
| [`src/app/(orders)/return-scan/AGENTS.md`](<src/app/(orders)/return-scan/AGENTS.md>) | local-only scan flow |
| [`src/app/(sourcing)/sourcing/AGENTS.md`](<src/app/(sourcing)/sourcing/AGENTS.md>) | sourcing editor and AI panels |

## Local Exceptions

- `app/agent-os/` is a fullscreen visualization surface and intentionally uses a
  hard-coded dark/cyan style outside the normal semantic token guidance.
- `components/panel/` owns the live slide-out panel and SSE store.
- `app/(inventory)/inventory/lib/barcode-print.ts` may use browser print APIs.
- `app/settings/` may contain operational uploads, printer settings, and health
  checks.
- `app/login/` and `app/auth/` are auth shell/callback routes outside business
  route groups.

## Verification

```bash
npm run build --workspace=apps/web
npx vitest run
```
