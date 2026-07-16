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

## Canonical Operations Workspaces (`0.1.19`)

The sidebar has exactly five dense operations entries:

- `/product-hub` — URL-owned `view=list|options`;
- `/product-hub/matching` — standalone channel/Sellpia recipe workspace;
- `/order-hub` — URL-owned `tab=collection|processing|shipping|exceptions`;
- `/purchase-orders` — URL-owned `tab=general|rocket`;
- `/inventory-hub` — URL-owned `tab=overview|inventory|attention|history`.

Canonical tabs use the allow-listed URL hooks, semantic keyboard tabs,
`unmountInactive`, one page `h1`, and named pagination controls where paging
exists. Dense canonical routes suppress the floating Quick Action and render one
inline Sellpia freshness status backed by the app-wide coordinator/drawer. Do
not mount another page component to reuse a legacy surface.

`/inventory`, `/stock-ops`, `/order-collection`, `/orders`,
`/unshipped-items`, `/outbound`, `/order-status-hub`, `/rocket-orders`, and
`/product-hub/options` are compatibility redirects. Legacy `inventory-hub` and
`order-hub` tab aliases also redirect to the canonical tab/view. Redirects must
consume only legacy `tab`/`view`, let canonical mapped keys win, preserve
unrelated and repeated query values, and avoid loops. New internal links and
operation alerts use canonical URLs only.

Sellpia freshness is shared application state, not route-local state. Pages may
open the shared drawer or render the compact status, but must not derive TTL,
own claim/heartbeat timers, upload browser bytes outside the coordinator, or
write stock. Rocket under `/purchase-orders?tab=rocket` remains preview-only;
no actual confirmation/submission/reservation/workbook/stock control may be
introduced for release `0.1.19`.
