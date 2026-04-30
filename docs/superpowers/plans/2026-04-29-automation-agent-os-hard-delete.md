# Automation / Agent OS Hard-Delete Contract + Inventory

**Date:** 2026-04-29
**Scope:** `apps/server/src/{workflows,agent-registry,rules,action-task,marketplace,panel}` and their direct shared/web consumers.
**Status:** Contract + inventory PR. No code deletion is performed in this PR. Future PRs delete or rewrite legacy surface against the rules below.
**Parent track:** [`2026-04-28-codebase-reconstruction.md`](2026-04-28-codebase-reconstruction.md) Phase 3B/3C — backend architecture refactor for the `automation` / `agent-os` owner domain.
**Architecture contract:** [`2026-04-29-backend-architecture-contract.md`](2026-04-29-backend-architecture-contract.md).

## Goal

Lock in what survives, what dies, and what gets rewritten before any folder
move in the Automation / Agent OS owner domain. Contract first, deletion later.

The Automation / Agent OS owner domain (per
[`backend-architecture-contract.md`](2026-04-29-backend-architecture-contract.md))
covers: `agent-registry`, `workflows`, `rules`, `action-task`, `marketplace`,
`panel`. These six folders converge under one owner domain because they share
the same runtime: agent delegation, workflow runner, rule evaluation, panel
event projection, marketplace catalog clone, and operator action queue all
sit on the Agent OS execution boundary and the panel event bus.

This PR does **not** start moving folders. It records the keep/delete/rewrite
classification and the hard-delete criteria, so that follow-up PRs can move
fast without re-litigating boundaries.

## Non-goals for this PR

- No Prisma schema changes.
- No frontend changes.
- No `@kiditem/shared` contract changes (no new subpath, no root expansion).
- No workflow / agent runtime behavior change.
- No large folder moves. Specifically: **no `apps/server/src/automation/`
  folder is created in this PR.** That move belongs in a later PR after the
  hard-delete passes have shrunk the surface.
- No ADR documents — permanent rules live in `AGENTS.md`, scoped `CLAUDE.md`,
  and this plan (per the 2026-04-26 ADR sunset rule in root `AGENTS.md`).

## Reference Inputs

- `AGENTS.md` (root) — Cross-Domain Rules: workflow-vs-LLM rule, model-fallback
  rule, multi-tenant rule, raw SQL rule.
- `apps/server/AGENTS.md` — Backend Architecture Contract section, Domain
  Topology Target table (lists `automation` / `agent-os` owner domain mapping),
  Reconstruction Guardrails.
- `apps/server/src/automation/adapter/out/workflow-runner/CLAUDE.md` —
  slim-core executor surface, removed-executor list, and (post-Wave H3 AO-1)
  folded HTTP-route guidance for `/api/workflows/*` and
  `/api/workflow-runs/:runId`.
- `apps/server/src/agent-registry/CLAUDE.md` — Agent OS pattern catalog, tenant
  policy, AgentTask trace contract.
- `apps/server/src/rules/CLAUDE.md` — event-driven evaluation flow and tagged
  raw SQL contract.
- `apps/server/src/marketplace/CLAUDE.md` — read-only catalog + parametrized
  install + slim-core node-type allowlist.
- [`2026-04-28-codebase-reconstruction.md`](2026-04-28-codebase-reconstruction.md)
  Phase 3B priorities and gates.
- [`2026-04-29-backend-architecture-contract.md`](2026-04-29-backend-architecture-contract.md)
  layer rules and "ports mandatory" criteria.

## Survival Core (keep)

The four behaviors below are the minimum that must keep working through every
hard-delete and rewrite PR. Any change that breaks one of these without an
explicit replacement in the same PR is rejected.

1. **DAG runner** — `WorkflowRunnerService.runWorkflow` walking
   `WorkflowTemplate.nodesJson` / `edgesJson`, executing the slim-core
   executor set, recording per-step status, and emitting panel upserts at
   transition points.
2. **WorkflowRun audit record** — `WorkflowRun` row keyed by `(id, companyId)`,
   with `status`, `steps[]`, `error`, `startedAt`, `completedAt`. Tenant-bound
   reads/writes via `findFirst` / `updateMany`.
3. **Panel event projection** — `EventEmitter2` global bus + `PanelSseService`
   ring buffer + `PanelService.snapshot()` backfill across four sources
   (workflow, agent, image, alert). `automation/mapper/panel-event/*.mapper.ts`
   maps domain rows to `PanelItem` / `PanelAlertItem`. Per-user visibility
   filter on `Run-User` ownership.
4. **Agent delegation boundary** — `AgentRegistryService.runByType` /
   `AgentRegistryService.run` as the single entrypoint for AI/LLM work.
   `AgentTask` first-class trace columns (`companyId`, `workflowRunId`,
   `workflowNodeId`, `sourceDataId`). Heartbeat / safety pipeline / adapter
   fallback chain stay inside Agent OS.

Two adjacent behaviors are explicitly **also** kept because they are
load-bearing for the four above:

- **`AgentTask` lifecycle** — pending → running → succeeded/failed, with the
  trace columns and the wakeup payload contract used by `agent_task.create`.
