# Plan W6 — Root Boundaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This plan was written with `superpowers:writing-plans`; keep the steps bite-sized and evidence-driven.

**Goal:** Close the final root-dashboard typed-boundary gap by converting the root consumers of `/api/action-tasks` and `/api/agent-registry/org` from shadow TypeScript casts to shared Zod-validated contracts, while keeping product/inventory/orders/ad-ops rewires owned by W1-W3/W5.

**Architecture:** W6 is a **split parent plan**, not one implementation session. Execute it as two ADR-0019-compliant sessions:

- **W6a — action-task root boundary:** owner domain `action-task`; allowed cross-layer slice is `apps/server/src/action-task/**` + action-task schemas in `packages/shared` + direct root consumer `apps/web/src/app/page.tsx` and its root test.
- **W6b — agent-registry org boundary:** owner domain `agent-registry`; allowed cross-layer slice is `apps/server/src/agent-registry/**` + agent org schemas in `packages/shared` + direct root/agents org consumers.

Do not implement W6a and W6b in the same coding session unless an explicit ADR-0019 cross-business-domain exception is approved before coding. Business logic for action-task seeding, Agent OS execution, product catalog, inventory, orders, and ad operations stays unchanged.

**Tech Stack:** Next.js 16 App Router + React Query + `apiClient.getParsed`, NestJS 11 controllers/services, `@kiditem/shared` Zod schemas, Vitest unit/RTL tests, mandatory `npm run dev:server` boot smoke for backend DI.

**Predecessors:** Plan F1 (`docs/superpowers/plans/2026-04-22-plan-f1-root-dashboard.md`) restored the root dashboard and deliberately left two unparsed root GETs; Plan B5 (`docs/superpowers/plans/2026-04-23-plan-b5-action-task-profit-basis.md`) moved action-task warning seeds to live metrics and left the root consumer conversion out of scope; Plan R0 (`docs/superpowers/plans/2026-04-23-plan-r0-post-f1-successor-roadmap.md`) assigns this residual slice to W6.

**Successors / dependencies:** Execute W6 after W1-W3 have stabilized the product, inventory, and orders build surface. W5 ad-ops rewire remains after W6. W6 must not unblock itself by editing product, inventory, orders, or ad-ops files. Run W6a and W6b as separate sessions/PRs or as an explicitly approved cross-domain exception.

---

## Source-of-truth evidence

- Root scope and session boundary: `AGENTS.md` and ADR-0019 (`.claude/docs/decisions/0019-business-domain-scoped-session-boundary.md`). ADR-0019 allows same-domain cross-layer work, but action-task and agent-registry are distinct owner domains; this parent plan therefore splits W6 into W6a/W6b implementation sessions.
- Frontend typed-boundary rules: `apps/web/AGENTS.md` requires `apiClient.getParsed` for schema-validated API response boundaries and `queryKeys.*` for React Query keys.
- Agent org frontend rules: `apps/web/src/app/agents/CLAUDE.md` says org tree shape changes must update `agents/lib/agent-api.ts`, `agents/hooks/useAgents.ts`, and the shared type.
- Server rules: `apps/server/AGENTS.md` requires DTO validation, `@CurrentCompany()` company scoping, no `@Query()` companyId trust, and `satisfies` with shared types in services.
- Shared schema rules: `packages/shared/AGENTS.md` requires Zod schemas with `z.infer`, subpath exports, and `packages/shared` build after schema edits.
- F1 release note residual debt: `docs/release-notes/2026-04-root-dashboard-rewire.md` states the two remaining unparsed root calls are `/api/action-tasks` and `/api/agent-registry/org`.
- B5 release note residual debt: `docs/release-notes/2026-04-action-task-live-profit-basis.md` explicitly leaves `root dashboard apiClient.getParsed('/api/action-tasks')` for this slice.
- Current root action task consumer: `apps/web/src/app/page.tsx:168-170` uses `apiClient.get<ActionTask[]>('/api/action-tasks')`.
- Current root agent org consumer: `apps/web/src/app/page.tsx:812-823` defines a local `OrgNode` and uses `apiClient.get<OrgNode[]>('/api/agent-registry/org')` with ad-hoc query key `['agent-registry', 'org']`.
- Current root action execution consumer: `apps/web/src/app/page.tsx:831` uses `apiClient.post<{ ok: boolean }>(/api/action-tasks/:id/execute)` even though `ActionTaskService.executeTask()` currently returns an updated task object, not an `{ ok }` envelope.
- Current action-task server endpoint: `apps/server/src/action-task/action-task.controller.ts:12-22` serves `GET /api/action-tasks`; `:id/execute` is at lines 52-55.
- Current action-task shared schema: `packages/shared/src/schemas/action-task.ts:17-47` defines `ActionTaskSchema`, but lacks a named list schema and execute response schema.
- Current action-task service drift risk: `apps/server/src/action-task/action-task.service.ts:199-250` fetches and updates by `id` only in `executeTask`; `updateTask` and `addNote` have the same `findUnique({ id })` pattern at lines 148 and 180. W6a must harden all three touched action-task service paths (`executeTask`, `updateTask`, `addNote`) with `@CurrentCompany()` scope instead of conditionally deferring known IDOR cases.
- Current agent org server endpoint: `apps/server/src/agent-registry/agent-registry.controller.ts:39-42` serves `GET /api/agent-registry/org` using `@CurrentCompany()`.
- Current agent org server response type is local only: `apps/server/src/agent-registry/types.ts:1-13` defines `OrgNode`; `apps/web/src/app/agents/lib/agent-types.ts:25-37` duplicates the same interface; no shared `AgentOrgNodeSchema` exists.
- Current agent org service shape: `apps/server/src/agent-registry/agent-registry.service.ts:400-440` builds a recursive tree from marketplace catalog plus hired `AgentDefinition` rows.
- Current F1 root RTL spec: `apps/web/src/app/__tests__/page.spec.tsx:22-32` mocks `.getParsed` and `.get`; lines 77-80 still expect root action/org calls through `.get`.

