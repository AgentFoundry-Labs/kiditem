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
preservation baseline. Its direct operations URLs, page hierarchy, primary
interactions, and normal app-shell affordances remain independently usable;
shared components must not turn them into redirects or consolidated
replacements. Sellpia freshness, synchronization, matching, and Rocket capacity
features are additive.

Before changing a preserved route's composition or tabs, read the nearest route
guide and the Frontend Route Map in [`docs/ARCHITECTURE.md`](../../../../docs/ARCHITECTURE.md).
The nearest guide owns the exact route-specific layout and tab contract.