- **Adapter runtime boundary** — `automation/adapter/out/agent-runtime/{claude-local,python-http}/execute`,
  `automation/adapter/out/agent-runtime/{registry,fallback-chain}`, `permissions/*`,
  `safety/*`, `business-safety/*`, `lifecycle/*`, `context-manager/*`,
  `delegation/*`, `wakeup/*`, `events/*`, `trace/*`, `schemas/*`. These are
  the live Agent OS internals that back the survival core.

## Removal / Rewrite Targets

These are **legacy surface candidates**. This PR does not delete them. It
records the criteria each must meet before a follow-up PR can hard-delete or
rewrite them.

1. **Workflow direct LLM/provider path** — already absent from production
   (`automation/adapter/out/workflow-runner/executors/builtin.ts` does not
   import any LLM SDK; `rg` over the slim core returns zero). The contract restates the ban so that "no
   compatibility alias" stays enforced. Any reintroduced direct-LLM path in a
   future PR is a hard-delete target on sight.
2. **`rules` directly injecting `AgentRegistry` runtime / running it
   synchronously** — current `RulesService` already uses
   `agentRegistry.run` + `agentRegistry.runByType` only as task spawn (fire +
   `@OnEvent` callback), but `RulesController` injects both `AgentRegistryService`
   and `HeartbeatService` to manipulate the global `rules_evaluation` agent's
   schedule. That direct controller-level injection of agent runtime services
   becomes a port (`AgentScheduleControlPort`) once `automation/` reconstruction
   lands.
3. **Workflow executor public exports without consumers** —
   `workflows/executors/types.ts` declares
   `StandardOrder` / `StandardProduct` / `StandardInventory` /
   `StandardAd` / `StandardProfitLoss` / `StandardReview` /
   `StandardThumbnail`. They are referenced **only** in
   `workflows/CLAUDE.md` prose. No executor produces them, no shared package
   re-exports them, no web consumer imports them. Forward-looking typing for
   future domain-specific executors that have not been written. Classified as
   **delete-candidate**: keep until a domain-specific executor lands or until
   Phase 3C executor-rewrite PR confirms the contract is restated elsewhere.
4. **Workflow executor registry helpers without consumers** —
   `workflows/executors/index.ts` exports
   `getNodeDefinition` / `listNodeTypes` / `listNodeDefinitions`. The current
   slim core registers all 5 executors with `definition = undefined`, so the
   `DEFINITION_REGISTRY` is permanently empty and these getters always return
   nothing useful. Currently no consumer outside the file. Classified as
   **delete-candidate**, not yet hard-deleted because the workflow executor
   PR may want to repopulate `NodeDefinition` for the frontend node palette.
5. **Marketplace / action-task / admin surface without consumer** — `rg`
   confirms direct consumers exist for every public route (web pages
   `/agents`, `/workflows`, `/marketplace`, `/action-board`). No
   delete-candidate found at the controller level today. The follow-up
   `automation/` rewrite PR will re-evaluate after migrating the 8
   marketplace endpoints + 6 action-task endpoints behind the `application/`
   layer.
6. **`panel` as business-domain owner** — rewritten in Phase 3C-4. `panel`
   no longer exists as a top-level owner domain. HTTP entrypoint lives at
   `automation/adapter/in/http/panel.controller.ts`, projection / SSE bus lives
   at `automation/adapter/out/panel-event/`, and row-to-panel mapping lives at
   `automation/mapper/panel-event/`. No panel-internal mutation: the file order
   is `owner service → emit → PanelSseService → SSE`, never
   `PanelService → mutate`.
7. **Root barrel / shared exports for legacy automation surface** — already
   migrated. All current automation imports use subpaths
   (`@kiditem/shared/{workflow,agent,agent-trace,panel,rules,marketplace,
   action-task,alerts}`). `rg` confirms zero `from '@kiditem/shared'` root
   imports for any automation type. No subpath is currently
   delete-candidate, but **no new automation subpath may be added in this PR
   or in the next two follow-up PRs.**

## Current Surface Inventory

### Workflow runner surface — slim DAG runner

Files (post-Wave H3 AO-1, all under `apps/server/src/automation/`):
- `automation/adapter/in/http/workflows.controller.ts` (controllers
  `WorkflowsController` for `/api/workflows/*`, `WorkflowRunsController` for
  `/api/workflow-runs/*`). DTOs live under
  `automation/adapter/in/http/dto/workflows/`. The former top-level
  `apps/server/src/workflows/` folder is deleted.
- `automation/application/service/workflow-orchestration.service.ts` — template
  CRUD + tenant-scoped run trigger. Owns: `triggerRun`, `batchRun`,
  `findRunDetail`.
- `automation/application/service/workflow-runner.service.ts` — DAG walker,
  per-node executor invocation, tenant rebinding, panel emit.
- `automation/domain/service/workflow-context.ts` — output map +
  `{{nodes.X.output.Y}}` template resolver.
- `automation/domain/service/workflow-dag.ts` — adjacency / branch label DAG.
- `automation/adapter/out/workflow-runner/executors/index.ts` — registry +
  `recordActivity` helper.
- `automation/adapter/out/workflow-runner/executors/builtin.ts` — the 5
  slim-core executors:
  `trigger.manual`, `trigger.schedule`, `condition.evaluate`,
  `notification.alert`, `agent_task.create`.
- `automation/adapter/out/workflow-runner/executors/types.ts` — `Standard*`
  interfaces (delete-candidate above) + `NodeDefinition`.