## Likely stale boundary/runtime issues W6 must address

1. **Root GET shadow casts:** `page.tsx` uses TypeScript generic casts for `/api/action-tasks` and `/api/agent-registry/org`, so server drift reaches rendering silently.
2. **Agent org type duplication:** server, root page, and `apps/web/src/app/agents` carry separate `OrgNode` types. The root local type says `title: string`, while the server and agents UI allow `title: string | null`.
3. **Query key drift:** root `DashboardChart` uses `['agent-registry', 'org']` instead of `queryKeys.agents.org()`, so invalidation from agent pages misses the root chart cache.
4. **Execute response mismatch:** root mutation expects `{ ok: boolean }`; server returns the updated `ActionTask`. W6 should parse the actual task response or introduce a shared execute response without changing action execution semantics.
5. **Company-scope hardening for action-task mutations:** `executeTask(id)`, `updateTask(id)`, and `addNote(id)` currently read/update by `id` only. W6a must pass `@CurrentCompany()` into all three service methods and validate `id + companyId` before update. This is boundary hardening, not action-task business rewrite.
6. **Shared export asymmetry:** `ActionTaskSourceAlertSchema` is exported from `packages/shared/src/index.ts`, but not from `packages/shared/src/schemas/index.ts`. If W6 adds list/execute schemas, both export surfaces must be kept symmetric.
7. **Test mocks still model the old boundary:** `page.spec.tsx` defaults `/api/action-tasks` and `/api/agent-registry/org` through `apiClient.get`; W6 tests must fail if either route regresses to unparsed `.get`.

## Locked Decisions

1. **Split owner domains:** W6 is a parent plan. W6a owns `action-task`; W6b owns `agent-registry`. Do not treat "root page consumers" as a standalone business domain for implementation.
2. **No commerce rewires:** Do not edit `apps/web/src/app/products`, `apps/web/src/app/inventory`, `apps/web/src/app/orders`, `apps/web/src/app/ad-ops`, or corresponding product/inventory/order/ad-ops server modules in W6.
3. **Use shared schemas:** Root action tasks parse with `ActionTaskListSchema`; root and agent org consumers parse with `AgentOrgTreeSchema`.
4. **Do not invent a new root API:** Keep existing paths `/api/action-tasks` and `/api/agent-registry/org`.
5. **Do not change action-task seeding logic:** B5 already owns live-profit basis. W6a only normalizes action-task response contracts plus execute/update/note boundary checks.
6. **Do not change Agent OS org semantics:** Keep marketplace-catalog manager/specialist tree construction. W6b only moves the recursive tree shape into `@kiditem/shared` and validates it.
7. **Parse mutations locally, not by adding broad API-client methods:** W6a uses `apiClient.post<unknown>(...).then(ActionTaskSchema.parse)` for the single root execute mutation. A repo-wide `postParsed` helper is a separate API-client ergonomics change and is out of this plan.
8. **Keep action-board behavior compatible:** W6 does not migrate `apps/web/src/app/action-board` to parsed boundaries, but any server response change must remain backward-compatible with its current generic `ActionTask` calls.
9. **Use `queryKeys.agents.org()` in root:** Root chart cache should share the same key hierarchy as `apps/web/src/app/agents`.
10. **No combined implementation without approval:** Implement W6a and W6b separately. If a team lead intentionally combines them, create/approve the ADR-0019 cross-business-domain exception before coding and record that approval in the release note.
11. **No ADR file edit for split execution:** This plan includes an ADR section for review. Split W6a/W6b execution does not overturn ADR-0019 and does not require editing `.claude/docs/decisions/*`.

## File Map

### W6a shared schemas — action-task

- Modify `packages/shared/src/schemas/action-task.ts` — add `ActionTaskListSchema = z.array(ActionTaskSchema)` and `ActionTaskExecuteResponseSchema = ActionTaskSchema`. The plan keeps the existing updated-task response and names it explicitly.
- Create `packages/shared/src/schemas/action-task.spec.ts` — cover list parsing, execute response parsing, note/activity log fields, and source-alert null/omitted behavior.

### W6b shared schemas — agent-registry

- Modify `packages/shared/src/schemas/agent.ts` — add recursive `AgentOrgNodeSchema` and `AgentOrgTreeSchema` using `z.lazy`.
- Create or extend `packages/shared/src/schemas/agent.spec.ts` — cover hired and not-hired nodes, `title: null`, nested reports, and invalid recursive payload rejection.
- Modify `packages/shared/src/schemas/index.ts` — export `ActionTaskListSchema`, `ActionTaskExecuteResponseSchema`, `ActionTaskSourceAlertSchema`, `AgentOrgNodeSchema`, and `AgentOrgTreeSchema` plus inferred types.
- Modify `packages/shared/src/index.ts` — mirror the same exports for root-package imports.

