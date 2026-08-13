# web/app — App Router Routes

`src/app/` owns App Router pages, layouts, route groups, and route-local
components, hooks, and helpers. It does not own global UI primitives, global
data clients, Nest API proxies, or database access. Route groups are ownership
boundaries and do not affect public URLs.

## Route Shape

Keep page composition and route state in `page.tsx`; place route-local UI,
queries, and pure helpers in sibling `components/`, `hooks/`, and
`lib/`. Group-private shared code belongs in `(group)/_shared/`. Promote
code globally only after two route groups consume it.

## Boundaries

- Inherit the web API, React Query, database, and organization-scope rules.
- Move reusable behavior out of a page before it becomes hard to scan.
- New SSE or WebSocket surfaces require a scoped design and instruction update.
- Update the web guide and architecture map when adding or moving a route group.

The active Frontend Route Map in
[docs/ARCHITECTURE.md](../../../../docs/ARCHITECTURE.md) is the preservation
authority. The nearest route guide owns exact composition and tab contracts.
To retire a URL, extend
`src/app/__tests__/retired-sidebar-routes.spec.ts`, move every live consumer,
then remove route-only code. Do not leave a compatibility redirect without a
product-named canonical replacement.