- `automation/adapter/in/http/dto/workflows/*` — 5 DTOs (`create`, `update`,
  `list`, `run`, `batch-run`).
- `automation/application/service/__tests__/workflow-flow.spec.ts`.

Inbound entrypoints:
- HTTP — `WorkflowsController`, `WorkflowRunsController`. All routes use
  `@CurrentCompany()`.
- Workflow — none (workflows are a target of the runner, not an entry into it).
- Agent — none directly. The Agent OS receives delegated work via
  `agent_task.create` executor calling `AgentRegistryService.runByType`, but
  the workflow side is the producer, not the consumer.
- Cron — none. (Schedule-triggered workflows are gated through `triggerRun`
  fired by an external scheduler today; runner itself is not cron.)

Outbound dependencies:
- Prisma — `workflowTemplate`, `workflowRun`, `alert`, `activityEvent` (via
  `notification.alert`).
- Agent runtime — `AgentRegistryService` (Optional inject in
  `WorkflowRunnerService`).
- Panel/event — `EventEmitter2` (`PANEL_EVENTS.UPSERT` via
  `automation/mapper/panel-event/workflow-run.mapper`).
- LLM/provider — none.
- Filesystem — none.

Shared package use: `@kiditem/shared/workflow`.

Server consumers of `workflows`: none today (runner does not export to other
modules; controllers only).

Web consumers: `/api/workflows/*`, `/api/workflow-runs/*` from
`apps/web/src/app/workflows/page.tsx` (loaded into `agents/page.tsx` as a
tab), `/api/marketplace/workflows/*` re-exports the same template surface
through marketplace install path.

### `apps/server/src/agent-registry/` — Agent OS

Files (~50 production files across these subfolders):
- Top level: `agent-registry.module.ts`, `agent-registry.controller.ts`,
  compatibility facade `agent-registry.service.ts`, `types.ts`.
- `automation/application/service/agent-{crud,run,lifecycle,cost-analytics}.service.ts`
  — Phase 3C-6 split of the old 570-line service implementation.
- `automation/adapter/out/agent-runtime/` — `claude-local/`, `python-http/`,
  `registry.ts`, `fallback-chain.ts`, `types.ts`.
- `business-safety/` — `safety-pipeline.service.ts`,
  `action-cap.service.ts`, `dry-run-gate.service.ts`,
  `post-verification.service.ts`, `snapshot.service.ts`.
- `context-manager/` — `compressor.service.ts`.
- `delegation/` — `delegation.service.ts`, `hierarchy.validator.ts`.
- `domains/` — `ad-strategy/` (controller + service + DTOs),
  `manager/` (controller + service + DTOs).
- `events/` — `agent-events.ts`, `agent-sse.service.ts`.
- `heartbeat/` — `heartbeat.service.ts`.
- `lifecycle/` — `result-cleanup.service.ts`, `retry.service.ts`,
  `transcript.service.ts`.
- `permissions/` — `hierarchy.validator.ts`, `classifier.ts`.
- `safety/` — `dangerous-patterns.ts`, `denial-tracker.service.ts`,
  `skill-filter.service.ts`.
- `schemas/` — `agent-output-schemas.ts`, `validate-output.ts`.
- `skills/` — `skills.service.ts` (filesystem skill mount via symlink).
- `trace/` — `agent-trace.controller.ts`, `agent-trace.service.ts`.
- `wakeup/` — `wakeup.service.ts`.

Inbound entrypoints:
- HTTP — `AgentRegistryController` (`/api/agent-registry/*`),
  `AgentTraceController` (`/api/agent-trace/*`),
  `domains/ad-strategy/AdStrategyController` (`/api/ad-agent/*`),
  `domains/manager/ManagerController` (`/api/manager/*`).
- Workflow — `agent_task.create` executor calls `runByType`.
- Cron — `heartbeat.service.ts` schedules per-agent timers via `cron`.
  `lifecycle/result-cleanup.service.ts` daily cron via `runDailyCleanup`.
- Agent — Agent OS is the receiver of agent invocations from workflows,
  rules, sourcing, advertising, AI thumbnail, companies/agent-tasks.

Outbound dependencies:
- Prisma — `agentDefinition`, `agentTask`, `heartbeatRun`, `agentEvent`,
  `workflowRun` (read), `feature-gate`, plus `cost-analytics` raw SQL via
  `Prisma.sql`.
- LLM/provider — Claude CLI process spawn (`claude-local/execute.ts`),
  Python HTTP runtime (`python-http/execute.ts` via `fetch`).
- Filesystem — `skills/skills.service.ts` (symlink to
  `agent-config/skills/`); prompt files loaded from
  `agent-config/prompts/`.
- Panel/event — `EventEmitter2` for `agent.*` events + `PANEL_EVENTS.UPSERT`
  via `automation/mapper/panel-event/agent.mapper`.
- HTTP fetch — `python-http` adapter only.

Shared package use: `@kiditem/shared/agent`, `@kiditem/shared/agent-trace`,
`@kiditem/shared/security`.