For split execution, W6a exports only the action-task additions and W6b exports only the agent additions. If both shared export edits happen in one parent branch, keep the commit grouping separate by W6a/W6b.

### W6a server contracts — action-task

- Modify `apps/server/src/action-task/action-task.controller.ts` — pass `@CurrentCompany()` to `executeTask`, `updateTask`, and `addNote`; keep `GET /api/action-tasks` unchanged except for optional explicit return typing.
- Modify `apps/server/src/action-task/action-task.service.ts` — update `executeTask(id, companyId)`, `updateTask(id, companyId, dto)`, and `addNote(id, companyId, text)` to read/update only after tenant validation; return the same updated task wire shapes currently returned.
- Add or extend tests under `apps/server/src/action-task/__tests__/` — verify `executeTask`, `updateTask`, and `addNote` reject a task from a different company and that JSON-serialized responses parse with `ActionTaskSchema`.

### W6b server contracts — agent-registry

- Modify `apps/server/src/agent-registry/types.ts` — either re-export `AgentOrgNode` from `@kiditem/shared` or replace the local interface with the shared type.
- Modify `apps/server/src/agent-registry/agent-registry.service.ts` — annotate `getOrgTree(companyId): Promise<AgentOrgNode[]>` and ensure each returned node uses `satisfies AgentOrgNode`.
- Add or extend tests under `apps/server/src/agent-registry/__tests__/` — verify `getOrgTree` response parses with `AgentOrgTreeSchema` and still scopes hired agents by company.

### W6a frontend consumers — action-task root

- Modify `apps/web/src/app/page.tsx` — import `ActionTaskListSchema` and `ActionTaskSchema`; replace the root `/api/action-tasks` `.get<T>` call with `getParsed`; parse the execute mutation response with `ActionTaskSchema`.
- Modify `apps/web/src/app/__tests__/page.spec.tsx` — update mocks and assertions so `/api/action-tasks` is requested through `.getParsed`, and execute uses `.post` plus schema parse.

### W6b frontend consumers — agent-registry org

- Modify `apps/web/src/app/page.tsx` — import `AgentOrgTreeSchema` and `AgentOrgNode`; replace the root `/api/agent-registry/org` `.get<T>` call with `getParsed`; replace the chart query key with `queryKeys.agents.org()`.
- Modify `apps/web/src/app/__tests__/page.spec.tsx` — update mocks and assertions so `/api/agent-registry/org` is requested through `.getParsed`.
- Modify `apps/web/src/app/agents/lib/agent-types.ts` — re-export `AgentOrgNode` from `@kiditem/shared` instead of maintaining a duplicate `OrgNode` interface.
- Modify `apps/web/src/app/agents/lib/agent-api.ts` — change `agentApi.org()` to `apiClient.getParsed('/api/agent-registry/org', AgentOrgTreeSchema)`; remove the query-string `companyId` from this endpoint because the server uses `@CurrentCompany()`.
- Modify `apps/web/src/app/agents/hooks/useAgents.ts` — type `useAgentOrg` with the shared `AgentOrgNode[]` type.
- Check `apps/web/src/app/agents/org/page.tsx` and `apps/web/src/app/agents/components/AgentOverview.tsx` after the type swap; only adjust null-title handling if TypeScript requires it.

### Documentation

- Create `docs/release-notes/2026-04-root-boundaries.md` — summarize W6 changed endpoints, DB impact, verification evidence, and what remains owned by W1-W3/W5.

## Out of Scope

- Product data UI, product aliases, image hub, thumbnail-editor product image flows — W1.
- Inventory typed-boundary migration — W2.
- Orders typed-boundary migration — W3.
- Ad-ops quarantine removal or ad-ops typed-boundary migration — W5.
- Action-task live-profit seed logic, related-product selection thresholds, or rule tuning — B5 already owns this domain logic.
- Full `apps/web/src/app/action-board` typed-boundary migration. W6 keeps responses compatible so action-board keeps working, but does not rework that page.
- Agent OS execution, adapters, heartbeat, permission hierarchy, cost analytics, trace UI, SSE, or marketplace catalog semantics.
- Adding repo-wide `apiClient.postParsed/patchParsed/deleteParsed` helpers.
- Creating or modifying a Prisma schema migration.

## Tasks

### T0 — Baseline and dependency gate

**Files:** No edits.

- [ ] Run the root-boundary grep baseline:

```bash
rg -n "apiClient\.get<|/api/action-tasks|/api/agent-registry/org|type OrgNode|\['agent-registry', 'org'\]" \
  apps/web/src/app/page.tsx \
  apps/web/src/app/__tests__/page.spec.tsx \
  apps/web/src/app/agents/lib \
  apps/web/src/app/agents/hooks \
  apps/server/src/action-task \
  apps/server/src/agent-registry \
  packages/shared/src/schemas
```

Expected before W6: matches include `apps/web/src/app/page.tsx:169`, `apps/web/src/app/page.tsx:823`, local root `OrgNode`, duplicate agent `OrgNode`, and no `AgentOrgTreeSchema`.

- [ ] Confirm W6 dependency ordering from R0:

```bash
rg -n "W1|W2|W3|W5|W6|root /api/action-tasks" docs/superpowers/plans/2026-04-23-plan-r0-post-f1-successor-roadmap.md
```

