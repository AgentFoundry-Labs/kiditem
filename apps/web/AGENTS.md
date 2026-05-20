# apps/web — Next.js Frontend

`apps/web/` is the Next.js frontend. It owns UI routes, client-side state,
React Query data access, and browser-only integrations. It does not own backend
API routes or database access.

## Folder Map

```text
apps/web/
├── src/
│   ├── app/                 # route groups and pages
│   ├── components/          # shared components used by 2+ domains
│   ├── hooks/               # shared hooks used by 2+ domains
│   ├── lib/                 # apiClient, query keys, utils
│   └── styles/
└── next.config.*            # rewrites, build config
```

Route shape:

```text
app/(group-name)/{domain}/
├── page.tsx
├── components/
├── hooks/
└── lib/
```

Route-group private shared code can live in `app/(group)/_shared/`. Global
`src/components`, `src/hooks`, and `src/lib` are only for code used by 2+
domains.

## Route Groups

Route groups do not affect URLs.

| Group | Routes |
|---|---|
| `(advertising)` | `ad-ops` |
| `(analytics)` | `dashboard` |
| `(automation)` | `agents`, `workflows`, `marketplace`, `action-board` |
| `(catalog)` | `products`, `product-hub` |
| `(sourcing-ai)` | `sourcing-ai` |
| `(product-pipeline)` | collected/registered products, product generation, detail generation, thumbnail AI/generation |
| `(supply)` | `suppliers`, `purchase-orders` |
| `(inventory)` | inventory, hubs, stock ops, warehouses, unshipped, outbound |
| `(orders)` | orders, returns, reviews, return scan, CS |
| `(finance)` | finance hub, P&L, sales analysis, suppliers, reports |

## Scoped Guides

Read the route guide before editing:

| Path | Focus |
|---|---|
| [`src/app/(automation)/workflows/AGENTS.md`](<src/app/(automation)/workflows/AGENTS.md>) | workflow page/query behavior |
| [`src/app/(catalog)/product-hub/matching/AGENTS.md`](<src/app/(catalog)/product-hub/matching/AGENTS.md>) | product matching |
| [`src/app/(product-pipeline)/product-pipeline/collected-products/AGENTS.md`](<src/app/(product-pipeline)/product-pipeline/collected-products/AGENTS.md>) | collected product workspace |
| [`src/app/(product-pipeline)/product-pipeline/thumbnail-generation/AGENTS.md`](<src/app/(product-pipeline)/product-pipeline/thumbnail-generation/AGENTS.md>) | thumbnail generation workflow |
| [`src/app/(product-pipeline)/product-pipeline/thumbnail-ai/AGENTS.md`](<src/app/(product-pipeline)/product-pipeline/thumbnail-ai/AGENTS.md>) | thumbnail polling/batch UI |
| [`src/app/(orders)/return-scan/AGENTS.md`](<src/app/(orders)/return-scan/AGENTS.md>) | local-only scan flow |

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

- `app/agent-os/` is a fullscreen visualization surface with intentionally
  hard-coded dark/cyan styling.
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