Server consumers of `AgentRegistryService`:
- `automation/application/service/workflow-runner.service.ts` (Optional inject).
- `companies/agent-tasks.service.ts`.
- `ai/services/image-ai.service.ts`.
- `advertising/services/ad-strategy.service.ts`.
- `advertising/services/ad-recommend.service.ts`.
- `sourcing/sourcing.service.ts`.
- `rules/services/rules.service.ts`.
- `rules/controllers/rules.controller.ts` (also injects `HeartbeatService`).
- `agent-registry/domains/manager/manager.service.ts`.
- `agent-registry/domains/ad-strategy/ad-strategy.service.ts`.

Web consumers: `/api/agent-registry/*`, `/api/agent-trace/*`,
`/api/manager/*`, `/api/ad-agent/*` from `apps/web/src/app/agents/**`.

### `apps/server/src/rules/` — event-driven evaluation

Files (13 production files + 5 tests):
- `rules.module.ts`.
- `controllers/rules.controller.ts` — 7 routes
  (`POST /evaluate`, `GET /evaluate/status/:taskId`,
  `GET /summary`, `GET /`, `GET /schedule`,
  `GET /suggest-thresholds`, `PATCH /schedule`, `PATCH /:id`).
- `controllers/alerts.controller.ts` — alert listing, mark-read, promote,
  dismiss.
- `services/rules.service.ts` (265 lines) — agent-spawn evaluation +
  `@OnEvent` callback that does `prisma.$transaction(masterProduct.updateMany)`
  bulk health-score writes and emits panel alert items.
- `services/alerts.service.ts` (199 lines) — promote-to-action-task with
  $transaction race guard, dismiss with panel emit.
- `services/types.ts`, `dto/*` (5 DTOs).

Inbound entrypoints:
- HTTP — `RulesController`, `AlertsController`. `@CurrentCompany()` on every
  route.
- Workflow — none. Rules are spawned via `evaluateAll` → agent task; not via
  workflow executor.
- Agent — `@OnEvent(AGENT_EVENTS.RESULT_READY)` listens for
  `rules_evaluation` agent results.
- Cron — schedule lives on the tenant-owned `rules_evaluation` agent's
  `cron` field (replaceAgentTimer via `HeartbeatService`).

Outbound dependencies:
- Prisma — `businessRule`, `masterProduct` (bulk healthScore), `alert`,
  `actionTask`, `activityEvent`. Always tenant-scoped.
- Agent runtime — `AgentRegistryService.findByType` + `.run` for spawn,
  `HeartbeatService.syncTimers` for schedule reload.
- Panel/event — `EventEmitter2` (`PANEL_EVENTS.UPSERT` and `DISMISS` via
  `automation/mapper/panel-event/alert.mapper`).
- LLM/provider — none directly. All AI evaluation goes through agent.

Shared package use: `@kiditem/shared/rules`, `@kiditem/shared/alerts`.

Server consumers: panel integration tests only.

Web consumers: `/api/rules/*` and `/api/alerts/*` (web rules/alerts pages).

### Action board — operator action queue

Files after Phase 3C-7:
- `automation/adapter/in/http/action-task.controller.ts` (6 routes:
  list, claim, unclaim, update, addNote, executeTask). Public route shape
  remains `/api/action-tasks/*`.
- `automation/application/service/action-board.service.ts` — tenant-scoped
  orchestration over live metrics, action task persistence, source alert joins,
  claim/unclaim, notes, and execution result logging.
- `automation/domain/policy/action-seeds.ts` — pure daily seed threshold
  policy for low CTR / low profit / high ad cost / reorder / review warnings.
- `automation/adapter/in/http/dto/{list-action-tasks,update-action-task,add-note}.dto.ts`.
- Tests moved under `automation/application/service/__tests__/action-board-*`.
- `apps/server/src/action-task/` top-level module is deleted.

Inbound entrypoints:
- HTTP — `ActionTaskController` in Automation. `@CurrentCompany()` on every route.
- Cron — daily seed via `executeTask` + scheduled `getTasks` upsert (the
  cron firing happens upstream of this module today).
- Agent — none directly. Alerts → action-task promotion happens in
  `rules/services/alerts.service.ts:promote`, which writes through Prisma.

Outbound dependencies:
- Prisma — `actionTask`, `alert` (read for sourceAlert join), `inventory`,
  `thumbnail`, `masterProduct`, `option`. Always tenant-scoped.
- HTTP fetch — `executeTask` calls `process.env.API_SELF_URL` to invoke
  the server's own REST endpoints (e.g. `/api/products/calculate-grades`).
  This is **internal self-call**, not external.
- Panel/event — none directly. Promotion path emits via `AlertsService`.
- LLM/provider — none.

Shared package use: `@kiditem/shared/action-task`,
`@kiditem/shared/security` (`scrubSecrets`).

Server consumers: panel integration tests; `rules/services/alerts.service.ts`
(via Prisma write only, not via service inject).

Web consumers: `/api/action-tasks/*` from
`apps/web/src/app/action-board/page.tsx`.

### `apps/server/src/marketplace/` — read-only catalog + parametrized install

Files (5 production files):
- `marketplace.module.ts`, `marketplace.controller.ts` (8 routes —
  4 for workflow catalog, 4 for agent catalog).
- `marketplace.service.ts` (308 lines) — slim-core node-type allowlist gate
  for workflow catalog, install clones to `workflowTemplate` /
  `agentDefinition`, uninstall removes the clone.
- `dto/*` (2 DTOs).

Inbound entrypoints:
- HTTP — `MarketplaceController`. `@CurrentCompany()` on every install /
  list / uninstall.