Expected: W6 appears after W1-W3 and before W5 in Lane B. If W1-W3 are not merged, implement W6 only after confirming the current branch is the W6 integration branch and not a W1/W2/W3 worker branch.

- [ ] Capture current git surface:

```bash
git status --short
```

Expected: no unrelated W2/W3 plan edits in the files listed in W6 File Map. If another worker has edits in any W6 File Map file, coordinate before editing that file; do not overwrite their work.

### T1 — Add shared root-boundary schemas

**Files:**
- Modify `packages/shared/src/schemas/action-task.ts`
- Modify `packages/shared/src/schemas/agent.ts`
- Modify `packages/shared/src/schemas/index.ts`
- Modify `packages/shared/src/index.ts`
- Create `packages/shared/src/schemas/action-task.spec.ts`
- Create or extend `packages/shared/src/schemas/agent.spec.ts`

- [ ] Add action-task list and execute schemas in `packages/shared/src/schemas/action-task.ts`:

```ts
export const ActionTaskListSchema = z.array(ActionTaskSchema);
export const ActionTaskExecuteResponseSchema = ActionTaskSchema;

export type ActionTaskList = z.infer<typeof ActionTaskListSchema>;
export type ActionTaskExecuteResponse = z.infer<typeof ActionTaskExecuteResponseSchema>;
```

Expected: no existing field is removed from `ActionTaskSchema`.

- [ ] Add recursive org schemas in `packages/shared/src/schemas/agent.ts`:

```ts
export type AgentOrgNode = {
  id: string;
  name: string;
  type: string;
  role: string;
  title: string | null;
  status: string;
  adapterType: string;
  lastHeartbeatAt: string | null;
  hired: boolean;
  marketplaceId: string | null;
  reports: AgentOrgNode[];
};

export const AgentOrgNodeSchema: z.ZodType<AgentOrgNode> = z.lazy(() => z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  role: z.string(),
  title: z.string().nullable(),
  status: z.string(),
  adapterType: z.string(),
  lastHeartbeatAt: z.string().datetime().nullable(),
  hired: z.boolean(),
  marketplaceId: z.string().nullable(),
  reports: z.array(AgentOrgNodeSchema),
}));

export const AgentOrgTreeSchema = z.array(AgentOrgNodeSchema);
```

Expected: schema accepts `title: null` and nested `reports` arrays; schema does not permit missing `reports` because the server always returns an array. Use a wire-only ISO string for `lastHeartbeatAt`; do not use `zIsoDate` here because its inferred output includes `Date` and does not satisfy the manual recursive `AgentOrgNode` type.

- [ ] Mirror exports in `packages/shared/src/schemas/index.ts` and `packages/shared/src/index.ts`.

Expected grep:

```bash
rg -n "ActionTaskListSchema|ActionTaskExecuteResponseSchema|ActionTaskSourceAlertSchema|AgentOrgNodeSchema|AgentOrgTreeSchema" packages/shared/src/index.ts packages/shared/src/schemas/index.ts
```

Expected: both export files contain all five schema names, and both export files contain the inferred type names.

- [ ] Add `packages/shared/src/schemas/action-task.spec.ts` with these cases:
  - a full `ActionTaskSchema` object with `relatedProducts` parses;
  - `ActionTaskListSchema` parses an array of one task;
  - `ActionTaskExecuteResponseSchema` parses the updated task shape;
  - `sourceAlert: null` parses;
  - a missing `label` fails.

- [ ] Add or extend `packages/shared/src/schemas/agent.spec.ts` with these cases:
  - `AgentOrgTreeSchema` parses a manager node with one child;
  - `title: null` parses;
  - `hired: false` and `status: 'not_hired'` parse;
  - missing `reports` fails;
  - a child with invalid `lastHeartbeatAt` fails.

- [ ] Run shared tests and build:

```bash
npx vitest run packages/shared/src/schemas/action-task.spec.ts packages/shared/src/schemas/agent.spec.ts
(cd packages/shared && npm run build)
```

Expected: both spec files pass; shared build succeeds and updates `dist/`.

### T2 — Harden and validate action-task root contract

**Files:**
- Modify `apps/server/src/action-task/action-task.controller.ts`
- Modify `apps/server/src/action-task/action-task.service.ts`
- Modify or create focused tests under `apps/server/src/action-task/__tests__/`

- [ ] Change action-task mutation controller signatures to pass company scope:

```ts
@Patch(':id')
updateTask(
  @Param('id') id: string,
  @CurrentCompany() companyId: string,
  @Body() dto: UpdateTaskDto,
) {
  return this.actionTaskService.updateTask(id, companyId, dto);
}

@Post(':id/notes')
addNote(
  @Param('id') id: string,
  @CurrentCompany() companyId: string,
  @Body() dto: AddNoteDto,
) {
  return this.actionTaskService.addNote(id, companyId, dto.text);
}

@Post(':id/execute')
executeTask(@Param('id') id: string, @CurrentCompany() companyId: string) {
  return this.actionTaskService.executeTask(id, companyId);
}
```

Expected: route paths stay `PATCH /api/action-tasks/:id`, `POST /api/action-tasks/:id/notes`, and `POST /api/action-tasks/:id/execute`.

- [ ] Change `ActionTaskService.executeTask` to validate tenant ownership before execution:

```ts
async executeTask(id: string, companyId: string) {
  const task = await this.prisma.actionTask.findFirst({ where: { id, companyId } });
  if (!task) throw new NotFoundException('Task not found');
  if (!task.apiCall) throw new NotFoundException('No apiCall defined for this task');
  // preserve existing fetch/update behavior after this point
}
```

