Consult this document first instead of relying on memorized knowledge.

# web/rocket-orders - Legacy Rocket PO Redirect

`app/(orders)/rocket-orders/` preserves old `/rocket-orders` bookmarks as a
query-aware server redirect to `/purchase-orders?tab=rocket`. The Rocket
preview workspace and component-capacity decisions belong to Supply.

## State Rules

- `page.tsx` remains a server component with no hooks, provider calls, API
  calls, timers, or workspace content.
- Preserve unrelated query values and let canonical `tab=rocket` win over old
  tab/view state.
- Rocket components and local history utilities may remain only when imported
  by the canonical Supply workspace.

## Boundary Rules

- Do not restore route-local Rocket monitoring or decision UI.
- Do not call or recreate backend Rocket confirmation/generation endpoints.
- Redirect behavior is owned by `src/lib/operations-navigation.ts`.

## Verification

```bash
npm exec --workspace=apps/web vitest -- run src/app/__tests__/operations-redirects.spec.ts
```