- Workflow — none.
- Agent — none (the catalog is read-only; runtime invocations go through
  `AgentRegistryService`).

Outbound dependencies:
- Prisma — `marketplace` (read-only catalog), `workflowTemplate` (clone /
  delete), `agentDefinition` (clone / delete + `reportsTo` patch).
- Panel/event — none directly.
- LLM/provider — none.

Shared package use: `@kiditem/shared/marketplace`.

Server consumers: none.

Web consumers: `/api/marketplace/*` from
`apps/web/src/app/marketplace/page.tsx` and
`apps/web/src/app/agents/lib/marketplace-api.ts`.

### `apps/server/src/automation/{adapter,mapper}/panel-event` — Live Ops SSE projection

Files (Phase 3C-4 target):
- `automation/adapter/in/http/panel.controller.ts` (3 routes:
  `Sse('stream')`, `Get('snapshot')`, `Get('backfill')`).
- `automation/adapter/out/panel-event/panel.service.ts` — snapshot reads from
  `workflowRun`, `heartbeatRun`, `thumbnailGeneration`, `alert` and applies
  user-visibility filter.
- `automation/adapter/out/panel-event/panel-events.ts`,
  `panel-sse.service.ts` — multiplex SSE + ring buffer + monotonic seq.
- `automation/mapper/panel-event/{workflow,agent,image,alert}.mapper.ts` +
  `types.ts` + `workflow-run.mapper.ts`.
- Focused scoped guidance lives at
  `automation/adapter/out/panel-event/CLAUDE.md`.

Inbound entrypoints:
- HTTP — `PanelController` SSE + snapshot + backfill. `@CurrentCompany()` +
  `@CurrentUser()` (visibility filter is per-user).
- Workflow — receives `PANEL_EVENTS.UPSERT` from `WorkflowRunnerService` +
  `WorkflowOrchestrationService`.
- Agent — receives `PANEL_EVENTS.UPSERT` from `HeartbeatService` (via
  `agent.mapper`).
- AI thumbnail — receives `PANEL_EVENTS.UPSERT` via `image.mapper`
  (emitted from `ai/services/thumbnail-auto.service.ts` chain).
- Rules / alerts — receives `PANEL_EVENTS.UPSERT` and `PANEL_EVENTS.DISMISS`
  from `RulesService` and `AlertsService` via `alert.mapper`.

Outbound dependencies:
- Prisma — read-only joins for snapshot/backfill.
- LLM/provider — none.
- Filesystem — none.
- Outbound HTTP — none.

Shared package use: `@kiditem/shared/panel`.

Web consumers: `/api/panel/stream` SSE consumed by the panel UI store.

## Keep / Delete / Rewrite / Defer Classification