Expected: no `findUnique({ where: { id } })` remains inside `executeTask`.

- [ ] Change `ActionTaskService.updateTask` and `addNote` to validate tenant ownership before update:

```ts
async updateTask(id: string, companyId: string, data: { status?: string; priority?: string }) {
  const task = await this.prisma.actionTask.findFirst({ where: { id, companyId } });
  if (!task) throw new NotFoundException('Task not found');
  // preserve existing log/update behavior after this point
}

async addNote(id: string, companyId: string, text: string) {
  const task = await this.prisma.actionTask.findFirst({ where: { id, companyId } });
  if (!task) throw new NotFoundException('Task not found');
  // preserve existing notes/log update behavior after this point
}
```

Expected: no `findUnique({ where: { id } })` remains inside `executeTask`, `updateTask`, or `addNote`.

- [ ] Keep the update call compatible while preventing cross-tenant writes:

```ts
return this.prisma.actionTask.update({
  where: { id },
  data: {
    result: result as Prisma.InputJsonValue,
    status: 'done',
    activityLog: log as unknown as Prisma.InputJsonValue,
  },
});
```

Expected: the prior `findFirst({ id, companyId })` is the authorization guard. If Prisma schema has a composite unique key available, using that is acceptable; otherwise keep the validated `id` update. Apply the same guard pattern to `updateTask` and `addNote`.

- [ ] Add action-task service tests:

```bash
cd apps/server && npx vitest run src/action-task/__tests__/action-task-flow.spec.ts src/action-task/__tests__/action-task-claim.spec.ts src/action-task/__tests__/action-task-get-tasks.spec.ts
```

Expected after test edits: existing tests pass, plus new cases reject executing, updating, and adding a note to a foreign-company task with `NotFoundException`.

- [ ] Add schema drift assertion for `getTasks` and `executeTask` responses. Test by JSON serializing the returned value before parsing, because Nest serializes `Date` to ISO strings over HTTP:

```ts
const wire = JSON.parse(JSON.stringify(result));
expect(ActionTaskSchema.safeParse(wire).success).toBe(true);
```

Expected: `ActionTaskSchema` parses the root-facing wire shape.

### T3 — Validate agent org server contract with shared schema

**Files:**
- Modify `apps/server/src/agent-registry/types.ts`
- Modify `apps/server/src/agent-registry/agent-registry.service.ts`
- Add or extend tests under `apps/server/src/agent-registry/__tests__/`

- [ ] Replace the local `OrgNode` interface with the shared type:

```ts
export type { AgentOrgNode as OrgNode } from '@kiditem/shared';
```

Expected: existing imports of `OrgNode` from `./types` continue working.

- [ ] Type `getOrgTree` with the shared node and use `satisfies` in `toNode`:

```ts
import type { AgentOrgNode } from '@kiditem/shared';

async getOrgTree(companyId: string): Promise<AgentOrgNode[]> {
  // existing query logic unchanged
  const toNode = (c: typeof catalog[number]): AgentOrgNode => {
    const agent = hiredByMarketplaceId.get(c.id);
    return {
      id: agent?.id ?? c.id,
      name: c.name,
      type: agent?.type ?? c.role ?? 'specialist',
      role: c.role ?? 'specialist',
      title: agent?.title ?? c.name,
      status: agent?.status ?? 'not_hired',
      adapterType: c.adapterType ?? 'claude_local',
      lastHeartbeatAt: agent?.lastHeartbeatAt?.toISOString() ?? null,
      hired: !!agent,
      marketplaceId: c.id,
      reports: [],
    } satisfies AgentOrgNode;
  };
}
```

Expected: marketplace-catalog tree construction at `agent-registry.service.ts:400-440` remains semantically unchanged.

- [ ] Add a focused agent-registry test that calls `getOrgTree(companyId)` with mocked marketplace and hired agent rows, then validates:

```ts
const wire = JSON.parse(JSON.stringify(result));
expect(AgentOrgTreeSchema.safeParse(wire).success).toBe(true);
```

Expected: hired rows for a different company do not mark nodes as `hired: true`.

- [ ] Run server focused tests:

```bash
(cd apps/server && npx vitest run src/agent-registry/__tests__/agent-registry.service.spec.ts src/agent-registry/events/__tests__/agent-sse.service.spec.ts)
```

Expected: existing agent registry tests still pass; the new org-tree schema test passes.

### T4 — Rewire root page consumers to parsed boundaries

**Files:**
- Modify `apps/web/src/app/page.tsx`
- Modify `apps/web/src/app/__tests__/page.spec.tsx`

- [ ] Replace root action-task GET with the shared list schema:

```ts
import {
  ActionTaskListSchema,
  ActionTaskSchema,
  AgentOrgTreeSchema,
  type ActionTask,
  type AgentOrgNode,
} from '@kiditem/shared';

const { data: actionTasks = [] } = useQuery({
  queryKey: queryKeys.actionTasks.list(),
  queryFn: () => apiClient.getParsed('/api/action-tasks', ActionTaskListSchema),
  refetchInterval: 60_000,
});
```

Expected: `rg -n "apiClient\.get<ActionTask\[\]>\('/api/action-tasks'" apps/web/src/app/page.tsx` returns no matches.

- [ ] Replace local root `OrgNode` with the shared type and null-safe title handling:

