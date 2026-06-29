Consult this document first instead of relying on memorized knowledge.

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
| `(automation)` | `action-board`, `agents`, `marketplace`, `workflows` |
| `(catalog)` | `product-hub`, `product-hub/[id]`, `product-hub/matching`, `product-hub/options` |
| `(sourcing-ai)` | `sourcing-ai`, `sourcing-ai/category-sourcing`, `sourcing-ai/competitor-analysis`, `sourcing-ai/final-selection`, `sourcing-ai/keywords`, `sourcing-ai/market`, `sourcing-ai/recommendations`, `sourcing-ai/settings`, `sourcing-ai/validation`, `sourcing-ai/wholesale-search`, `sourcing-ai/wing-catalog` |
| `(product-pipeline)` | `product-pipeline/collected-products`, `product-pipeline/collected-products/[id]`, `product-pipeline/collected-products/[id]/editor`, `product-pipeline/collected-products/[id]/templates`, `product-pipeline/detail-pages/[generationId]/editor`, `product-pipeline/detail-template-generation`, `product-pipeline/productgenerate`, `product-pipeline/registered-products`, `product-pipeline/registered-products/[workspaceId]`, `product-pipeline/thumbnail-ai`, `product-pipeline/thumbnail-generation`, `product-pipeline/thumbnail-generation/edit` |
| `(supply)` | `suppliers`, `purchase-orders` |
| `(inventory)` | `coupang-shipments`, `inventory`, `inventory-hub`, `outbound`, `stock-ops`, `unshipped-items`, `warehouses` |
| `(orders)` | `cs-management`, `order-collection`, `order-hub`, `order-status-hub`, `orders`, `return-scan`, `returns`, `reviews`, `rocket-orders` |
| `(finance)` | `finance-hub`, `profit-loss`, `reports`, `sales-analysis`, `supplier-hub` |

## Scoped Guides

Read the most-specific guide before editing. For route work, read
`src/app/AGENTS.md`, then the route-group guide, then any route guide.

### Route Group Guides

| Path | Focus |
|---|---|
| [`src/app/AGENTS.md`](src/app/AGENTS.md) | App Router ownership and route shape |
| [`src/app/(advertising)/AGENTS.md`](<src/app/(advertising)/AGENTS.md>) | ad operations route group |
| [`src/app/(analytics)/AGENTS.md`](<src/app/(analytics)/AGENTS.md>) | dashboard read models |
| [`src/app/(automation)/AGENTS.md`](<src/app/(automation)/AGENTS.md>) | workflows, agents, marketplace, action board |
| [`src/app/(catalog)/AGENTS.md`](<src/app/(catalog)/AGENTS.md>) | catalog products and channel matching |
| [`src/app/(finance)/AGENTS.md`](<src/app/(finance)/AGENTS.md>) | P&L, settlements, costs, payments |
| [`src/app/(inventory)/AGENTS.md`](<src/app/(inventory)/AGENTS.md>) | stock, warehouses, fulfillment |
| [`src/app/(orders)/AGENTS.md`](<src/app/(orders)/AGENTS.md>) | orders, returns, CS, Rocket PO |
| [`src/app/(product-pipeline)/AGENTS.md`](<src/app/(product-pipeline)/AGENTS.md>) | sourcing content pipeline |
| [`src/app/(sourcing-ai)/AGENTS.md`](<src/app/(sourcing-ai)/AGENTS.md>) | sourcing discovery workspace |
| [`src/app/(supply)/AGENTS.md`](<src/app/(supply)/AGENTS.md>) | suppliers and purchase orders |

### Focused Route And Area Guides