| Surface | Class | Notes / Hard-delete criteria |
|---|---|---|
| `automation/application/service/workflow-runner.service.ts` (DAG runner) | **Keep** | Survival core #1. Runner-injected tenant scope contract is the safety boundary — preserve. Moved in Phase 3C-5. |
| `automation/application/service/workflow-orchestration.service.ts` (template CRUD + run trigger) | **Keep** | Public route shape remains under `workflows/`; use-case orchestration moved to Automation in Phase 3C-5. |
| `automation/domain/service/workflow-context.ts`, `workflow-dag.ts` | **Keep** | Pure helpers. Domain-pure; no NestJS, Prisma, AgentRegistry, event bus, or provider SDK imports. |
| `automation/adapter/out/workflow-runner/executors/builtin.ts` (5 executors) | **Keep** | Slim-core surface. Any new executor is **domain-specific only** (no generic). |
| `workflows/executors/types.ts` `Standard*` interfaces | **Deleted (Phase 3C-1)** | Zero production consumer. Removed in `refactor/workflow-executor-hard-delete`. Per-domain executor output types now live next to the executor that produces them; no project-wide normalization layer. |
| `workflows/executors/index.ts` `getNodeDefinition` / `listNodeTypes` / `listNodeDefinitions` | **Deleted (Phase 3C-1)** | `DEFINITION_REGISTRY` was permanently empty (every `registerNode` call passed `definition = undefined`) and zero external consumers existed. Removed in `refactor/workflow-executor-hard-delete`; `registerNode` signature simplified to `(nodeType, fn, isConcurrencySafe?)`. |
| `automation/adapter/out/workflow-runner/executors/builtin.ts` legacy aliases (`internal.db_query`, `api_call`, `action`, `data.filter`, `data_transform`, `ai_process`, `trigger`, `trigger.event`, `condition`, `notification`) | **Already deleted** | Restated here as a "do not reintroduce" gate. Templates referencing them MUST fail with `"No executor for node type: …"` and the failure MUST land in `WorkflowRun.error`. |
| `automation/adapter/out/workflow-runner/executors/builtin.ts` direct LLM/provider import | **Hard-banned** | Not present today. Any future regression is hard-deleted on sight. |
| `agent-registry/agent-registry.service.ts` compatibility facade | **Keep** | Survival core #4 public injection token. Implementation moved in Phase 3C-6; future behavior belongs in Automation application services. |
| `automation/application/service/agent-{crud,run,lifecycle,cost-analytics}.service.ts` | **Keep** | Phase 3C-6 implementation split: tenant-scoped CRUD, AgentTask/wakeup run boundary, lifecycle/runtime state, and cost analytics. |
| `automation/adapter/out/agent-runtime/{claude-local,python-http,registry,fallback-chain,types}.ts` | **Keep** | Phase 3C-6 runtime adapter home. No silent model fallback; adapter fallback remains observable. |
| `agent-registry/{heartbeat,permissions,safety,business-safety,delegation,events,trace,wakeup,lifecycle,context-manager,schemas}` | **Keep** | Live Agent OS internals. Remaining folders stay under compatibility module until a narrower follow-up moves each role. |
| `agent-registry/skills/skills.service.ts` (filesystem symlink) | **Keep** | Pure filesystem adapter for skill mount. Will move to `automation/adapter/out/skills-fs/`. |
| `agent-registry/domains/{ad-strategy,manager}/*` | **Keep** | Domain post-processing live behind their own controllers. Manager has the human-in-the-loop async-generator workflow. Will move under `automation/application/service/{manager,ad-strategy}` after rewrite. |
| `rules/controllers/rules.controller.ts` direct injection of `AgentRegistryService` + `HeartbeatService` (schedule PATCH) | **Rewritten (Phase 3C-2)** | Schedule control now flows through `AgentScheduleControlPort` (`automation/application/port/in/`) with `AgentRuntimeScheduleControlAdapter` (`automation/adapter/out/agent-runtime/`). `RulesController` injects only the port. Heartbeat timer reload + tenant-ownership rejection live inside the adapter. |
| `rules/services/rules.service.ts` agent-spawn + `@OnEvent` | **Keep** | Sole correct evaluation pattern. Synchronous evaluation is hard-banned. |
| `rules/services/alerts.service.ts` promote $transaction + dismiss panel emit | **Keep** | Race-guard contract. Move to `automation/application/service/alert-promotion` post-rewrite. |
| `automation/domain/policy/action-seeds.ts` daily seed policy | **Keep (Phase 3C-7)** | Pure threshold rules. No NestJS, Prisma, AgentRegistry, event bus, filesystem, or provider SDK imports. |
| `automation/application/service/action-board.service.ts` orchestration | **Keep (Phase 3C-7)** | Replaces the old top-level `action-task/action-task.service.ts`. Owns tenant-scoped Prisma orchestration for `/api/action-tasks/*`. |
| `automation/application/service/action-board.service.ts:executeTask` self-fetch via `API_SELF_URL` | **Defer** | Self-fetch back into the same NestJS process is a smell, but the targeted endpoints span `products`, `inventory`, `coupang-category`, etc. Replacement requires a stable internal-call port; defer to a dedicated internal-command port PR. |
| `marketplace/marketplace.service.ts` slim-core allowlist gate | **Keep** | Catalog defense-in-depth. Allowlist must mirror `executors/builtin.ts` registration; sync rule already in `marketplace/CLAUDE.md`. |
| `marketplace/marketplace.service.ts` install/uninstall paths | **Rewritten (Phase 3C-3)** | Moved to `automation/application/service/marketplace-install.service.ts` for orchestration and `automation/adapter/out/prisma/marketplace-install-store.adapter.ts` for tenant-scoped persistence. `MarketplaceController` moved to `automation/adapter/in/http/marketplace.controller.ts`; DTOs alongside. Catalog read methods (`listWorkflows` / `getWorkflow` / `listAgents` / `getAgent`) stay in `marketplace/marketplace.service.ts`. Slim-core allowlist extracted to `marketplace/workflow-slim-core.ts` (single source of truth shared with the install service). Public route shape unchanged. |
| `panel/panel.service.ts` snapshot multi-source backfill | **Rewritten (Phase 3C-4)** | Top-level `panel/` removed. Projection now lives at `automation/adapter/out/panel-event/panel.service.ts`. |
| `panel/events/panel-sse.service.ts` ring buffer + multiplex SSE | **Rewritten (Phase 3C-4)** | Moved to `automation/adapter/out/panel-event/panel-sse.service.ts`; event constants moved alongside. |
| `panel/adapters/*.adapter.ts` | **Rewritten (Phase 3C-4)** | Moved and renamed to `automation/mapper/panel-event/*.mapper.ts`, with `workflow-run.mapper.ts` as the internal upsert helper. |
| Web `marketplaceFilter`, `agents/page.tsx` tab orchestration | **Defer** | Owned by frontend Phase 4. Out of scope for this owner domain. |
| Shared subpaths `@kiditem/shared/{workflow,agent,agent-trace,panel,rules,marketplace,action-task,alerts}` | **Keep** | All have direct consumers per the inventory above. Do not add new automation subpaths in this PR or in the next two follow-up PRs. |

## Hard-delete Criteria

A follow-up PR may hard-delete a surface listed above only when **all four**
criteria hold. Anything else is a rewrite, not a delete.

1. **`rg` confirms zero consumers** outside of the surface itself, its tests,
   and the surface's own scoped `CLAUDE.md`.
2. **Public API / shared schema unaffected** — no controller route, no
   `@kiditem/shared/*` export, no `WorkflowRun.steps[].nodeType` historic
   value depends on it.
3. **Build evidence available** — at minimum
   `npm run build --workspace=apps/server`, plus
   `npm run check:idor` and `npm run check:tenant-scope` if the surface
   touches a tenant-scoped Prisma path.