```ts
type OrgNode = AgentOrgNode;
type AgentDisplay = { role: string; name: string; title: string; status: string; color: string; currentTask: string | null };

function flattenOrgNodes(nodes: OrgNode[]): AgentDisplay[] {
  const result: AgentDisplay[] = [];
  for (const n of nodes) {
    result.push({
      role: n.role,
      name: n.name,
      title: n.title ?? n.name,
      status: n.status,
      color: ROLE_COLORS[n.role] ?? 'violet',
      currentTask: null,
    });
    if (n.reports.length) result.push(...flattenOrgNodes(n.reports));
  }
  return result;
}
```

Expected: no locally duplicated structural `OrgNode` type remains in `page.tsx`.

- [ ] Replace the root agent org query with shared key and schema:

```ts
const { data: orgNodes = [] } = useQuery({
  queryKey: queryKeys.agents.org(),
  queryFn: () => apiClient.getParsed('/api/agent-registry/org', AgentOrgTreeSchema),
  refetchInterval: 30_000,
  enabled: chartTab === 'agents',
});
```

Expected: `rg -n "\['agent-registry', 'org'\]|apiClient\.get<OrgNode\[\]>\('/api/agent-registry/org'" apps/web/src/app/page.tsx` returns no matches.

- [ ] Parse the execute mutation response with `ActionTaskSchema`:

```ts
const { mutate: executeAction, variables: executingId } = useMutation({
  mutationFn: async (id: string) => {
    const raw = await apiClient.post<unknown>(`/api/action-tasks/${id}/execute`, {});
    return ActionTaskSchema.parse(raw);
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.actionTasks.list() });
    toast.success('액션을 실행했습니다.');
  },
  onError: () => toast.error('실행에 실패했습니다.'),
});
```

Expected: mutation behavior stays the same for users; W6 now detects server response drift.

- [ ] Update `apps/web/src/app/__tests__/page.spec.tsx` mocks:
  - keep `getParsedMock` for dashboard endpoints;
  - make `/api/action-tasks` return through `getParsedMock`;
  - make `/api/agent-registry/org` return through `getParsedMock`;
  - keep `getMock` unused for these two paths and assert it was not called with them.

- [ ] Add root RTL assertion:

```ts
const parsedPaths = getParsedMock.mock.calls.map((c) => c[0]);
expect(parsedPaths).toContain('/api/action-tasks');
expect(parsedPaths).toContain('/api/agent-registry/org');
expect(getMock).not.toHaveBeenCalledWith('/api/action-tasks');
expect(getMock).not.toHaveBeenCalledWith('/api/agent-registry/org');
```

Expected: the test fails if either root endpoint regresses to `apiClient.get<T>`.

- [ ] Run root RTL spec:

```bash
(cd apps/web && npx vitest run src/app/__tests__/page.spec.tsx)
```

Expected: all root dashboard tests pass, including the new parsed-boundary assertion.

### T5 — Rewire direct agent-org consumers to the shared org schema

**Files:**
- Modify `apps/web/src/app/agents/lib/agent-types.ts`
- Modify `apps/web/src/app/agents/lib/agent-api.ts`
- Modify `apps/web/src/app/agents/hooks/useAgents.ts`
- Touch `apps/web/src/app/agents/org/page.tsx` and `apps/web/src/app/agents/components/AgentOverview.tsx` only if the shared nullable type exposes a compile issue.

- [ ] Replace the duplicate `OrgNode` interface in `agent-types.ts`:

```ts
export type { AgentOrgNode as OrgNode } from '@kiditem/shared';
```

Expected: no handwritten `interface OrgNode` remains in `apps/web/src/app/agents/lib/agent-types.ts`.

- [ ] Update `agentApi.org()` to use the shared schema and remove the ignored `companyId` query parameter:

```ts
import { AgentOrgTreeSchema } from '@kiditem/shared/schemas';
import type { AgentOrgNode } from '@kiditem/shared';

org: async (): Promise<AgentOrgNode[]> => {
  return apiClient.getParsed('/api/agent-registry/org', AgentOrgTreeSchema);
},
```

Expected: `rg -n "agent-registry/org\?companyId|apiClient\.get<OrgNode\[\]>" apps/web/src/app/agents/lib/agent-api.ts` returns no matches.

- [ ] Update `useAgentOrg` typing:

```ts
import type { AgentOrgNode } from '@kiditem/shared';

export function useAgentOrg(options?: Partial<UseQueryOptions<AgentOrgNode[]>>) {
  return useQuery({
    queryKey: queryKeys.agents.org(),
    queryFn: () => agentApi.org(),
    ...options,
  });
}
```

Expected: `queryKeys.agents.org()` remains the cache key.

- [ ] Run a targeted TypeScript check for agent org and root imports:

```bash
(cd apps/web && npx tsc --noEmit --pretty false -p tsconfig.json | rg "src/app/(page|agents)" || true)
```

Expected: no `src/app/page.tsx` or `src/app/agents` type errors. If unrelated W1-W3/W5 files fail, do not edit them in W6; record the first unrelated file in the release note.

### T6 — Release note and final verification

**Files:**
- Create `docs/release-notes/2026-04-root-boundaries.md`