| Path | Focus |
|---|---|
| [`src/app/(advertising)/ad-ops/AGENTS.md`](<src/app/(advertising)/ad-ops/AGENTS.md>) | Coupang ads operations |
| [`src/app/(analytics)/dashboard/AGENTS.md`](<src/app/(analytics)/dashboard/AGENTS.md>) | dashboard route details |
| [`src/app/(automation)/action-board/AGENTS.md`](<src/app/(automation)/action-board/AGENTS.md>) | action task operations |
| [`src/app/(automation)/agents/AGENTS.md`](<src/app/(automation)/agents/AGENTS.md>) | Agent OS runtime views |
| [`src/app/(automation)/workflows/AGENTS.md`](<src/app/(automation)/workflows/AGENTS.md>) | workflow page/query behavior |
| [`src/app/(catalog)/product-hub/AGENTS.md`](<src/app/(catalog)/product-hub/AGENTS.md>) | product hub list/detail/options |
| [`src/app/(catalog)/product-hub/matching/AGENTS.md`](<src/app/(catalog)/product-hub/matching/AGENTS.md>) | product matching |
| [`src/app/(inventory)/coupang-shipments/AGENTS.md`](<src/app/(inventory)/coupang-shipments/AGENTS.md>) | shipment files and extension support |
| [`src/app/(inventory)/stock-ops/AGENTS.md`](<src/app/(inventory)/stock-ops/AGENTS.md>) | stock operation projections |
| [`src/app/(orders)/order-collection/AGENTS.md`](<src/app/(orders)/order-collection/AGENTS.md>) | marketplace order collection |
| [`src/app/(orders)/order-status-hub/AGENTS.md`](<src/app/(orders)/order-status-hub/AGENTS.md>) | order status read models |
| [`src/app/(orders)/return-scan/AGENTS.md`](<src/app/(orders)/return-scan/AGENTS.md>) | local-only scan flow |
| [`src/app/(orders)/rocket-orders/AGENTS.md`](<src/app/(orders)/rocket-orders/AGENTS.md>) | Rocket PO confirmation |
| [`src/app/(product-pipeline)/product-pipeline/_shared/AGENTS.md`](<src/app/(product-pipeline)/product-pipeline/_shared/AGENTS.md>) | product-pipeline shared code |
| [`src/app/(product-pipeline)/product-pipeline/_shared/components/detail-editor/AGENTS.md`](<src/app/(product-pipeline)/product-pipeline/_shared/components/detail-editor/AGENTS.md>) | detail-page editing surface |
| [`src/app/(product-pipeline)/product-pipeline/collected-products/AGENTS.md`](<src/app/(product-pipeline)/product-pipeline/collected-products/AGENTS.md>) | collected product workspace |
| [`src/app/(product-pipeline)/product-pipeline/detail-template-generation/AGENTS.md`](<src/app/(product-pipeline)/product-pipeline/detail-template-generation/AGENTS.md>) | template detail generation |
| [`src/app/(product-pipeline)/product-pipeline/productgenerate/AGENTS.md`](<src/app/(product-pipeline)/product-pipeline/productgenerate/AGENTS.md>) | product generation workflow |
| [`src/app/(product-pipeline)/product-pipeline/registered-products/AGENTS.md`](<src/app/(product-pipeline)/product-pipeline/registered-products/AGENTS.md>) | confirmed channel listings |
| [`src/app/(product-pipeline)/product-pipeline/thumbnail-generation/AGENTS.md`](<src/app/(product-pipeline)/product-pipeline/thumbnail-generation/AGENTS.md>) | thumbnail generation workflow |
| [`src/app/(product-pipeline)/product-pipeline/thumbnail-ai/AGENTS.md`](<src/app/(product-pipeline)/product-pipeline/thumbnail-ai/AGENTS.md>) | thumbnail polling/batch UI |
| [`src/app/(sourcing-ai)/sourcing-ai/AGENTS.md`](<src/app/(sourcing-ai)/sourcing-ai/AGENTS.md>) | sourcing research routes |
| [`src/app/(sourcing-ai)/sourcing-ai/keywords/AGENTS.md`](<src/app/(sourcing-ai)/sourcing-ai/keywords/AGENTS.md>) | keyword collection and analysis |
| [`src/app/(sourcing-ai)/sourcing-ai/recommendations/AGENTS.md`](<src/app/(sourcing-ai)/sourcing-ai/recommendations/AGENTS.md>) | today recommendations |
| [`src/app/(sourcing-ai)/sourcing-ai/wing-catalog/AGENTS.md`](<src/app/(sourcing-ai)/sourcing-ai/wing-catalog/AGENTS.md>) | Wing catalog collection |

### Shared Frontend Guides

| Path | Focus |
|---|---|
| [`src/components/AGENTS.md`](src/components/AGENTS.md) | shared component ownership |
| [`src/components/panel/AGENTS.md`](src/components/panel/AGENTS.md) | live panel and SSE exception |
| [`src/components/providers/AGENTS.md`](src/components/providers/AGENTS.md) | React Query and auth providers |
| [`src/components/ui/AGENTS.md`](src/components/ui/AGENTS.md) | domain-neutral UI primitives |
| [`src/hooks/AGENTS.md`](src/hooks/AGENTS.md) | shared hooks |
| [`src/lib/AGENTS.md`](src/lib/AGENTS.md) | shared API client, query keys, auth, extensions |
| [`src/store/AGENTS.md`](src/store/AGENTS.md) | global client-only UI state |

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

```bash
npm run build --workspace=apps/web
npx vitest run
```