4. **Contract alignment** — the surface matches a "delete-candidate" or
   "already deleted" row above, OR a row in the `workflows/CLAUDE.md`
   removed-executor list, OR a "Hard-banned" row.

If even one criterion is missing, classify the surface in this plan rather
than deleting it.

This PR performs **no hard deletion**. The two delete-candidates
(`workflows/executors/types.ts` `Standard*`, `workflows/executors/index.ts`
node-definition getters) are intentionally left in place; their consumer
scan returned zero, but criterion 4 is borderline because the executor
public contract may want them. Resolution belongs in the workflow
executor-rewrite PR.

## Migration Order (follow-up PRs)

Each follow-up PR is one owner-domain PR. Do not bundle two of these.

1. **Phase 3C-1 — Workflow executor rewrite + first hard-delete**
   - Decide on `Standard*` types and node-definition registry helpers (keep
     or delete).
   - Replace `executeTask` self-fetch in `action-task` with an explicit
     internal-call port if the executor surface needs it.
   - No folder moves yet.
   - **Resolution (PR `refactor/workflow-executor-hard-delete`):**
     `executors/types.ts` deleted (all 7 `Standard*` interfaces +
     `NodeDefinition` + `ConfigField`/`OutputField` had zero production
     consumers). `executors/index.ts` registry-introspection helpers
     deleted (`getNodeDefinition`, `listNodeTypes`, `listNodeDefinitions`,
     `DEFINITION_REGISTRY`, and the `definition` parameter of
     `registerNode` — all unreachable because every `registerNode` call in
     `builtin.ts` passed `definition = undefined`). `executeTask` internal-call
     port deferred — none of the surviving 5 executors currently invoke the
     `action-task` self-fetch surface, so introducing a port now would have
     no consumer. Revisit when a future domain-specific executor needs
     internal-call routing.

2. **Phase 3C-2 — Rules schedule control port**
   - Replace `RulesController` direct injection of `AgentRegistryService` +
     `HeartbeatService` with `AgentScheduleControlPort` (interface in
     `automation/application/port/in/`, adapter in
     `automation/adapter/out/agent-runtime/`).
   - This is the first surface to physically land under
     `apps/server/src/automation/`.
   - **Resolution (PR `refactor/rules-schedule-control-port`):** landed.
     `apps/server/src/automation/` now exists with
     `application/port/in/agent-schedule-control.port.ts` (defines
     `AgentScheduleControlPort` + `TenantOwnedAgentRequiredError` + DI
     token) and `adapter/out/agent-runtime/agent-schedule-control.adapter.ts`
     (`AgentRuntimeScheduleControlAdapter` consumes
     `AgentRegistryService.findByType` + `.update` and
     `HeartbeatService.syncTimers`). `AutomationModule` provides the
     port; `RulesModule` imports it. `RulesController` now injects the
     port only — no direct `AgentRegistryService` / `HeartbeatService`
     dependency. `/api/rules/schedule` GET/PATCH route shape, DTO, and
     BadRequest message are preserved. Adapter unit tests cover global /
     foreign-tenant rejection + tenant-owned write + disable path.

3. **Phase 3C-3 — Marketplace install application service**
   - Move `installWorkflow` / `installAgent` / `uninstall*` behind
     `automation/application/service/marketplace-install.service.ts`. Keep
     `MarketplaceController` as `automation/adapter/in/http/marketplace.controller.ts`.
   - **Resolution (PR `refactor/marketplace-install-application-service`):**
     landed. `MarketplaceInstallService` owns install/uninstall
     orchestration (slim-core defense-in-depth on workflow install,
     schedule/param mapping, specialist `reportsTo` auto-wiring).
     Tenant-scoped Prisma writes and `installCount` changes live behind
     `MarketplaceInstallStorePort` with
     `PrismaMarketplaceInstallStoreAdapter` in
     `automation/adapter/out/prisma/`. `MarketplaceController` moved to
     `automation/adapter/in/http/marketplace.controller.ts`; HTTP DTOs
     moved alongside under `automation/adapter/in/http/dto/`. Catalog
     read remains as `MarketplaceService` in `marketplace/` (no port
     wrap — read-only catalog projection has no runtime side effect).
     Slim-core node-type allowlist extracted to
     `marketplace/workflow-slim-core.ts` so the lockstep with
     `automation/adapter/out/workflow-runner/executors/builtin.ts` is single-source. Routes, DTOs,
     and response shapes unchanged. New unit spec at
     `automation/application/service/__tests__/marketplace-install.service.spec.ts`.

4. **Phase 3C-4 — Panel as outgoing adapter**
   - Move `panel/` to `automation/adapter/out/panel-event/`. `panel.service.ts`
     becomes the read-side projection adapter. The four adapters become
     `mapper/` examples.
   - **Resolution (PR `refactor/panel-outgoing-adapter`):** implemented.
     `/api/panel/*` route shape is preserved via
     `automation/adapter/in/http/panel.controller.ts`. The projection and SSE
     bus live under `automation/adapter/out/panel-event/`; row-to-panel mapping
     moved to `automation/mapper/panel-event/`. `PanelModule` and top-level
     `apps/server/src/panel/` were removed; `AutomationModule` now registers
     panel controller/providers.

