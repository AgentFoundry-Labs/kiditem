# Root Boundaries — W6a (action-task) — April 2026

## Summary

- Root dashboard `/api/action-tasks` consumer migrated from `apiClient.get<ActionTask[]>` shadow cast to `apiClient.getParsed('/api/action-tasks', ActionTaskListSchema)`. Server drift on the list response now surfaces at the boundary instead of silently rendering stale data.
- Root execute mutation switched from `apiClient.post<{ ok: boolean }>('/api/action-tasks/:id/execute', ...)` to `apiClient.post<unknown>(...)` followed by `ActionTaskExecuteResponseSchema.parse(raw)`. The server has always returned the updated `ActionTask`; the previous `{ok: boolean}` cast was wrong, so any field drift on the execute response now fails fast at the parse boundary instead of writing a stale-shaped row into the React Query cache.
- `ActionTaskService.executeTask`, `updateTask`, and `addNote` now require `@CurrentCompany() companyId` and gate the row read with `findFirst({ where: { id, companyId } })` before mutating. Cross-tenant access throws `NotFoundException`. ADR-0006 single-tenant rule is now enforced on every action-task mutation path.
- Shared package gains `ActionTaskListSchema`, `ActionTaskExecuteResponseSchema`, plus parity export of `ActionTaskSourceAlertSchema` from both `@kiditem/shared` and `@kiditem/shared/schemas` entrypoints (closing the prior asymmetry).
- Root RTL spec asserts both that `/api/action-tasks` flows through `getParsed` AND that the legacy `apiClient.get` route is **never** called for it. The test fails if the boundary regresses.

## Domain boundary

- Owner domain: `action-task`.
- W6 plan is split into W6a (action-task — this PR) and W6b (agent-registry — deferred).
- ADR-0019 same-domain cross-layer rule respected — touches `packages/shared` action-task schema/spec/exports, `apps/server/src/action-task/**`, `apps/web/src/app/page.tsx` (action-task slice only), `apps/web/src/app/__tests__/page.spec.tsx`, and the worktree-copied W6 plan source.

## DB impact

None. No Prisma schema migration. The `findUnique` → `findFirst({ id, companyId })` swap is a runtime guard tightening on already-existing columns.

## Verification

All commands run from `~/Workspace/omc-worktrees/feat/kiditem-w6a-action-task` on branch `feat/w6a-action-task` (rebased onto current `origin/main` post W2/W3 merge).

```
# Shared
npx vitest run packages/shared/src/schemas/action-task.spec.ts → PASS (6) FAIL (0)
(cd packages/shared && npm run build)                          → Build success; dist/schemas/index.d.ts 7.10 KB

# Server action-task
(cd apps/server && npx vitest run src/action-task)             → PASS (22) FAIL (0)
                                                                  (includes 3 new IDOR rejection cases for
                                                                  executeTask / updateTask / addNote +
                                                                  ActionTaskSchema JSON-roundtrip drift assertion)
(cd apps/server && npx tsc --noEmit --pretty false)            → 0 errors in apps/server/src/action-task/**
npm run dev:server                                             → "Nest application successfully started"

# Web
(cd apps/web && npx vitest run src/app/__tests__/page.spec.tsx) → PASS (7) FAIL (0)
(cd apps/web && npx tsc --noEmit --pretty false)               → 0 errors
npm run build --workspace=apps/web                             → exit 0
```

Closure greps:

```
rg -n "apiClient\.get<ActionTask\[\]>\('/api/action-tasks'" apps/web/src/app/page.tsx → 0 matches
rg -n "apiClient\.post<\{ ok: boolean \}>"               apps/web/src/app/page.tsx → 0 matches
rg -n "findUnique\(\{ where: \{ id"  apps/server/src/action-task/action-task.service.ts → 0 matches inside
                                                                                          executeTask / updateTask / addNote
rg -n "@CurrentCompany\(\) companyId" apps/server/src/action-task/action-task.controller.ts → 6 matches
                                                                                              (3 are the new
                                                                                              T2-hardened mutation
                                                                                              parameters)
```

## Out-of-scope successors

- **W6b** — agent-registry org boundary. Same plan file, separate ADR-0019-compliant session. Owner domain `agent-registry`. The page.tsx `OrgNode` definition (line ~787), `apiClient.get<OrgNode[]>` org call (~823), and `apps/web/src/app/agents/**` consumers remain intentionally untouched in this PR. They will move to `apiClient.getParsed('/api/agent-registry/org', AgentOrgTreeSchema)` and a shared recursive `AgentOrgNode` type in W6b.
- **W5** — ad-ops re-enable / rewire after product / inventory / orders contracts are stable.
- **Future action-board migration** — `apps/web/src/app/action-board` keeps its existing generic ActionTask consumption. W6a only normalizes the root dashboard slice; the wider action-board UI rewire remains a separate follow-up.

## Security notes

- IDOR closure for `executeTask` / `updateTask` / `addNote` — these were previously findUnique-by-id-only and would mutate a foreign-company row if the request supplied a foreign id. The new `findFirst({ id, companyId })` guard rejects with `NotFoundException` so the existence of cross-tenant rows is not leaked either.
- Browser code never sends a `companyId` query parameter to `/api/action-tasks` or `/api/action-tasks/:id/execute`; companyId comes from `@CurrentCompany()` decoded from the request principal.
- Codex challenge + security-reviewer post-ralph passes will exercise the new guard for additional adversarial cases before PR ships.