- [ ] Write `docs/release-notes/2026-04-root-boundaries.md` with these sections:
  - What changed for users: root Agent OS/action cards now fail fast on contract drift instead of silently rendering stale data.
  - Frontend changes: `page.tsx`, root RTL spec, agent org API/hook type source.
  - Backend changes: action-task execute company-scope guard, agent-org shared schema validation.
  - Shared changes: `ActionTaskListSchema`, `ActionTaskExecuteResponseSchema`, `AgentOrgNodeSchema`, `AgentOrgTreeSchema`.
  - DB impact: none.
  - Out-of-scope successor references: W1-W3/W5 remain responsible for product/inventory/orders/ad-ops.
  - Verification evidence: paste exact pass/fail command results from the commands below.

- [ ] Run shared verification:

```bash
npx vitest run packages/shared/src/schemas/action-task.spec.ts packages/shared/src/schemas/agent.spec.ts
(cd packages/shared && npm run build)
```

Expected: tests pass and shared package builds.

- [ ] Run server focused verification:

```bash
(cd apps/server && npx vitest run src/action-task src/agent-registry/__tests__/agent-registry.service.spec.ts)
```

Expected: action-task tests and agent-registry focused tests pass.

- [ ] Run mandatory NestJS boot smoke:

```bash
npm run dev:server
```

Expected: server compiles and reaches `Nest application successfully started`. Stop it with Ctrl-C after the route mapping and startup line are visible.

- [ ] Run frontend focused verification:

```bash
(cd apps/web && npx vitest run src/app/__tests__/page.spec.tsx)
npm run build --workspace=apps/web
```

Expected: root page tests pass; web build succeeds if W1-W3 dependencies are already merged. If the build fails only in product/inventory/orders/ad-ops files, do not modify those files in W6; record the first failing file and the owning successor in the release note.

- [ ] Final grep gate:

```bash
rg -n "apiClient\.get<ActionTask\[\]>\('/api/action-tasks'|apiClient\.get<OrgNode\[\]>\('/api/agent-registry/org'|\['agent-registry', 'org'\]|interface OrgNode" \
  apps/web/src/app/page.tsx \
  apps/web/src/app/agents/lib \
  apps/web/src/app/agents/hooks
```

Expected: zero matches.

## Acceptance Criteria

- `packages/shared` exports named schemas and types for `ActionTaskList`, `ActionTaskExecuteResponse`, `AgentOrgNode`, and `AgentOrgTree` from both root and `/schemas` entrypoints.
- `GET /api/action-tasks` root consumer uses `apiClient.getParsed('/api/action-tasks', ActionTaskListSchema)`.
- `GET /api/agent-registry/org` root consumer uses `apiClient.getParsed('/api/agent-registry/org', AgentOrgTreeSchema)` and `queryKeys.agents.org()`.
- Root action execution parses the actual updated `ActionTask` response with `ActionTaskSchema`.
- `ActionTaskService.executeTask`, `updateTask`, and `addNote` validate `id + companyId` before mutating and no longer read by `id` alone.
- `AgentRegistryService.getOrgTree` returns a shape that passes `AgentOrgTreeSchema` and keeps `@CurrentCompany()` scoping.
- The duplicate agent-org `OrgNode` interface in `apps/web/src/app/agents/lib/agent-types.ts` is replaced with a shared type re-export.
- Root RTL tests fail if either residual endpoint regresses to `apiClient.get<T>`.
- No product, inventory, orders, or ad-ops files are modified by W6a or W6b.
- W6a and W6b are executed as separate ADR-0019-compliant sessions, or the release note links to an approved cross-business-domain exception before combined execution.
- Verification commands in T6 are run and their results are captured in `docs/release-notes/2026-04-root-boundaries.md`.

## Staffing guidance for later `$team` execution

Recommended headcount: **run as two separate `$team` launches** unless an explicit ADR-0019 exception is approved.

### W6a action-task launch

Recommended headcount: **2 workers + 1 lead verifier**.

| Lane | Suggested worker type | File ownership | Reasoning level | Mission |
|---|---|---|---|---|
| Action-task shared/web lane | executor | `packages/shared/src/schemas/action-task.ts`, action-task schema spec/exports, root `page.tsx` action-task consumer and test assertions | medium | Land action-task list/execute schemas and parse root `/api/action-tasks` boundaries. |
| Action-task server lane | executor | `apps/server/src/action-task/**` | high | Add company-scope guards for `executeTask`, `updateTask`, and `addNote`; keep response shapes compatible. |
| W6a verification lane | reviewer/verifier | W6a release-note section plus action-task commands | high | Run action-task focused tests, shared build, `dev:server`, root RTL subset, and grep gate for `/api/action-tasks`. |

### W6b agent-registry launch

Recommended headcount: **2 workers + 1 lead verifier**.

| Lane | Suggested worker type | File ownership | Reasoning level | Mission |
|---|---|---|---|---|
| Agent-org shared/server lane | executor | `packages/shared/src/schemas/agent.ts`, agent schema spec/exports, `apps/server/src/agent-registry/{types.ts,agent-registry.service.ts,__tests__/**}` | high | Land recursive org schema and prove server org tree matches it. |
| Agent-org web lane | executor | root `page.tsx` org consumer/test assertions, `apps/web/src/app/agents/lib/**`, `apps/web/src/app/agents/hooks/useAgents.ts` | medium | Convert root and direct org consumers to parsed shared org tree. |
| W6b verification lane | reviewer/verifier | W6b release-note section plus agent-registry commands | high | Run agent focused tests, shared build, root RTL subset, web build, and grep gate for `/api/agent-registry/org`. |