5. **Phase 3C-5 — Workflow runner under application service**
   - Move `WorkflowsService` to `automation/application/service/workflow-orchestration.service.ts`.
   - Move `WorkflowRunnerService` to `automation/application/service/workflow-runner.service.ts`.
   - Move `executors/` to `automation/adapter/out/workflow-runner/executors/`.
   - Domain-pure helpers (`context.ts`, `dag.ts`) go to
     `automation/domain/service/`.
   - **Resolution (PR `refactor/workflow-runner-application-service`):**
     implemented. `WorkflowOrchestrationService` and `WorkflowRunnerService`
     now live under `automation/application/service/`; `workflows/` retains
     only `/api/workflows/*` and `/api/workflow-runs/*` HTTP compatibility
     routes plus DTOs. Slim-core executors moved to
     `automation/adapter/out/workflow-runner/executors/`, while
     `workflow-context.ts` and `workflow-dag.ts` moved to
     `automation/domain/service/`. `AutomationModule` registers and exports
     workflow orchestration; route shape, DTO shape, trusted runner-injected
     company scope, panel events, and `agent_task.create` delegation are
     preserved.

6. **Phase 3C-6 — Agent OS internals split**
   - The 570-line `agent-registry.service.ts` splits into:
     `automation/application/service/{agent-crud,agent-run,agent-lifecycle,agent-cost-analytics}.service.ts`.
   - `adapters/` → `automation/adapter/out/agent-runtime/`.
   - `heartbeat/`, `lifecycle/`, `context-manager/` → application services
     and adapters per their actual role.
   - **Resolution (PR `refactor/agent-os-application-split`):**
     implemented for the load-bearing AgentRegistry facade and runtime adapter
     boundary. `AgentRegistryService` remains as the public compatibility token
     for controllers and existing domain callers, while CRUD, run delegation,
     lifecycle/runtime-state, and cost analytics moved to Automation
     application services. Claude/Python adapter execution, registry,
     fallback-chain, and immutable execution context moved to
     `automation/adapter/out/agent-runtime/`. Heartbeat, lifecycle cleanup,
     context-manager, permissions, safety, delegation, trace, wakeup, and
     schemas remain in `agent-registry/` as live runtime internals until each
     narrower role can move without changing behavior.

7. **Phase 3C-7 — Action-task split**
   - Move daily seed thresholds to
     `automation/domain/policy/action-seeds.ts`.
   - Move orchestration to
     `automation/application/service/action-board.service.ts`.
   - Move HTTP layer to `automation/adapter/in/http/action-task.controller.ts`.
   - **Resolution (PR `refactor/action-task-automation-split`):**
     implemented. The legacy `apps/server/src/action-task/` top-level module
     was deleted, `/api/action-tasks/*` is registered by `AutomationModule`,
     action-board DTOs live beside the HTTP adapter, and existing unit /
     integration tests moved under Automation with the same tenant-scope
     behavior locked.

The total is 7 follow-up PRs, not one mega-rewrite. Each PR keeps the
controller route shape, the WorkflowRun audit shape, and the panel event
contract stable.

## Verification Gates

This PR is contract + inventory + scoped-instruction PR.

```bash
git diff --check
npm run build --workspace=apps/server
npm run check:idor
npm run check:tenant-scope
```

Build is included even though no production code changes because:
- Scoped `CLAUDE.md` updates are documentation, but
- The verification habit catches accidental cross-doc references that break
  TypeScript path comments.

`check:idor` and `check:tenant-scope` are included because they are the two
"truthful baseline" gates required for any PR that touches automation
surface — see `apps/server/AGENTS.md` Reconstruction Guardrails.

For each follow-up PR (Phase 3C-1 through 3C-7) the gate set is:

```bash
npm run build --workspace=apps/server
npm run check:idor
npm run check:tenant-scope
npm run dev:server   # boot to 4000 — DI errors are not caught by tsc
```

If a PR moves Prisma usage but no schema changes, schema gates do not run
(per master plan's Schema Change Trigger).

## Non-goals — restated

- No automation business behavior change in this PR.
- No `apps/server/src/automation/` folder created.
- No Prisma model edits.
- No frontend touch.
- No new shared subpath.
- No ADR file (rules go to `AGENTS.md` / scoped `CLAUDE.md` / this plan).

## Remaining risks

- `agent-registry.service.ts` is now a compatibility facade. Adding new behavior
  there is a regression risk; reviewers must steer additions to
  `automation/application/service/agent-*.service.ts` or
  `automation/adapter/out/agent-runtime/`.
- `panel.service.ts` reads four sources directly via Prisma. After the
  `automation/adapter/out/panel-event/` move (Phase 3C-4) the source list
  must remain `workflowRun + heartbeatRun + thumbnailGeneration + alert`.
  Adding a fifth source from a different owner domain reintroduces panel as
  a business owner — explicitly disallowed.
- `RulesController` schedule PATCH and `agent-registry/domains/manager`
  human-in-the-loop are the two trickiest paths. Their tests live in
  `__tests__/rules-flow.spec.ts` and `__tests__/manager.service.spec.ts`
  respectively; do not delete or weaken those specs during the rewrite.
- The slim-core executor allowlist in `marketplace.service.ts` and the
  registration list in `executors/builtin.ts` must stay in lockstep. The
  marketplace `CLAUDE.md` already states this; the workflow executor
  rewrite PR (Phase 3C-1) must restate it after any change.
