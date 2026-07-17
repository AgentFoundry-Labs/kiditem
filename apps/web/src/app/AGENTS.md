Consult this document first instead of relying on memorized knowledge.

# web/app - App Router Routes

`src/app/` owns the Next.js App Router tree: route groups, pages, layouts, and
route-local components/hooks/lib folders. It does not own global UI primitives,
global data clients, backend API route handlers, or database access.

Route groups do not affect URLs. Treat the group folder as a documentation and
ownership boundary, not as a public path segment.

## Route Shape

```text
(group)/route/
├── page.tsx                 # composition and route state
├── components/              # route-local UI
├── hooks/                   # route-local React Query or workflow hooks
└── lib/                     # route-local API wrappers, pure helpers, schemas
```

Route-group private shared code lives in `(group)/_shared/`. Global shared code
belongs in `src/components`, `src/hooks`, or `src/lib` only after at least two
route groups need it.

## State Rules

- Backend data flows through `apiClient` and React Query.
- Keep durable server state out of local React state and Zustand.
- `page.tsx` should compose state and sections; move reusable behavior to
  route-local `hooks/` or `lib/` before the page becomes hard to scan.
- Prefer `queryKeys` entries for server state. Add a key before introducing a
  new cross-component query family.
- Use `refetchInterval` for polling. New SSE or WebSocket surfaces require a
  scoped plan and an instruction update.

## Boundary Rules

- Do not add `app/api/*/route.ts` handlers for Nest-owned APIs. The known local
  exception is `auth/callback`.
- Do not send `organizationId`; backend session scope owns tenancy.
- Do not import Prisma, `pg`, Supabase DB clients, or backend adapters.
- Do not move route-local components into global `src/components` until another
  route group actually imports them.
- When adding a route group or moving a route, update `apps/web/AGENTS.md` and
  `docs/ARCHITECTURE.md`.

## Preserved Operations Surfaces (`0.1.19` baseline, `0.1.20` confirmation)

Commit `c9e7caf875ca82574ae566a27fe0afa35c988918` is the operations UI
preservation baseline. Keep its sidebar sections, independent URLs, page
hierarchy, and primary interactions. Sellpia freshness, synchronization, and
channel-component matching are additive capabilities; do not replace an
existing screen with a consolidated workspace or compatibility redirect.

Important ownership rules:

- `/product-hub` keeps the staged product-operations-center composition:
  command cards, category strip, filter toolbar, metrics columns, and product
  rows. Its list and detail data source is Products-owned `MasterProduct`;
  product metadata create/edit and central `ProductVariant` recipes are owned
  here. Neither `/product-hub` nor `/product-hub/[id]` initiates inventory
  collection.
- `/product-hub/matching` is a two-level workspace: first map a channel listing
  to `MasterProduct`, then map its channel option to `ProductVariant`. Recipe
  composition and calculated capacity remain read-only on this route.
- `/inventory-hub`, `/inventory`, `/stock-ops`, `/order-hub`,
  `/order-collection`, `/orders`, `/unshipped-items`, `/outbound`,
  `/order-status-hub`, and `/rocket-orders` remain independently reachable
  operational surfaces.
- `/rocket-orders` keeps its `c9e7caf8` shell and replaces the existing
  `납품 수량 판단 추후 연동` placeholder with the deterministic Sellpia
  freshness/component-capacity preview. `/purchase-orders?tab=rocket` may expose
  the same preview capability without replacing either route's layout.
- `/product-hub/options` keeps the dedicated complete, read-only Sellpia
  inventory table.

Existing routes may share extracted components, but each route keeps its own
operator-facing composition. Standard shell affordances such as Quick Action
are not suppressed solely because a page is dense. Add compact Sellpia status,
drawer entry points, and synchronization controls without replacing or
rearranging the existing header, tabs, tables, or actions.

Sellpia freshness is shared application state, not route-local state. Pages may
open the shared drawer or render the compact status, but must not derive TTL,
own claim/heartbeat timers, upload browser bytes outside the coordinator, or
write stock. Rocket confirmation is exposed through the shared Supply workspace
in `0.1.20`: it reruns the preview, creates an internal component-capacity
allocation, and downloads the official workbook. It must not call a marketplace
provider or write Sellpia physical stock.

The preserved baseline contents include:

- `/inventory-hub`: `status`, `po`, `io`, `sellpia-sync`, `rocket-events`,
  `ledger`, `audits`, and `assets`;
- `/stock-ops`: `sellpia-zero`, `channel-zero`, `bottlenecks`,
  `mapping-attention`, `inventory-value`, `freshness`, `transfer`, and
  `return-transfer`;
- `/order-hub`: `orders`, `collection`, `picking`, `outbound`, and `matching`;
- `/order-status-hub`: `inventory`, `delivery`, `compare`, and `sync`.
