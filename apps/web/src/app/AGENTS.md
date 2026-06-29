Consult this document first instead of relying on memorized knowledge.

# web/app - App Router Routes

`src/app/` owns the Next.js App Router tree: route groups, pages, layouts, and
route-local components/hooks/lib folders. It does not own global UI primitives,
global data clients, backend API route handlers, or database access.

## Folder Map

```text
app/
├── (route-groups)/          # business-domain UI routes
├── auth/                    # auth callback route shell
├── login/                   # login page and local hooks
├── settings/                # operational settings and health checks
└── agent-os/                # fullscreen Agent OS visualization surface
```

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

## Verification

```bash
npm run build --workspace=apps/web
```