Launch hint after plan approval:

```bash
omx team 2:executor "Implement W6a action-task root boundary from docs/superpowers/plans/2026-04-25-plan-w6-root-boundaries.md only. Do not edit agent-registry or agents UI files. Do not edit products/inventory/orders/ad-ops. Lead keeps W6a verification and release-note evidence."

omx team 2:executor "Implement W6b agent-registry org boundary from docs/superpowers/plans/2026-04-25-plan-w6-root-boundaries.md only. Do not edit action-task files. Do not edit products/inventory/orders/ad-ops. Lead keeps W6b verification and release-note evidence."
```

Coordination rules:
- Do not run both launches in the same coding session unless a cross-domain exception is approved before coding.
- W6a must not change action-task seed thresholds or B5 live-profit logic.
- W6b must not change Agent OS org construction semantics.
- Web lanes must not edit `apps/web/src/app/products`, `apps/web/src/app/inventory`, `apps/web/src/app/orders`, or `apps/web/src/app/ad-ops` to make the build green.
- Verification lanes run T6 after their implementation lanes finish and capture concrete command output in the release note.

## RALPLAN-DR Summary

- **R — Result:** root dashboard no longer has unvalidated `/api/action-tasks` or `/api/agent-registry/org` boundaries; root action execution validates its response.
- **A — Assumptions:** W1-W3 stabilize unrelated frontend build blockers before W6 final `npm run build --workspace=apps/web`; action-board remains compatible with the existing updated-task response shape.
- **L — Limits:** no commerce domain rewires, no Agent OS behavior changes, no DB migration, no repo-wide API client ergonomics expansion.
- **P — Plan:** execute as split W6a action-task and W6b agent-registry sessions; in each session, land shared schemas first, server response/scoping validation second, frontend parse rewires third, release note and verification last.
- **L — Liability controls:** company-scope guards on action-task execute/update/note paths, Zod schema tests, root RTL regression assertion, mandatory `dev:server` boot.
- **A — Acceptance:** all Acceptance Criteria above plus final grep gate zero matches.
- **N — Next:** W5 can proceed after W6 only if product/inventory/orders dependencies from W1-W3 are stable.
- **D — Decision record:** see ADR section below.
- **R — Review route:** use one combined reviewer after T1-T5, then a verification-focused reviewer for T6 evidence.

## ADR Section

### Decision

Adopt shared Zod schemas as the source of truth for the two residual root dashboard boundaries: `ActionTaskListSchema` / `ActionTaskExecuteResponseSchema` for action tasks and `AgentOrgTreeSchema` for agent organization. Keep the existing endpoint paths and business semantics, but require the root page and direct agent-org API client to parse responses at the boundary. Execute this decision as two ADR-0019-compliant implementation sessions (W6a action-task, W6b agent-registry) unless a cross-domain exception is explicitly approved.

### Drivers

- F1 intentionally left exactly two root unparsed GETs after dashboard schemas were adopted.
- R0 assigns root `/api/action-tasks` and `/api/agent-registry/org` debt to W6.
- Duplicated `OrgNode` interfaces make server/web drift likely.
- Root action execution currently has a company-scope gap and a response-type mismatch; the touched action-task service also has adjacent update/note id-only mutation paths that must be hardened in W6a.
- `apps/web/AGENTS.md` and `packages/shared/AGENTS.md` prefer shared Zod contracts over shadow TypeScript casts.

### Alternatives considered

1. **Only change `page.tsx` to `z.array(...)` inline schemas.** Rejected because it leaves agent-org type duplication and server drift unguarded.
2. **Add a new root dashboard aggregate endpoint combining actions and org.** Rejected because it invents a new API and couples unrelated Agent OS/action-task data behind root.
3. **Migrate all action-task UI consumers, including action-board, in W6.** Rejected because W6 owner is root boundary closure; full action-board migration is a larger action-task UI plan.
4. **Add generic `postParsed` / `patchParsed` helpers now.** Rejected because W6 needs one mutation parse and a repo-wide client API expansion is unnecessary.
5. **Return `{ ok: true }` from execute.** Rejected because existing consumers expect an updated `ActionTask`; parsing the existing shape is lower risk.

### Why chosen

The chosen path closes the exact residual root debt identified by F1/R0 with the least behavioral change: schemas move into `@kiditem/shared`, existing endpoints stay stable, root and agent org consumers parse at runtime, and server tests prove the response shape. Splitting W6 into W6a/W6b preserves ADR-0019's one-business-domain session boundary while still tracking both residual root debts under one roadmap item. W6a also fixes action-task execute/update/note company-scope guards without changing action-task seed rules or Agent OS behavior.

### Consequences

- Root dashboard will surface Zod drift as an error instead of silently rendering mismatched data.
- Agent org consumers share one recursive type, reducing duplicate interface drift.
- Server-side action execute becomes tenant-scoped by `@CurrentCompany()`.
- `packages/shared` becomes the dependency gate for W6 server/web work.
- Build success still depends on W1-W3 resolving their own frontend blockers; W6 must record any unrelated remaining blocker rather than editing it.

### Follow-ups

- W1-W3 remain responsible for product, inventory, and orders typed-boundary completion.
- W5 remains responsible for ad-ops re-enable and rewire.
- A later action-task UI plan may migrate `apps/web/src/app/action-board` to parsed boundaries, but W6 preserves compatibility and does not require that work.
