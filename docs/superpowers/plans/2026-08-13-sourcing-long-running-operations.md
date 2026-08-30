# Sourcing Long-Running Operations Implementation Plan

> Superseded as an executable KID-25 plan (2026-08-23). Do not resume tasks from
> this plan. Completed deterministic Operations contracts are reference-only;
> use the
> [KID-25 Agent OS Clean Contraction Design](../specs/2026-08-23-kid-25-agent-os-clean-contraction-design.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bind every `OperationRun` to the single API process lifecycle, then move every long-running sourcing collection or derived-snapshot action onto that fail-closed control plane with isolated resource classes and snapshot-first UI.

**Architecture:** `ApiApplicationModule` is the only root that imports `OperationsModule`; it cancels every old active/waiting run and advances missed schedules before listening, and it terminally cancels current work during shutdown. `AgentWorkerApplicationModule` and Agent OS child contexts use controller-free runtime composition and cannot import Operations directly or transitively. Inside one accepting API lifecycle, server/browser handlers retain the existing resource lanes, fenced leases, deadlines, and owner-domain persistence; React renders snapshots separately from runs and never owns provider loops.

**Tech Stack:** NestJS 11, Prisma 7/PostgreSQL, Zod 3, React 19/Next.js, TanStack Query, Chrome Manifest V3, Vitest, Node test, Playwright-backed 1688 adapters

---

## Plan status and execution protocol

- Root issue: KID-24
- Design authority:
  `docs/superpowers/specs/2026-08-13-sourcing-long-running-operations-design.md`
- PR base: `develop`
- Integration branch: `codex/kid-24-sourcing-operation-run`
- Source baseline: `origin/develop@0c6485b7` after KID-23 PR #478, merged
  into this branch as `f631e158` before this plan was finalized
- Plan sharing: `docs/superpowers/plans/` is no longer ignored; this plan is
  versioned with the design and implementation
- Change class: Operations platform reconstruction with declared Sourcing,
  Advertising, Web, Shared, Prisma, and Extension consumers
- Data/backfill: additive Operation columns with database defaults; no sourcing
  or tracking data rewrite
- Release: compatible schema change in the open release train; no `VERSION`
  bump and no data migration
- Approved lifecycle policy: no run deletion, requeue, attempt decrement,
  reclaim, resume, or automatic restart across an API process boundary;
  operator retry creates a new `OperationRun`. KID-25's official durable
  AgentOS runtime is the narrow exception: after `ACCEPTING`, it atomically
  creates a new immutable OperationRun binding for the same persisted external
  attempt/handle; it never reactivates or rewrites the lifecycle-cancelled row.
- Supported deployment: exactly one API process; replica overlap and rolling
  API replacement remain prohibited until a persisted lifecycle-generation
  design is approved

KID-24 is the single implementation issue. The accountable human explicitly
approved one large integration PR on 2026-08-13. Implement every numbered task
on the same branch and keep each task as a reviewer-readable commit/checkpoint;
do not create child implementation issues or stacked PRs. Open one draft PR to
`develop` after Task 5, keep the design and plan in that PR, and squash the PR
when it is finally merged. Record shared-state checkpoints on KID-24 after each
of the five phases, not after every local commit.

Tasks 1 and 2 are completed, reviewed checkpoints. Their production/test
commits are `14224c58`, `215ca0b1`, `9b78d5ab`, `683a52ba`, `1dcf76bf`,
`63557b4c`, `648c94f9`, and `07d5137a`. Do not rewrite or amend them. The
worktree also contains a paused, uncommitted Task 4/5 experiment in Operations
repository/worker files. Treat that diff as disposable RED evidence: preserve
it while reviewing, replace the sourcing-only/worker-owned lifecycle methods in
place, and never commit the superseded `cancelSourcingRuns...`,
`operation_worker_shutdown`, queued restoration, or attempt-decrement paths.

The tasks map to the five design phases:

| Phase                                | Tasks |
| ------------------------------------ | ----- |
| Execution safety and observability   | 1-5   |
| Deadline and snapshot-first reads    | 6-7   |
| Browser operation pilot              | 8-9   |
| Long-flow migration                  | 10-13 |
| Legacy removal and performance gates | 14    |

Before editing any task, re-run `rtk rg --files -g AGENTS.md` and read the
root-to-target instruction chain. The file lists below are the intended scope;
if implementation requires a new domain or more than the stated boundaries,
update KID-24 and this plan before continuing.

## Root-cause coverage

The program is not limited to loading copy on the 14 routes. The structural
findings that triggered KID-24 map to implementation tasks as follows:

| Root cause                                                                                         | Owning tasks                  |
| -------------------------------------------------------------------------------------------------- | ----------------------------- |
| Shared `AppModule` lets the Agent OS worker and MCP children instantiate Operations                | 3                             |
| Agent OS `sourcing.refreshCollection` currently reaches Operations inside the MCP child            | 3                             |
| API restart can reclaim or leave old active/waiting runs and missed schedules                      | 4-5                           |
| Four incompatible execution paths (`OperationRun`, direct extension, synchronous HTTP, React loop) | 8-13                          |
| Wholesale mount effects launching queued 1688 work after navigation                                | 7 and 12                      |
| Extension run IDs that still wait up to 90 seconds for the final response                          | 8-11                          |
| Process-wide single `busy` worker and unfiltered claim                                             | 1-2                           |
| Sequential trend sources, Naver chunks, and 1688 seeds                                             | 12-13                         |
| Missing GET deadline and incomplete abort propagation                                              | 2, 6, and 8                   |
| Rising read/compute/write in a user request                                                        | 13                            |
| Per-product tracking-history N+1                                                                   | 7                             |
| Success, partial, duplicate, no-change, and failure displayed as one completion state              | 6-13                          |
| Stale errors and older runs overwriting later UI state                                             | 6 and every migrated consumer |

## Fixed contracts used by every task

### Operation definition and result

```ts
export type OperationResourceClass =
  | "default"
  | "naver_api"
  | "extension_coupang"
  | "playwright_1688"
  | "snapshot_compute";

export interface OperationDefinition {
  key: string;
  version: number;
  title: string;
  ownerDomain: string;
  engineType: OperationEngineType;
  allowedTriggers: readonly OperationTriggerSource[];
  scheduleSupported: boolean;
  maxAttempts: number;
  resourceClass: OperationResourceClass;
  executionTimeoutMs: number;
  inputSchema: z.ZodType<Record<string, unknown>>;
}

export type SourcingOperationOutcome = "complete" | "partial" | "no_change";
```

Do not add `partial` or `no_change` to `OperationStatus`. A partial/no-change
run is `succeeded` with a parsed safe result outcome.

### Operation keys

```text
sourcing.collect_daily_trends
sourcing.collect_naver_trends
sourcing.collect_1688_trends
sourcing.collect_shorts_trends
sourcing.collect_wing_catalog_batch
advertising.refresh_tracked_wing_products
sourcing.collect_keyword_suggestions
advertising.collect_competitor_catalog
sourcing.search_1688_keyword_batch
sourcing.match_wholesale_images
sourcing.detect_rising_products
```

Exact keys are code-owned and registered once. Do not create per-page aliases
for market, recommendation, and validation when the purpose enum can select the
same canonical Wing batch.

### Resource limits

```json
{
  "default": 2,
  "naver_api": 2,
  "extension_coupang": 4,
  "playwright_1688": 1,
  "snapshot_compute": 2
}
```

These are worker dispatch limits. KidItem OS additionally keeps one active
browser claim per `local` or `office` environment.

### API lifecycle and process roots

```ts
export type OperationServerLifecycleState =
  "BOOTSTRAPPING" | "ACCEPTING" | "STOPPING" | "STOPPED";

export const OPERATION_LIFECYCLE_ACTIVE_STATUSES = [
  "queued",
  "waiting_runtime",
  "waiting_dependency",
  "running",
] as const;

export type OperationLifecycleCancellationCode =
  "operation_server_shutdown" | "operation_server_lifecycle_expired";
```

Only `ACCEPTING` admits a start/retry, server or browser claim, composite child
creation/resume, or schedule dispatch. Graceful shutdown uses
`operation_server_shutdown`; the next boot after abrupt loss uses
`operation_server_lifecycle_expired`. Both preserve the row, attempt count,
stage/count/deadline/schedule/idempotency and parent/child audit fields while
clearing claim/token/lease fields. `cancelled` is immutable.

The module split follows Nest's documented static module/export graph and
standalone application context. Lifecycle orchestration uses
`onApplicationBootstrap`, `onModuleDestroy`, and
`beforeApplicationShutdown`; the root bootstrap must keep
`enableShutdownHooks()` enabled. References:
[Nest modules](https://docs.nestjs.com/modules),
[standalone applications](https://docs.nestjs.com/application-context), and
[lifecycle events](https://docs.nestjs.com/fundamentals/lifecycle-events).

### Agent-to-API operation command

`sourcing.refreshCollection` is the only existing Agent OS capability that
starts an `OperationRun`. Preserve the capability without importing Operations
into the Agent worker or MCP graph:

```ts
export interface AgentApiCapabilityGrantClaims {
  version: 1;
  audience: "kiditem-api-operation-command";
  organizationId: string;
  requestId: string;
  runId: string;
  agentInstanceId: string;
  capabilities: ["sourcing.refreshCollection"];
  issuedAt: number;
  expiresAt: number;
  nonce: string;
}

export const AGENT_API_CAPABILITY_GRANT_TTL_MS = 120_000;
```

`issuedAt` and `expiresAt` are Unix epoch milliseconds; `nonce` is a random
UUID. The verifier requires `issuedAt <= now < expiresAt` and
`expiresAt - issuedAt === AGENT_API_CAPABILITY_GRANT_TTL_MS`.

The trusted Agent parent signs fixed-order JSON with
`AGENT_API_CAPABILITY_GRANT_SECRET` using HMAC-SHA-256. Its UTF-8 encoding must
be at least 32 bytes and it never enters the model CLI environment or MCP
descriptor; the descriptor receives only the bounded bearer. The API checks
the MAC with `timingSafeEqual`, exact version/audience/capability, expiration,
and the persisted active organization/request/run/agent tuple. The request body
contains only strict `sources`; actor and idempotency are derived on the API.
The API must be `ACCEPTING` before it invokes `OPERATION_RUNNER_PORT`. Nginx
returns 404 for `/api/internal/**`, but network hiding never replaces grant and
tenant verification. Replay within the TTL returns the same run through the
derived idempotency key; it never creates a second run or revives an old one.

## Task 1: Persist resource, deadline, stage, and count contracts

**Phase:** Execution safety and observability

**Status:** Completed and reviewed in `14224c58`, `215ca0b1`, and `9b78d5ab`

**Files:**

- Modify: `packages/shared/src/schemas/operations.ts`
- Modify: `packages/shared/src/schemas/operations.spec.ts`
- Modify: `apps/server/src/common/operation-definition.ts`
- Modify: `prisma/models/system.prisma`
- Modify: `apps/server/src/operations/application/port/out/repository/operation.repository.port.ts`
- Modify: `apps/server/src/operations/adapter/out/repository/operation.repository.adapter.ts`
- Modify: `apps/server/src/operations/application/service/operation-run.service.ts`
- Modify: `apps/server/src/operations/application/service/browser-operation-runtime.service.ts`
- Modify: `apps/server/src/operations/adapter/in/http/operations.controller.ts`
- Modify: `apps/server/src/advertising/domain/operation/advertising.operations.ts`
- Modify: `apps/server/src/channels/domain/operation/channels.operations.ts`
- Modify: `apps/server/src/inventory/domain/operation/inventory.operations.ts`
- Modify: `apps/server/src/orders/domain/operation/orders.operations.ts`
- Modify: `apps/server/src/products/domain/operation/product-profitability.operations.ts`
- Modify: `apps/server/src/sourcing/domain/operation/sourcing.operations.ts`
- Modify: `apps/server/src/operations/application/service/__tests__/composite-operation-coordinator.service.spec.ts`
- Modify: `apps/server/src/operations/application/service/__tests__/operation-handler-registry.service.spec.ts`
- Modify: `apps/server/src/operations/application/service/__tests__/operation-run.service.spec.ts`
- Modify: `apps/server/src/operations/application/service/__tests__/browser-operation-runtime.service.spec.ts`
- Regenerate: `docs/ERD.md`, `docs/erd/**`

- [x] **Step 1: Write failing shared-schema tests**

Add tests that parse a complete run and reject inconsistent count/stage data:

```ts
it("requires stage-safe progress counts without changing status vocabulary", () => {
  expect(OperationStatusSchema.options).not.toContain("partial");
  expect(
    OperationRunSchema.parse({
      ...validRun,
      resourceClass: "playwright_1688",
      stage: "collecting_keyword",
      stageUpdatedAt: "2026-08-13T01:02:03.000Z",
      progressCurrent: 11,
      progressTotal: 12,
      deadlineAt: "2026-08-13T01:17:03.000Z",
    }).progressCurrent,
  ).toBe(11);

  expect(() =>
    OperationRunSchema.parse({
      ...validRun,
      resourceClass: "unknown",
    }),
  ).toThrow();
  expect(() =>
    OperationRunSchema.parse({
      ...validRun,
      progressCurrent: 13,
      progressTotal: 12,
    }),
  ).toThrow();
});
```

- [x] **Step 2: Confirm the contract test fails**

Run:

```bash
rtk npm exec vitest -- run packages/shared/src/schemas/operations.spec.ts
```

Expected: FAIL because the new fields and resource enum do not exist.

- [x] **Step 3: Add the shared schemas and types**

Add `OperationResourceClassSchema`, `OperationStageSchema`, and a shared
refinement requiring progress counters as a pair. Extend catalog, run, browser
claim, heartbeat, and report schemas. The claim includes `deadlineAt`;
heartbeat/report accept stage and counts. Safe-result validation remains
unchanged.

```ts
export const OperationResourceClassSchema = z.enum([
  "default",
  "naver_api",
  "extension_coupang",
  "playwright_1688",
  "snapshot_compute",
]);

export const OperationStageSchema = z.string().regex(/^[a-z][a-z0-9_]{0,79}$/);
```

- [x] **Step 4: Add additive Prisma columns and indexes**

Use string fields, not a native enum:

```prisma
resourceClass      String    @default("default") @map("resource_class")
executionTimeoutMs Int       @default(900000) @map("execution_timeout_ms")
stage              String?
stageUpdatedAt     DateTime? @map("stage_updated_at") @db.Timestamptz
progressCurrent    Int?      @map("progress_current")
progressTotal      Int?      @map("progress_total")
deadlineAt         DateTime? @map("deadline_at") @db.Timestamptz

@@index([resourceClass, status, scheduledFor])
@@index([resourceClass, status, leaseExpiresAt])
```

Do not add CHECK constraints or a data migration. Existing rows receive the
database defaults; nullable progress metadata needs no backfill.

- [x] **Step 5: Copy resolved definition policy into every new run**

Make both definition fields required. Update every registered definition and
all test fixtures. `OperationRunService.start()` passes them to `createRun`,
and `toWire()` returns the persisted values. Catalog mapping returns definition
values, not defaults reconstructed in the controller.

- [x] **Step 6: Map stage updates safely in the repository**

Extend `OperationRunTransition` with stage/count/deadline fields. When the stage
value changes, set `stageUpdatedAt`; when only a heartbeat repeats the same
stage, preserve the earlier stage timestamp. Derive normalized progress when
both counters are present.

- [x] **Step 7: Run schema and focused Operations verification**

```bash
rtk npm exec vitest -- run packages/shared/src/schemas/operations.spec.ts
rtk npm exec --workspace=apps/server vitest -- run src/operations/application/service/__tests__/operation-run.service.spec.ts src/operations/application/service/__tests__/browser-operation-runtime.service.spec.ts src/operations/application/service/__tests__/operation-handler-registry.service.spec.ts src/operations/adapter/in/http/__tests__/operations.controller.spec.ts
rtk npm run db:push
rtk npx prisma generate
rtk npm run build --workspace=packages/shared
rtk npm run db:erd
```

Expected: PASS; Prisma reports only additive columns/indexes.

- [x] **Step 8: Commit**

```bash
rtk git add packages/shared/src/schemas/operations.ts packages/shared/src/schemas/operations.spec.ts apps/server/src/common/operation-definition.ts apps/server/src/operations apps/server/src/advertising/domain/operation/advertising.operations.ts apps/server/src/channels/domain/operation/channels.operations.ts apps/server/src/inventory/domain/operation/inventory.operations.ts apps/server/src/orders/domain/operation/orders.operations.ts apps/server/src/products/domain/operation/product-profitability.operations.ts apps/server/src/sourcing/domain/operation/sourcing.operations.ts prisma/models/system.prisma docs/ERD.md docs/erd
rtk git commit -m "feat(operations): persist execution resource metadata"
```

## Task 2: Replace the global worker lock with fenced resource-class execution

**Phase:** Execution safety and observability

**Status:** Completed and reviewed in `683a52ba`, `1dcf76bf`, `63557b4c`,
`648c94f9`, and `07d5137a`; Tasks 4-5 replace only the cross-lifecycle policy

**Depends on:** Task 1 committed and verified on the integration branch

**Files:**

- Modify: `apps/server/src/operations/application/service/operation-runtime.config.ts`
- Create: `apps/server/src/operations/application/service/operation-attempt-executor.service.ts`
- Create: `apps/server/src/operations/application/service/__tests__/operation-attempt-executor.service.spec.ts`
- Modify: `apps/server/src/operations/application/service/operation-run-worker.service.ts`
- Create: `apps/server/src/operations/application/service/__tests__/operation-run-worker.service.spec.ts`
- Modify: `apps/server/src/operations/application/service/operation-dispatcher.service.ts`
- Modify: `apps/server/src/operations/application/port/out/repository/operation.repository.port.ts`
- Modify: `apps/server/src/operations/adapter/out/repository/operation.repository.adapter.ts`
- Modify: `apps/server/src/common/operation-definition.ts`
- Modify: `apps/server/src/operations/operations.module.ts`
- Modify: `apps/server/src/operations/application/service/__tests__/operation-run.service.spec.ts`

- [x] **Step 1: Write worker isolation and fence-loss tests**

Use deferred promises to prove the worker dispatches another class while 1688
is still running and never exceeds the configured class capacity:

```ts
it("does not let a blocked playwright run stop naver work", async () => {
  repository.claimNextRun
    .mockResolvedValueOnce(playwrightRun)
    .mockResolvedValueOnce(naverRun)
    .mockResolvedValue(null);
  dispatcher.dispatch.mockImplementation(async (run) => {
    if (run.id === playwrightRun.id) await playwrightGate.promise;
  });

  await worker.tick();
  expect(dispatcher.dispatch).toHaveBeenCalledWith(
    expect.objectContaining({ id: naverRun.id }),
    expect.any(Object),
  );
});
```

Add executor tests that a failed `heartbeatRun` aborts the signal and prevents a
success transition, and that the definition deadline produces
`operation_deadline_exceeded`.

- [x] **Step 2: Confirm the tests fail**

```bash
rtk npm exec --workspace=apps/server vitest -- run src/operations/application/service/__tests__/operation-run-worker.service.spec.ts src/operations/application/service/__tests__/operation-attempt-executor.service.spec.ts
```

Expected: FAIL because the worker has one `busy` flag and no attempt executor.

- [x] **Step 3: Parse class limits strictly**

`resolveOperationResourceClassLimits()` returns a complete record. Parse
`OPERATION_RESOURCE_CLASS_LIMITS` with the shared enum, require safe positive
integers, and throw at startup on malformed JSON or unknown keys. Do not fall
back silently when the variable is present but invalid.

- [x] **Step 4: Add filtered claim and fenced heartbeat methods**

Change the repository port to:

```ts
claimNextRun(input: {
  resourceClass: OperationResourceClass;
  workerId: string;
  now: Date;
  leaseExpiresAt: Date;
}): Promise<OperationRunRecord | null>;

heartbeatRun(input: {
  organizationId: string;
  runId: string;
  attemptToken: string;
  now: Date;
  leaseExpiresAt: Date;
  stage?: string | null;
  progressCurrent?: number | null;
  progressTotal?: number | null;
}): Promise<OperationRunRecord | null>;

expirePastDeadlineRuns(input: {
  now: Date;
  limit: number;
}): Promise<number>;
```

Filter the raw claim query with a bound `${input.resourceClass}` value. Select
`execution_timeout_ms`; on first claim set `deadline_at`, and preserve it on
retry. All updates remain composite organization-scoped and attempt-token
fenced. The deadline sweep transitions only active, past-deadline rows to
`failed/operation_deadline_exceeded`; a running attempt loses its token so its
next heartbeat aborts.

- [x] **Step 5: Add the attempt execution context**

Extend `OperationHandlerContext`:

```ts
signal: AbortSignal;
checkpoint(update?: {
  stage?: string;
  progressCurrent?: number;
  progressTotal?: number;
}): Promise<void>;
```

The executor owns the controller, lease-renew timer, and deadline timer. A
checkpoint and background heartbeat call the same repository fence. The
dispatcher receives this context instead of creating an unfenced long call.
If the signal is aborted, the dispatcher must not commit `completed`.

- [x] **Step 6: Implement independent active slots**

Replace `busy` with `Map<OperationResourceClass, Set<Promise<void>>>`. A tick
loops resource classes, claims until each free-slot count is filled, starts the
attempt promise, and removes it in `finally`. Do not await the long dispatch
inside the claim loop. Keep composite reconciliation under a separate boolean
so it cannot block class claims. Run the bounded deadline sweep before new
claims so queued, waiting-runtime, and running work cannot remain active past
its copied deadline.

- [x] **Step 7: Propagate cancellation into provider calls**

Update the existing trend handler as the first signal consumer and pass
`context.signal` through the trend input port. Add `signal.throwIfAborted()` at
batch boundaries. Other handlers may ignore the signal only if their work is
already short; every new long handler in later tasks must consume it.

- [x] **Step 8: Verify worker safety and server boot**

```bash
rtk npm exec --workspace=apps/server vitest -- run src/operations/application/service/__tests__/operation-run-worker.service.spec.ts src/operations/application/service/__tests__/operation-attempt-executor.service.spec.ts src/operations/application/service/__tests__/browser-operation-runtime.service.spec.ts src/sourcing/adapter/in/operation/__tests__/sourcing-trend.operation-handler.spec.ts
rtk npm run build --workspace=apps/server
rtk npm run dev:server
```

Expected: tests and build pass; terminate the dev server only after the Nest
application reports a successful boot.

- [x] **Step 9: Commit**

```bash
rtk git add apps/server/src/common/operation-definition.ts apps/server/src/operations apps/server/src/sourcing
rtk git commit -m "feat(operations): isolate and fence runtime lanes"
```

## Task 3: Split API, Agent worker, CLI, and MCP application roots

**Phase:** Execution safety and observability

**Depends on:** Task 2 committed and verified on the integration branch

**Files:**

- Create: `apps/server/src/api-application.module.ts`
- Create: `apps/server/src/agent-runtime-application.module.ts`
- Create: `apps/server/src/agent-worker-application.module.ts`
- Create: `apps/server/src/agent-mcp-application.module.ts`
- Delete after all imports move: `apps/server/src/app.module.ts`
- Modify: `apps/server/src/main.ts`
- Modify: `apps/server/src/worker.ts`
- Modify: `apps/server/src/agent-os/adapter/in/cli/run-openai-operator.ts`
- Modify: `apps/server/src/agent-os/adapter/in/mcp/kiditem-agent-os-mcp-server.ts`
- Modify: `apps/server/src/agent-os/agent-os.module.ts`
- Create: `apps/server/src/agent-os/agent-os-http.module.ts`
- Create: `apps/server/src/agent-os/agent-os-worker.module.ts`
- Modify: `apps/server/src/agent-os/application/port/out/runtime/agent-mcp-session.port.ts`
- Create: `apps/server/src/agent-os/application/service/agent-api-capability-grant.service.ts`
- Create: `apps/server/src/agent-os/application/service/__tests__/agent-api-capability-grant.service.spec.ts`
- Modify: `apps/server/src/agent-os/adapter/out/runtime/kiditem-mcp-session.adapter.ts`
- Modify: `apps/server/src/agent-os/adapter/out/runtime/__tests__/kiditem-mcp-session.adapter.spec.ts`
- Create: `apps/server/src/agent-os/adapter/in/http/agent-api-capability-grant.guard.ts`
- Modify: `apps/server/src/agent-os/adapter/in/mcp/__tests__/kiditem-agent-os-mcp-server.spec.ts`
- Create: `apps/server/src/automation/operation-alert-runtime.module.ts`
- Modify: `apps/server/src/automation/automation.module.ts`
- Modify: `apps/server/src/automation/adapter/in/http/operation-alert-lifecycle.controller.ts`
- Modify: `apps/server/src/automation/adapter/in/http/__tests__/operation-alert-lifecycle.controller.spec.ts`
- Modify: `apps/server/src/automation/__tests__/automation.module.wiring.spec.ts`
- Create: `apps/server/src/readiness/readiness-state.module.ts`
- Modify: `apps/server/src/readiness/readiness.module.ts`
- Create: `apps/server/src/sourcing/sourcing-agent-runtime.module.ts`
- Create: `apps/server/src/sourcing/sourcing-agent-api-collection.module.ts`
- Create: `apps/server/src/sourcing/sourcing-agent-mcp-collection.module.ts`
- Modify: `apps/server/src/sourcing/sourcing.module.ts`
- Create: `apps/server/src/sourcing/application/service/sourcing-agent-command.service.ts`
- Modify: `apps/server/src/sourcing/application/service/sourcing.service.ts`
- Modify: `apps/server/src/sourcing/application/port/in/capability/sourcing-agent-workspace-capability.port.ts`
- Modify: `apps/server/src/sourcing/application/service/sourcing-agent-workspace-capability.service.ts`
- Modify: `apps/server/src/sourcing/adapter/in/agent/sourcing-workspace-capability.adapter.ts`
- Create: `apps/server/src/sourcing/adapter/in/agent/sourcing-collection-capability.adapter.ts`
- Create: `apps/server/src/sourcing/adapter/in/agent/__tests__/sourcing-collection-capability.adapter.spec.ts`
- Create: `apps/server/src/sourcing/adapter/in/http/internal-sourcing-collection.controller.ts`
- Create: `apps/server/src/sourcing/adapter/in/http/__tests__/internal-sourcing-collection.controller.spec.ts`
- Create: `apps/server/src/sourcing/adapter/out/http/sourcing-collection-api-command.adapter.ts`
- Create: `apps/server/src/sourcing/adapter/out/http/__tests__/sourcing-collection-api-command.adapter.spec.ts`
- Create: `apps/server/src/supply/supply-agent-runtime.module.ts`
- Modify: `apps/server/src/supply/supply.module.ts`
- Create: `apps/server/src/ai/ai-agent-runtime.module.ts`
- Modify: `apps/server/src/ai/ai.module.ts`
- Create: `apps/server/src/__tests__/application-roots.architecture.spec.ts`
- Modify: `apps/server/src/agent-os/__tests__/agent-os.module.wiring.spec.ts`
- Modify: `apps/server/src/sourcing/__tests__/sourcing.module.wiring.spec.ts`
- Modify: `apps/server/src/supply/__tests__/supply.module.wiring.spec.ts`
- Modify: `apps/server/src/ai/__tests__/ai.module.wiring.spec.ts`
- Modify: `apps/server/src/auth/__tests__/sourcing-extension-route-security.spec.ts`
- Modify: `apps/server/.env.example`
- Modify: `deploy/office/compose.office.yml`
- Modify: `deploy/office/nginx.conf`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/runbooks/deployment-architecture.md`
- Modify: `docs/runbooks/environment-variables.md`

- [ ] **Step 1: Write the application-root architecture RED test**

Recursively walk Nest module metadata, including dynamic-module `.module`
entries. The test must fail until the new roots exist and must detect both
direct and transitive imports:

```ts
import { APP_GUARD } from "@nestjs/core";
import { MODULE_METADATA } from "@nestjs/common/constants";
import { ApiApplicationModule } from "../api-application.module";
import { AgentWorkerApplicationModule } from "../agent-worker-application.module";
import { AgentMcpApplicationModule } from "../agent-mcp-application.module";
import { OperationsModule } from "../operations/operations.module";

type ProviderLike = Function | { provide?: unknown };
type ModuleLike =
  | Function
  | {
      module: Function;
      imports?: ModuleLike[];
      controllers?: Function[];
      providers?: ProviderLike[];
    };

function moduleClass(value: ModuleLike): Function {
  return typeof value === "function" ? value : value.module!;
}

function graph(root: ModuleLike): Set<ModuleLike> {
  const seen = new Set<ModuleLike>();
  const visit = (current: ModuleLike) => {
    if (seen.has(current)) return;
    seen.add(current);
    const type = moduleClass(current);
    const staticImports: ModuleLike[] =
      Reflect.getMetadata(MODULE_METADATA.IMPORTS, type) ?? [];
    const dynamicImports =
      typeof current === "function" ? [] : (current.imports ?? []);
    [...staticImports, ...dynamicImports].forEach(visit);
  };
  visit(root);
  return seen;
}

function controllers(root: ModuleLike): Function[] {
  return [...graph(root)].flatMap((module) => [
    ...(Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, moduleClass(module)) ??
      []),
    ...(typeof module === "function" ? [] : (module.controllers ?? [])),
  ]);
}

function hasGlobalGuard(root: ModuleLike): boolean {
  return [...graph(root)].some((module) => {
    const providers: ProviderLike[] = [
      ...(Reflect.getMetadata(MODULE_METADATA.PROVIDERS, moduleClass(module)) ??
        []),
      ...(typeof module === "function" ? [] : (module.providers ?? [])),
    ];
    return providers.some(
      (provider) =>
        typeof provider === "object" && provider.provide === APP_GUARD,
    );
  });
}

it("gives Operations ownership only to the API root", () => {
  const hasOperations = (root: ModuleLike) =>
    [...graph(root)].some((module) => moduleClass(module) === OperationsModule);
  expect(hasOperations(ApiApplicationModule)).toBe(true);
  expect(hasOperations(AgentWorkerApplicationModule)).toBe(false);
  expect(hasOperations(AgentMcpApplicationModule)).toBe(false);
  expect(controllers(AgentWorkerApplicationModule)).toEqual([]);
  expect(controllers(AgentMcpApplicationModule)).toEqual([]);
  expect(hasGlobalGuard(AgentWorkerApplicationModule)).toBe(false);
  expect(hasGlobalGuard(AgentMcpApplicationModule)).toBe(false);
});
```

Add source assertions that `main.ts` imports `ApiApplicationModule`,
`worker.ts` imports `AgentWorkerApplicationModule`, and both Agent OS CLI/MCP
entrypoints import `AgentMcpApplicationModule`. Assert that no production file
imports `./app.module` after the cutover.

- [ ] **Step 2: Run the root test and capture RED**

```bash
rtk npm exec --workspace=apps/server vitest -- run src/__tests__/application-roots.architecture.spec.ts
```

Expected: FAIL because all four entrypoints still bootstrap `AppModule` and the
new root modules do not exist.

- [ ] **Step 3: Extract controller-free shared runtime modules**

Create `OperationAlertRuntimeModule` with only the alert repository, service,
and owner-side port. `AutomationModule` imports and re-exports it while keeping
all HTTP/panel/workflow controllers in the API graph:

```ts
@Module({
  imports: [PrismaModule],
  providers: [
    OperationAlertRepositoryAdapter,
    OperationAlertService,
    {
      provide: OPERATION_ALERT_REPOSITORY_PORT,
      useExisting: OperationAlertRepositoryAdapter,
    },
    { provide: OPERATION_ALERT_PORT, useExisting: OperationAlertService },
  ],
  exports: [OPERATION_ALERT_PORT],
})
export class OperationAlertRuntimeModule {}
```

Create `ReadinessStateModule` with `ReadinessService`; make
`ReadinessModule` import it and own only `ReadinessController`:

```ts
@Module({
  providers: [ReadinessService],
  exports: [ReadinessService],
})
export class ReadinessStateModule {}

@Module({
  imports: [ReadinessStateModule],
  controllers: [ReadinessController],
  exports: [ReadinessStateModule],
})
export class ReadinessModule {}
```

Remove the moved providers/bindings from their original modules so Nest does
not instantiate duplicate alert/readiness owners. KID-23's latest Automation
baseline keeps Inventory Sellpia and quality-warning producers pointed at the
canonical `/inventory-hub`; this extraction moves only alert runtime ownership
and must not change producer keys, links, lifecycle ordering, or the rule that
an expired Inventory lease is terminal rather than reclaimed.

`OperationAlertLifecycleController` currently injects the concrete service.
Change only its constructor seam to
`@Inject(OPERATION_ALERT_PORT) OperationAlertPort` so
`OperationAlertRuntimeModule` can export the owner-side token without exporting
the concrete class. Update the Automation wiring test to prove the runtime
module owns the repository/service bindings exactly once, `AutomationModule`
imports it and retains the controller, and cross-owner consumers still receive
only `OPERATION_ALERT_PORT`.

- [ ] **Step 4: Split Agent OS core, HTTP, and worker composition**

Keep `AgentOsModule` controller-free. Retain its existing core repository,
runtime, policy, tool, conversation, runner, and port providers, but remove the
seven HTTP controllers, `AgentRunWorker`, and `AgentInlineRunReconciler` from
its metadata. Import `PrismaModule`, `OperationAlertRuntimeModule`, and
`ReadinessStateModule` explicitly.

Create the two wrappers with exact ownership:

```ts
@Module({
  imports: [AgentOsModule],
  controllers: [
    AgentCatalogController,
    AgentRunRequestsController,
    AgentExecutorController,
    AgentRunsQueryController,
    AgentRunObservabilityController,
    AgentApprovalsController,
    AgentConversationsController,
  ],
  providers: [AgentInlineRunReconciler],
})
export class AgentOsHttpModule {}

@Module({
  imports: [AgentOsModule],
  providers: [AgentRunWorker],
  exports: [AgentRunWorker],
})
export class AgentOsWorkerModule {}
```

Update the Agent OS wiring test to assert that `AgentOsModule` has no
controllers or worker, the HTTP wrapper owns the exact controller set, and the
worker wrapper owns only `AgentRunWorker`.

- [ ] **Step 5: Extract the exact owner capabilities needed by Agent execution**

Create controller-free runtime modules instead of importing the full Sourcing,
Supply, or AI HTTP modules from the Agent root:

```ts
@Module({
  imports: [PrismaModule, AgentOsModule, AiAgentRuntimeModule],
  providers: [
    SourcingAgentCommandService,
    SourcingAgentGatewayAdapter,
    SourcingCandidateRepositoryAdapter,
    SourcingPlaywrightRuntimeHandler,
    SourcingScrapeResultService,
    SourcingListingPrepCapabilityAdapter,
    SourcingRuntimeHandler,
    {
      provide: SOURCING_AGENT_GATEWAY_PORT,
      useExisting: SourcingAgentGatewayAdapter,
    },
    {
      provide: SOURCING_CANDIDATE_REPOSITORY_PORT,
      useExisting: SourcingCandidateRepositoryAdapter,
    },
  ],
})
export class SourcingAgentRuntimeModule {}
```

`SourcingAgentCommandService` owns the current `scrapeUrl`,
`registerManualProduct`, and `createProductGeneration` implementations and
depends only on the candidate repository, Agent gateway, and operation-alert
port. `SourcingService` delegates those three methods to it; do not duplicate
candidate writes or generation starts.

Extract only the `sourcing.refreshCollection` handler from
`SourcingWorkspaceCapabilityAdapter` into
`SourcingCollectionCapabilityAdapter`. Remove `refreshCollection()` and the
collection port from `SourcingAgentWorkspaceCapabilityService`; its evidence,
inspection, validation, and review handlers remain unchanged. The extracted
adapter injects `SOURCING_COLLECTION_OPERATION_PORT`, keeps the exact current
input/output schemas, side effects, approval risk, sorted-source idempotency
key, output summary, and `operation_run` artifact contract. This lets the API
and MCP roots bind the same capability to different outbound adapters without
duplicating its policy or result mapping.

`SupplyAgentRuntimeModule` moves the existing `OrderAgentRuntimeHandler`,
`SupplyAgentCapabilityAdapter`, `PurchaseOrderDraftService`,
`PurchaseOrderSubmissionService`, their exact repository/transaction/runtime
adapters, and their port bindings out of `SupplyModule`. `AiAgentRuntimeModule`
moves the existing `ProductGenerationAiService`,
`AiWingRegistrationCapabilityAdapter`, their complete current dependency
providers, and the `PRODUCT_GENERATION_AI_TRIGGER_PORT` binding out of
`AiModule`. The API owner modules import/re-export these runtime modules and
retain their controllers; no provider or binding is declared in both places.

Add module-wiring assertions with these exact invariants:

```ts
expect(controllers(SourcingAgentRuntimeModule)).toEqual([]);
expect(controllers(SupplyAgentRuntimeModule)).toEqual([]);
expect(controllers(AiAgentRuntimeModule)).toEqual([]);
expect(hasOperations(SourcingAgentRuntimeModule)).toBe(false);
expect(hasOperations(SupplyAgentRuntimeModule)).toBe(false);
expect(hasOperations(AiAgentRuntimeModule)).toBe(false);
```

The worker-context test must resolve handlers for `manager`, `sourcing`,
`listing`, and `order`; this prevents the module split from silently replacing
real handlers with `runtime_not_configured`.

- [ ] **Step 6: Write RED tests for the bounded Agent-to-API command**

Add grant-service tests with a fixed clock and secret. The happy path must
return the persisted request actor; forged MAC, expired grant, wrong
organization, wrong request/run/agent tuple, non-running Agent run, and a
capability outside the one-element allowlist must reject:

```ts
const token = service.issue({
  organizationId: ORG_ID,
  requestId: REQUEST_ID,
  runId: AGENT_RUN_ID,
  agentInstanceId: AGENT_ID,
  capabilities: ["sourcing.refreshCollection"],
  now: new Date("2026-08-13T01:00:00.000Z"),
});

await expect(
  service.verifyAndAuthorize({
    token,
    capability: "sourcing.refreshCollection",
    now: new Date("2026-08-13T01:01:59.999Z"),
  }),
).resolves.toMatchObject({
  organizationId: ORG_ID,
  requestId: REQUEST_ID,
  runId: AGENT_RUN_ID,
  requestedByUserId: USER_ID,
});
```

The service mock returns an Agent request with `status: 'claimed'` and a run
with `status: 'running'`, matching organization, request, and agent IDs. Assert
that a secret shorter than 32 decoded bytes fails explicitly and never falls
back to another key.

Add outbound-adapter tests that it sends only strict `{ sources }` to
`${API_SELF_URL}/api/internal/agent-os/sourcing/collection`, uses the bounded
grant as a Bearer token, rejects a non-2xx or malformed response, and never
sends `organizationId`, `requestedByUserId`, or an idempotency key supplied by
the child. Add controller tests proving it derives all three from the verified
principal and sorted sources:

```ts
expect(collections.startCollection).toHaveBeenCalledWith({
  organizationId: ORG_ID,
  requestedByUserId: USER_ID,
  sources: ["1688", "naver"],
  idempotencyKey: `${ORG_ID}:${REQUEST_ID}:sourcing.refreshCollection:1688,naver`,
});
```

Extend the architecture/security tests to require that the API collection
module uses `SourcingCollectionOperationAdapter`, the MCP collection module
uses `SourcingCollectionApiCommandAdapter`, only the API graph contains the
internal controller, neither Agent graph contains Operations, and nginx has an
exact `^~ /api/internal/` 404 rule before `/api/` proxying.

Run:

```bash
rtk npm exec --workspace=apps/server vitest -- run src/agent-os/application/service/__tests__/agent-api-capability-grant.service.spec.ts src/sourcing/adapter/in/agent/__tests__/sourcing-collection-capability.adapter.spec.ts src/sourcing/adapter/in/http/__tests__/internal-sourcing-collection.controller.spec.ts src/sourcing/adapter/out/http/__tests__/sourcing-collection-api-command.adapter.spec.ts src/__tests__/application-roots.architecture.spec.ts src/auth/__tests__/sourcing-extension-route-security.spec.ts
```

Expected: FAIL because the grant service, split collection adapter/modules,
internal endpoint, HTTP adapter, and nginx boundary do not exist.

- [ ] **Step 7: Implement the bounded command without leaking Operations**

Implement `AgentApiCapabilityGrantService` with Node `createHmac`,
`randomUUID`, and `timingSafeEqual`; do not add a JWT dependency. Its token is
`base64url(fixed-order JSON) + "." + base64url(HMAC-SHA-256(payload))`. Parse
the payload with a strict Zod schema, cap it to the exact two-minute TTL, and
verify the MAC before using any claim. `verifyAndAuthorize()` reads both the
Agent request and run through `AGENT_OS_REPOSITORY_PORT` and requires:

```ts
request.organizationId === claims.organizationId;
request.id === claims.requestId;
request.agentInstanceId === claims.agentInstanceId;
request.status === "claimed";
request.latestRunId === claims.runId;
run.organizationId === claims.organizationId;
run.id === claims.runId;
run.requestId === claims.requestId;
run.agentInstanceId === claims.agentInstanceId;
run.status === "running";
run.finishedAt === null;
```

Reject a signature with a different byte length before calling
`timingSafeEqual`; malformed base64url, oversized payloads, future-issued
claims, and TTL values other than exactly 120 seconds are invalid grants.

Export the service from controller-free `AgentOsModule`. Inject it into
`KidItemMcpSessionAdapter`; issue the grant immediately before returning the
descriptor and add only these two fields:

```ts
KIDITEM_AGENT_OS_API_URL: resolvedApiSelfUrl,
KIDITEM_AGENT_OS_API_CAPABILITY_GRANT: boundedGrant,
```

Keep `AGENT_API_CAPABILITY_GRANT_SECRET` out of the descriptor and the Claude/
Codex command env. After the MCP entrypoint loads local dotenv files, delete
that raw secret before `NestFactory.createApplicationContext()`; a test must
observe it as `undefined` at context creation. Missing/invalid secret or API URL
fails the Agent capability explicitly instead of disabling authorization.

Create two collection binding modules; only the API binding owns an HTTP
controller:

```ts
@Module({
  imports: [AgentOsModule, OperationsModule],
  controllers: [InternalSourcingCollectionController],
  providers: [
    AgentApiCapabilityGrantGuard,
    SourcingCollectionCapabilityAdapter,
    SourcingCollectionOperationAdapter,
    {
      provide: SOURCING_COLLECTION_OPERATION_PORT,
      useExisting: SourcingCollectionOperationAdapter,
    },
  ],
})
export class SourcingAgentApiCollectionModule {}

@Module({
  imports: [AgentOsModule],
  providers: [
    SourcingCollectionCapabilityAdapter,
    SourcingCollectionApiCommandAdapter,
    {
      provide: SOURCING_COLLECTION_OPERATION_PORT,
      useExisting: SourcingCollectionApiCommandAdapter,
    },
  ],
})
export class SourcingAgentMcpCollectionModule {}
```

The API module is imported only by `SourcingModule`; the MCP module is imported
only by `AgentMcpApplicationModule`. Mark the internal controller `@SkipAuth()`
only together with a route guard that calls `verifyAndAuthorize()`. Attach the
verified principal to the request, accept a strict unique 1..3 source array,
derive actor/idempotency server-side, and call the direct collection port. Task
5 adds the lifecycle-state assertion centrally in `OperationRunService.start()`;
do not add a second local gate here.

The outbound adapter uses a five-second composed deadline and validates the
response as `{ operationRunId: uuid, status: string }`. Add the nginx 404 rule
before the ordinary API location. Document
`AGENT_API_CAPABILITY_GRANT_SECRET` as required only for Agent OS collection
commands, minimum 32 random bytes, present in the protected API/worker env, and
never exposed to web, model CLI, MCP descriptor, logs, or artifacts.

- [ ] **Step 8: Create the four static application compositions**

Use static imports; no environment flag may select Operations ownership:

```ts
@Module({
  imports: [
    EventEmitterModule.forRoot(),
    PrismaModule,
    AgentOsModule,
    SourcingAgentRuntimeModule,
    SupplyAgentRuntimeModule,
    AiAgentRuntimeModule,
  ],
})
export class AgentRuntimeApplicationModule {}

@Module({ imports: [AgentRuntimeApplicationModule, AgentOsWorkerModule] })
export class AgentWorkerApplicationModule {}

@Module({
  imports: [AgentRuntimeApplicationModule, SourcingAgentMcpCollectionModule],
})
export class AgentMcpApplicationModule {}
```

Move the current `AppModule` metadata and `NestModule.configure()` middleware
implementation into `ApiApplicationModule`; replace `AgentOsModule` in its
root imports with `AgentOsHttpModule` and keep `OperationsModule`. Update
`main.ts`, `worker.ts`, the OpenAI operator CLI, and MCP child bootstrap to use
their exact roots. Delete `app.module.ts` only after
`rtk rg -n 'AppModule|app\.module' apps/server/src` shows no live import.

- [ ] **Step 9: Align Office composition and durable architecture**

Remove `AGENT_RUNTIME_WORKER_ENABLED: "0"` from the API service: the API root
does not contain `AgentRunWorker`. Keep `AGENT_RUNTIME_WORKER_ENABLED: "1"` on
the worker and keep its `node dist/worker.js` command. Add an explicit API
`stop_grace_period: 10s` and set the API health-check `start_period` to `60s`
so the later 30-second fail-closed lifecycle cleanup has room to finish.

Update `docs/ARCHITECTURE.md` and the deployment architecture runbook with this
exact process graph:

```text
main.ts   -> ApiApplicationModule         -> HTTP + domains + Operations
worker.ts -> AgentWorkerApplicationModule -> Agent OS queue/runtime only
MCP/CLI   -> AgentMcpApplicationModule    -> scoped Agent capabilities only
```

Document one API instance and no rolling API overlap. Do not describe an env
flag as the Operations ownership boundary. Patch the current KID-23
architecture baseline in place: retain `/inventory-hub` as the tabless complete
Sellpia workspace and do not restore the retired `/product-hub/options` route
while adding the API/Agent process graph.

- [ ] **Step 10: Verify both process roots and the command bridge**

```bash
rtk npm exec --workspace=apps/server vitest -- run src/__tests__/application-roots.architecture.spec.ts src/agent-os/__tests__/agent-os.module.wiring.spec.ts src/agent-os/application/service/__tests__/agent-api-capability-grant.service.spec.ts src/agent-os/adapter/out/runtime/__tests__/kiditem-mcp-session.adapter.spec.ts src/agent-os/adapter/in/mcp/__tests__/kiditem-agent-os-mcp-server.spec.ts src/automation/__tests__/automation.module.wiring.spec.ts src/automation/__tests__/operation-alert-consumer-boundary.spec.ts src/automation/adapter/in/http/__tests__/operation-alert-lifecycle.controller.spec.ts src/sourcing/__tests__/sourcing.module.wiring.spec.ts src/sourcing/adapter/in/agent/__tests__/sourcing-collection-capability.adapter.spec.ts src/sourcing/adapter/in/http/__tests__/internal-sourcing-collection.controller.spec.ts src/sourcing/adapter/out/http/__tests__/sourcing-collection-api-command.adapter.spec.ts src/supply/__tests__/supply.module.wiring.spec.ts src/ai/__tests__/ai.module.wiring.spec.ts src/auth/__tests__/sourcing-extension-route-security.spec.ts
rtk npm run build --workspace=apps/server
rtk npm run dev:server
rtk env AGENT_RUNTIME_WORKER_ENABLED=0 AGENT_API_CAPABILITY_GRANT_SECRET=0123456789abcdef0123456789abcdef node apps/server/dist/worker.js
```

Expected: the API reports a successful Nest boot; the worker reports a
successful standalone context boot and is then stopped by its exact PID. The
architecture test finds no Operations/controller/global-guard path from the
worker or MCP roots. The bridge tests prove that the child starts exactly one
new idempotent run through API ownership and cannot choose tenant or actor.

- [ ] **Step 11: Commit**

```bash
rtk git add apps/server/src apps/server/.env.example deploy/office/compose.office.yml deploy/office/nginx.conf docs/ARCHITECTURE.md docs/runbooks/deployment-architecture.md docs/runbooks/environment-variables.md
rtk git commit -m "refactor(server): separate API and agent runtime roots"
```

## Task 4: Persist all-domain lifecycle cancellation and schedule skipping

**Phase:** Execution safety and observability

**Depends on:** Task 3 committed and verified on the integration branch

**Files:**

- Modify: `apps/server/src/operations/application/port/out/repository/operation.repository.port.ts`
- Modify: `apps/server/src/operations/adapter/out/repository/operation-execution.repository.ts`
- Modify: `apps/server/src/operations/adapter/out/repository/operation.repository.adapter.ts`
- Modify: `apps/server/src/operations/application/service/operation-schedule-clock.ts`
- Modify: `apps/server/src/operations/adapter/out/repository/__tests__/operation.repository.adapter.spec.ts`
- Modify: `apps/server/src/operations/adapter/out/repository/__tests__/operation-execution.repository.pg.integration.spec.ts`
- Create: `apps/server/src/operations/adapter/out/repository/__tests__/operation-lifecycle.repository.pg.integration.spec.ts`

- [ ] **Step 1: Replace the paused sourcing-only tests with all-domain RED tests**

Keep the useful uncommitted fixtures, but change their contract to all owner
domains and all four lifecycle-active statuses. Add rows at cutoff equality and
one millisecond after it. Assert that startup cancellation changes only the
former group, preserves terminal rows, and mutates exactly these columns:

```ts
expect(cancelled).toMatchObject({
  status: "cancelled",
  errorCode: "operation_server_lifecycle_expired",
  claimedBy: null,
  attemptToken: null,
  claimedAt: null,
  leaseExpiresAt: null,
});
expect(cancelled).toMatchObject({
  attempts: before.attempts,
  startedAt: before.startedAt,
  stage: before.stage,
  progressCurrent: before.progressCurrent,
  progressTotal: before.progressTotal,
  deadlineAt: before.deadlineAt,
  scheduleId: before.scheduleId,
  idempotencyKey: before.idempotencyKey,
  parentRunId: before.parentRunId,
});
```

Add schedule rows for both `skip` and `catch_up_once`; with a cutoff between
occurrences, both must advance to the first occurrence strictly after cutoff,
create no `OperationRun`, and leave `lastScheduledFor` unchanged. Add a locked
matching run and schedule: a zero selected batch must return `remaining: true`
until the lock releases.

- [ ] **Step 2: Run the repository suites and capture RED**

```bash
rtk npm exec --workspace=apps/server vitest -- run src/operations/adapter/out/repository/__tests__/operation.repository.adapter.spec.ts src/operations/adapter/out/repository/__tests__/operation-lifecycle.repository.pg.integration.spec.ts
```

Expected: FAIL because the paused draft is sourcing-only, has no DB cutoff or
schedule boundary method, and still contains worker-owned cancellation names.

- [ ] **Step 3: Define the final repository boundary**

Remove `cancelSourcingRunsForServerLifecycle`,
`cancelClaimedRunForShutdown`, and any queued-restore/attempt-decrement method.
Use this exact port:

```ts
export interface OperationLifecycleBatchResult {
  updated: number;
  remaining: boolean;
}

readLifecycleDatabaseTime(): Promise<Date>;

cancelRunsForLifecycle(input: {
  cutoff: Date | null;
  errorCode:
    | 'operation_server_shutdown'
    | 'operation_server_lifecycle_expired';
  errorMessage: string;
  finishedAt: Date;
  limit: number;
  statementTimeoutMs: number;
}): Promise<OperationLifecycleBatchResult>;

advanceSchedulesPastLifecycleCutoff(input: {
  cutoff: Date;
  limit: number;
  statementTimeoutMs: number;
}): Promise<OperationLifecycleBatchResult>;

cancelClaimedAttemptForLifecycle(input: {
  organizationId: string;
  runId: string;
  expectedAttemptToken: string;
  claimedBy: string;
  errorCode: 'operation_server_shutdown';
  finishedAt: Date;
}): Promise<boolean>;

cancelExpiredWorkerAttempts(input: {
  now: Date;
  limit: number;
}): Promise<number>;
```

`cutoff !== null` means `created_at <= cutoff`; `null` means every current
active/waiting row. `cancelExpiredWorkerAttempts` is same-lifecycle terminal
cleanup using `cancelled/operation_worker_lost`; it never requeues or decrements
an attempt.

- [ ] **Step 4: Implement bounded tagged-SQL lifecycle batches**

Inside one Prisma transaction, set a local PostgreSQL statement timeout with
`set_config`, select at most 100 exact `{id, organization_id}` rows using
`FOR UPDATE SKIP LOCKED`, update only the allowed lifecycle/audit columns, then
run `SELECT EXISTS` for the same predicate. Use bound values throughout; do not
interpolate a table, column, status, or error code dynamically.

The status predicate is exactly:

```sql
status IN ('queued', 'waiting_runtime', 'waiting_dependency', 'running')
```

The update sets `status='cancelled'`, the supplied bounded error code/message,
`finished_at`, clears `claimed_by`, `attempt_token`, `claimed_at`, and
`lease_expires_at`, and sets `updated_at=clock_timestamp()`. It does not touch
`attempts`, `started_at`, progress/stage, deadline, schedule, idempotency,
parent/child, result, or canonical owner rows.

- [ ] **Step 5: Advance lifecycle-missed schedules without dispatch**

Use the same transaction/timeout/batch/`SKIP LOCKED` pattern over enabled rows
with `next_run_at <= cutoff`. Compute `nextOccurrence(cronExpression,
timeZone, cutoff)` for every selected row and exact-update
`{id, organizationId, expectedNextRunAt}`. Both misfire policies use the same
lifecycle behavior. Never call `OperationRunnerPort`, never create a run, and
do not update `lastScheduledFor`.

- [ ] **Step 6: Remove cross-lifecycle reclaim from the claim SQL**

The server claim candidate predicate becomes queued-only:

```sql
status = 'queued'
AND attempts < max_attempts
AND (scheduled_for IS NULL OR scheduled_for <= now)
AND (deadline_at IS NULL OR deadline_at > now)
```

Keep the exact organization/resource-class/attempt-token behavior already
covered by Task 2. Expired `running` rows are terminally cancelled by
`cancelExpiredWorkerAttempts`; no query may select them for another attempt.

- [ ] **Step 7: Verify real PostgreSQL behavior**

```bash
rtk npm exec --workspace=apps/server vitest -- run src/operations/adapter/out/repository/__tests__/operation.repository.adapter.spec.ts src/operations/adapter/out/repository/__tests__/operation-execution.repository.pg.integration.spec.ts src/operations/adapter/out/repository/__tests__/operation-lifecycle.repository.pg.integration.spec.ts
rtk npm run check:idor
rtk npm run check:tenant-scope
```

Expected: all-domain status/cutoff/preservation, lock visibility, exact tenant
fences, schedule skip, queued-only claim, and same-lifecycle lost-lease terminal
cleanup pass against the disposable PostgreSQL test database.

- [ ] **Step 8: Commit**

```bash
rtk git add apps/server/src/operations/application/port/out/repository/operation.repository.port.ts apps/server/src/operations/adapter/out/repository apps/server/src/operations/application/service/operation-schedule-clock.ts
rtk git commit -m "fix(operations): persist lifecycle terminal boundaries"
```

## Task 5: Gate Operations startup, intake, and graceful shutdown

**Phase:** Execution safety and observability

**Depends on:** Task 4 committed and verified on the integration branch

**Files:**

- Create: `apps/server/src/operations/application/service/operation-lifecycle-gate.service.ts`
- Create: `apps/server/src/operations/application/service/operation-server-lifecycle.service.ts`
- Create: `apps/server/src/operations/application/service/__tests__/operation-lifecycle-gate.service.spec.ts`
- Replace: `apps/server/src/operations/application/service/__tests__/operation-server-lifecycle.service.spec.ts`
- Modify: `apps/server/src/operations/application/service/operation-run.service.ts`
- Modify: `apps/server/src/operations/application/service/operation-scheduler.service.ts`
- Modify: `apps/server/src/operations/application/service/operation-run-worker.service.ts`
- Modify: `apps/server/src/operations/application/service/operation-attempt-executor.service.ts`
- Modify: `apps/server/src/operations/application/service/browser-operation-runtime.service.ts`
- Modify: `apps/server/src/operations/application/service/composite-operation-coordinator.service.ts`
- Modify: `apps/server/src/operations/application/port/out/repository/operation.repository.port.ts`
- Modify: `apps/server/src/operations/adapter/out/repository/operation.repository.adapter.ts`
- Modify: `apps/server/src/operations/operations.module.ts`
- Modify: `apps/server/src/operations/application/service/__tests__/operation-run.service.spec.ts`
- Create: `apps/server/src/operations/application/service/__tests__/operation-scheduler.service.spec.ts`
- Modify: `apps/server/src/operations/application/service/__tests__/operation-run-worker.service.spec.ts`
- Modify: `apps/server/src/operations/application/service/__tests__/operation-attempt-executor.service.spec.ts`
- Modify: `apps/server/src/operations/application/service/__tests__/browser-operation-runtime.service.spec.ts`
- Modify: `apps/server/src/operations/application/service/__tests__/composite-operation-coordinator.service.spec.ts`
- Modify: `apps/server/src/sourcing/adapter/in/http/__tests__/internal-sourcing-collection.controller.spec.ts`
- Create: `apps/server/src/operations/__tests__/operation-server-lifecycle.pg.integration.spec.ts`
- Create: `apps/server/src/operations/__tests__/operation-server-lifecycle.bootstrap.spec.ts`

- [ ] **Step 1: Write lifecycle-state and ingress RED tests**

The gate starts in `BOOTSTRAPPING`, opens once, enters `STOPPING`
synchronously, aborts its signal once, and never reopens. Assert that
`assertAccepting()` throws `ServiceUnavailableException` with
`operation_server_lifecycle_unavailable` in every other state.

For each ingress, add a focused test that no repository mutation occurs while
the gate is not accepting:

```ts
for (const state of ["BOOTSTRAPPING", "STOPPING", "STOPPED"] as const) {
  it(`rejects start while ${state}`, async () => {
    gate.state = state;
    await expect(service.start(command)).rejects.toMatchObject({
      response: expect.objectContaining({
        message: "operation_server_lifecycle_unavailable",
      }),
    });
    expect(repository.createRun).not.toHaveBeenCalled();
  });
}
```

Cover user/schedule/Agent-internal-command start, browser retry, server claim,
browser claim, composite child creation, and composite resume. For the signed
Agent command, call through the internal controller with a verified principal
and prove `BOOTSTRAPPING`, `STOPPING`, and `STOPPED` return 503 while
`repository.createRun` remains untouched. Reads and terminal reports stay
available, but a report after cleanup must lose its attempt-token fence.

- [ ] **Step 2: Run the focused suites and capture RED**

```bash
rtk npm exec --workspace=apps/server vitest -- run src/operations/application/service/__tests__/operation-lifecycle-gate.service.spec.ts src/operations/application/service/__tests__/operation-server-lifecycle.service.spec.ts src/operations/application/service/__tests__/operation-run.service.spec.ts src/operations/application/service/__tests__/operation-scheduler.service.spec.ts src/operations/application/service/__tests__/operation-run-worker.service.spec.ts src/operations/application/service/__tests__/browser-operation-runtime.service.spec.ts src/operations/application/service/__tests__/composite-operation-coordinator.service.spec.ts src/sourcing/adapter/in/http/__tests__/internal-sourcing-collection.controller.spec.ts
```

Expected: FAIL because worker/scheduler still self-start in Nest hooks and no
central gate/orchestrator exists.

- [ ] **Step 3: Implement the single in-memory lifecycle gate**

Use one process-local provider; do not add a Prisma lifecycle model or an env
role switch:

```ts
@Injectable()
export class OperationLifecycleGateService {
  private current: OperationServerLifecycleState = "BOOTSTRAPPING";
  private readonly stopping = new AbortController();

  state(): OperationServerLifecycleState {
    return this.current;
  }

  signal(): AbortSignal {
    return this.stopping.signal;
  }

  assertAccepting(): void {
    if (this.current !== "ACCEPTING") {
      throw new ServiceUnavailableException(
        "operation_server_lifecycle_unavailable",
      );
    }
  }

  open(): void {
    if (this.current !== "BOOTSTRAPPING")
      throw new Error("operation_lifecycle_open_invalid");
    this.current = "ACCEPTING";
  }

  beginStopping(): void {
    if (this.current === "STOPPED") return;
    this.current = "STOPPING";
    if (!this.stopping.signal.aborted) {
      this.stopping.abort(new Error("operation_server_shutdown"));
    }
  }

  finishStopping(): void {
    if (this.current !== "STOPPING")
      throw new Error("operation_lifecycle_stop_invalid");
    this.current = "STOPPED";
  }
}
```

- [ ] **Step 4: Make scheduler and worker explicitly owned services**

Remove `OnModuleInit`/`OnModuleDestroy` from both services. Add idempotent
`start()`, synchronous `stopIntake(reason)`, and bounded `drainUntil(deadline)`
methods. Scheduler tracks its current tick promise. Worker tracks claim,
composite, and attempt promises; `stopIntake` clears its interval and aborts
only in-flight claim transactions, while `abortActive` delegates to the attempt
executor after the first DB sweep.

If a claim commits after `STOPPING`, do not dispatch it. Call
`cancelClaimedAttemptForLifecycle` with the exact organization/run/token/worker
fence and `operation_server_shutdown`; preserve its attempt count. A fence miss
is quiet because the all-domain sweep already terminalized the row.

- [ ] **Step 5: Gate every execution ingress**

Inject `OperationLifecycleGateService` into run, scheduler, worker, browser
runtime, and composite services. Call `assertAccepting()` immediately before
each start/retry/claim/create/resume mutation and pass `gate.signal()` into
repository start/claim transactions so shutdown can roll them back before
mutation. Check the signal again immediately before mutation and after the raw
selection while still inside the transaction.

Do not gate list/get/cancel. Do not let a lifecycle-cancelled run use the
attention retry path; a UI retry starts a new run with a new idempotency key.

- [ ] **Step 6: Implement fail-closed startup orchestration**

`OperationServerLifecycleService` is the only Operations provider that
implements Nest lifecycle hooks. Inject fixed production options:

```ts
export const OPERATION_LIFECYCLE_OPTIONS = Symbol(
  "OPERATION_LIFECYCLE_OPTIONS",
);

export const DEFAULT_OPERATION_LIFECYCLE_OPTIONS = {
  batchSize: 100,
  startupTimeoutMs: 30_000,
  shutdownTimeoutMs: 5_000,
} as const;
```

In `onApplicationBootstrap()`:

1. read one cutoff with `readLifecycleDatabaseTime()`;
2. drain `cancelRunsForLifecycle(cutoff, operation_server_lifecycle_expired)`;
3. drain `advanceSchedulesPastLifecycleCutoff(cutoff)`;
4. require `remaining === false` for both within one 30-second deadline;
5. call `gate.open()`, then `scheduler.start()`, then `worker.start()`.

For every batch, pass only the positive remaining milliseconds as the local
statement timeout. A zero-row batch with `remaining=true` loops with a bounded
10 ms yield; it is not success. Any timeout/DB error rejects bootstrap while
the gate remains `BOOTSTRAPPING`, so `app.listen()` never opens.

- [ ] **Step 7: Implement ordered, bounded graceful shutdown**

In `onModuleDestroy()` synchronously call `gate.beginStopping()`,
`scheduler.stopIntake()`, and `worker.stopIntake(reason)` before the first
`await`. Then, under one five-second deadline:

1. drain scheduler/claim transactions;
2. run the first all-domain `operation_server_shutdown` sweep with no cutoff;
3. call `worker.abortActive(reason)` and wait only until the deadline;
4. record but do not hide cleanup failure.

In `beforeApplicationShutdown()` run the final no-cutoff sweep to catch a
boundary commit. Call `gate.finishStopping()` only when both sweeps reached
`remaining=false`. On failure, log
`operation_server_lifecycle_cleanup_failed`, leave the gate in `STOPPING`, and
throw so the process exits without reporting successful cleanup. The next API
boot still performs startup cleanup.

- [ ] **Step 8: Add real bootstrap, lock, and two-boot regressions**

Against disposable PostgreSQL, prove:

- all old statuses/domains and missed schedules are gone before the worker and
  scheduler `start()` spies run;
- a row lock held beyond an overridden 100 ms test startup budget makes
  `app.listen(0)` reject and leaves `httpServer.listening === false`;
- graceful ordering is intake stop → first sweep → abort/drain → final sweep;
- a claim committed at the stop boundary becomes terminal cancelled without
  requeue or attempt decrement;
- a second application context never claims/resumes/requeues a run created by
  the first context;
- the Agent worker root can boot while an `operation_runs` query spy remains at
  zero calls.
- a valid Agent command grant presented during `BOOTSTRAPPING` creates zero
  rows, while the same persisted Agent tuple after `ACCEPTING` creates exactly
  one idempotent run.

- [ ] **Step 9: Verify the lifecycle slice and both roots**

```bash
rtk npm exec --workspace=apps/server vitest -- run src/operations/application/service/__tests__ src/operations/adapter/out/repository/__tests__/operation-lifecycle.repository.pg.integration.spec.ts src/operations/__tests__/operation-server-lifecycle.pg.integration.spec.ts src/operations/__tests__/operation-server-lifecycle.bootstrap.spec.ts src/sourcing/adapter/in/http/__tests__/internal-sourcing-collection.controller.spec.ts src/__tests__/application-roots.architecture.spec.ts
rtk npm run build --workspace=apps/server
rtk npm run check:idor
rtk npm run check:tenant-scope
rtk npm run dev:server
```

Expected: focused/unit/PostgreSQL/architecture tests and build pass; the Nest
API reaches successful startup only after lifecycle cleanup. Stop only the
exact dev-server process tree.

- [ ] **Step 10: Commit and open the single draft PR**

```bash
rtk git add apps/server/src/operations apps/server/src/sourcing/adapter/in/http/__tests__/internal-sourcing-collection.controller.spec.ts
rtk git commit -m "feat(operations): bind runs to API lifecycle"
```

Push the integration branch, open one draft PR to `develop`, read the live PR
body back, and add the first KID-24 phase checkpoint. The PR release note must
say: no lifecycle schema/backfill; the first deployment cancels old
active/waiting runs and skips missed occurrences; cancelled rows remain audit
history; API replicas/rolling overlap are unsupported.

## Task 6: Add bounded API reads and a reusable sourcing run panel

**Phase:** Deadline and snapshot-first reads

**Depends on:** Task 5 committed and verified on the integration branch

**Files:**

- Create: `apps/web/src/lib/request-deadline.ts`
- Create: `apps/web/src/lib/__tests__/request-deadline.spec.ts`
- Modify: `apps/web/src/lib/api-client.ts`
- Modify: `apps/web/src/lib/__tests__/api-client.spec.ts`
- Modify: `apps/web/src/lib/operations-api.ts`
- Modify: `apps/web/src/lib/query-keys.ts`
- Modify: `apps/web/src/hooks/useOperationRun.ts`
- Create: `apps/web/src/app/(sourcing-ai)/sourcing-ai/hooks/use-sourcing-operation-action.ts`
- Create: `apps/web/src/app/(sourcing-ai)/sourcing-ai/hooks/use-sourcing-operation-action.spec.tsx`
- Create: `apps/web/src/app/(sourcing-ai)/sourcing-ai/components/SourcingOperationRunPanel.tsx`
- Create: `apps/web/src/app/(sourcing-ai)/sourcing-ai/components/SourcingOperationRunPanel.spec.tsx`

- [ ] **Step 1: Write failing abort/deadline cleanup tests**

Use fake timers and a fetch promise that never settles:

```ts
it("turns a GET deadline into request_timeout and clears the timer", async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    ),
  );

  const pending = apiClient.get("/api/slow", { timeoutMs: 10 });
  await vi.advanceTimersByTimeAsync(10);
  await expect(pending).rejects.toMatchObject({ code: "request_timeout" });
  expect(vi.getTimerCount()).toBe(0);
});
```

Add a separate test that caller abort remains an `AbortError` and is not wrapped
as `request_timeout`.

- [ ] **Step 2: Confirm the deadline tests fail**

```bash
rtk npm exec --workspace=apps/web vitest -- run src/lib/__tests__/api-client.spec.ts src/lib/__tests__/request-deadline.spec.ts
```

Expected: FAIL because GET accepts no options and no deadline exists.

- [ ] **Step 3: Implement a composed request signal**

Create a helper that returns `{ signal, didTimeout, cleanup }`. It forwards a
caller abort, owns one timer when `timeoutMs` is finite, and removes listeners in
`cleanup()`. Call cleanup in `fetchApi` `finally`, including HTTP errors.

Expose one shared option type:

```ts
export interface ApiRequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number | null;
  suppressNetworkErrorLog?: boolean;
}
```

GET, `getNullable`, and `getParsed` default to 15 seconds. Preserve empty-body
semantics. POST/PUT/PATCH/DELETE change only when a caller passes options.
`operationsApi.start()` passes 10 seconds.

- [ ] **Step 4: Add the route-local sourcing operation hook**

The hook accepts `operationKey`, input, snapshot invalidation key, and optional
idempotency key. It owns only the latest run ID, uses existing shared Operations
hooks, invalidates the snapshot after a successful terminal run, and ignores
terminal notifications from an older run ID.

- [ ] **Step 5: Add the reusable run panel**

Render localized stage labels, elapsed time, `current/total`, cancel, attention
retry, and the three succeeded outcomes. Parse the result before rendering;
invalid result shape shows a bounded generic completion message and logs a
schema error. Keep stale snapshot content outside this panel.

- [ ] **Step 6: Verify and build**

```bash
rtk npm exec --workspace=apps/web vitest -- run src/lib/__tests__/api-client.spec.ts src/lib/__tests__/request-deadline.spec.ts src/app/\(sourcing-ai\)/sourcing-ai/hooks/use-sourcing-operation-action.spec.tsx src/app/\(sourcing-ai\)/sourcing-ai/components/SourcingOperationRunPanel.spec.tsx
rtk npm run build --workspace=apps/web
```

- [ ] **Step 7: Commit**

```bash
rtk git add apps/web/src/lib apps/web/src/hooks/useOperationRun.ts 'apps/web/src/app/(sourcing-ai)/sourcing-ai/hooks' 'apps/web/src/app/(sourcing-ai)/sourcing-ai/components/SourcingOperationRunPanel.tsx' 'apps/web/src/app/(sourcing-ai)/sourcing-ai/components/SourcingOperationRunPanel.spec.tsx'
rtk git commit -m "feat(web): bound sourcing reads and run feedback"
```

## Task 7: Remove route-entry fan-out and collection side effects

**Phase:** Deadline and snapshot-first reads

**Depends on:** Task 6 committed and verified on the integration branch

**Files:**

- Modify: `apps/server/src/advertising/adapter/in/http/wing-tracked-product.controller.ts`
- Modify: `apps/server/src/advertising/adapter/in/http/dto/wing-tracked-product.dto.ts`
- Modify: `apps/server/src/advertising/application/service/wing-tracked-product.service.ts`
- Modify: `apps/server/src/advertising/application/port/out/repository/wing-tracked-product.repository.port.ts`
- Modify: `apps/server/src/advertising/adapter/out/repository/wing-tracked-product.repository.adapter.ts`
- Create: `apps/server/src/advertising/application/service/__tests__/wing-tracked-product.service.spec.ts`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/lib/wing-tracking-api.ts`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/product-tracking/components/ProductTrackingPage.tsx`
- Create: `apps/web/src/app/(sourcing-ai)/sourcing-ai/product-tracking/components/ProductTrackingPage.spec.tsx`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/components/SellochWholesaleKeywordSearch.tsx`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/components/SellochWholesaleCoupangMatches.tsx`
- Create: `apps/web/src/app/(sourcing-ai)/sourcing-ai/components/SellochWholesaleCollection.spec.tsx`

- [ ] **Step 1: Write failing bulk-history service and UI tests**

The service test requires one repository call for all tracked IDs and filters by
the authenticated organization. The page test renders 24 products and asserts
one request to `/history?days=30`, with no `/:id/history` calls.

Add wholesale tests that rendering the page does not call keyword/image search,
and that 24 failed image matches produce a failure summary rather than
`수집 완료 24개`.

- [ ] **Step 2: Confirm the tests fail**

```bash
rtk npm exec --workspace=apps/server vitest -- run src/advertising/application/service/__tests__/wing-tracked-product.service.spec.ts
rtk npm exec --workspace=apps/web vitest -- run src/app/\(sourcing-ai\)/sourcing-ai/product-tracking/components/ProductTrackingPage.spec.tsx src/app/\(sourcing-ai\)/sourcing-ai/components/SellochWholesaleCollection.spec.tsx
```

- [ ] **Step 3: Add the organization-scoped bulk history endpoint**

Declare this static route before parameterized routes:

```ts
@Get('history')
historyBulk(
  @Query() query: WingTrackedHistoryQueryDto,
  @CurrentOrganization() organizationId: string,
) {
  return this.service.getBulkHistory(query.days ?? 30, organizationId);
}
```

The repository performs one bounded query ordered by tracked product and
business date. The service returns `{ items: WingTrackedHistory[] }`; it never
accepts organization or product IDs from the client body.

- [ ] **Step 4: Replace `useQueries` with one query**

Add `fetchWingTrackedHistories(days)`, one query key containing `days`, and a
map by `trackedProductId`. Preserve individual history API support for other
drill-down consumers.

- [ ] **Step 5: Remove mount-triggered collection**

Delete the keyword auto-search effect and image scheduling effect. Keep status
capability checks as reads. Operators use explicit `상위 6개 검색` and
`전체 수집` buttons. Count success and failure separately; all-failed renders a
failure state, mixed results render partial, and zero changed renders no-change.
This task does not yet replace the button's synchronous API; Task 12 does.

- [ ] **Step 6: Verify and commit**

```bash
rtk npm exec --workspace=apps/server vitest -- run src/advertising/application/service/__tests__/wing-tracked-product.service.spec.ts
rtk npm exec --workspace=apps/web vitest -- run src/app/\(sourcing-ai\)/sourcing-ai/product-tracking/components/ProductTrackingPage.spec.tsx src/app/\(sourcing-ai\)/sourcing-ai/components/SellochWholesaleCollection.spec.tsx
rtk npm run build --workspace=apps/web
rtk npm run build --workspace=apps/server
rtk git add apps/server/src/advertising 'apps/web/src/app/(sourcing-ai)/sourcing-ai'
rtk git commit -m "refactor(sourcing): remove route-entry collection fan-out"
```

## Task 8: Add immediate KidItem OS runtime wake and fenced browser abort

**Phase:** Browser operation pilot

**Depends on:** Tasks 1-6 committed and verified on the integration branch

**Files:**

- Modify: `extensions/kiditem-os/background/operation-runtime-client.js`
- Modify: `extensions/kiditem-os/background/external-dispatch.js`
- Modify: `extensions/kiditem-os/background/service-worker.js`
- Modify: `extensions/kiditem-os/background/coupang/collection-runs.js`
- Modify: `extensions/tests/operation-runtime-client.test.mjs`
- Create: `extensions/tests/operation-runtime-wake.test.mjs`
- Modify: `extensions/tests/kiditem-os-service-worker-boot.test.mjs`
- Modify: `apps/web/src/lib/extension-bridge.ts`
- Modify: `apps/web/src/lib/__tests__/extension-bridge.spec.ts`

- [ ] **Step 1: Write failing immediate-ack and heartbeat-fence tests**

The extension test sends `wakeOperationRuntime`, asserts synchronous response
`{ success: true, accepted: true }`, then observes a claim call on the next
microtask. A second test makes heartbeat return 409, asserts the handler's
signal is aborted, its managed session is cancelled, and no success report is
sent.

- [ ] **Step 2: Confirm the extension tests fail**

```bash
rtk node --test extensions/tests/operation-runtime-client.test.mjs extensions/tests/operation-runtime-wake.test.mjs
rtk npm exec --workspace=apps/web vitest -- run src/lib/__tests__/extension-bridge.spec.ts
```

- [ ] **Step 3: Retain and expose the runtime instance**

Wire the service worker as:

```js
const browserOperationRuntime = KidItemOperationRuntimeClient.create({
  chrome,
  environmentContext: browserOperationRuntimeEnvironmentContext,
  domains: KidItemDomains,
});
KidItemExternalDispatch.create({
  chrome,
  environmentContext: sharedEnvironmentContext,
  sessions: collectionSessions,
  domains: KidItemDomains,
  operationRuntime: browserOperationRuntime,
}).install();
browserOperationRuntime.install();
```

Return `wake: resumeOrTick` from the runtime. External dispatch validates the
sender environment, responds immediately, and calls `void wake(environmentId)`.
It never accepts an operation key or payload from the web message.

- [ ] **Step 4: Abort on a lost browser fence**

Give each claim an `AbortController` and pass `signal`, `stage`, and count-aware
heartbeat to the exact handler. Start a local deadline timer from the claimed
`deadlineAt`. A heartbeat 409/fence loss or local deadline aborts the signal,
cancels the local collection session, closes its background-managed tab, and
does not send a stale terminal report. Network unavailability preserves the
existing checkpoint only while the server lease remains plausibly valid.

- [ ] **Step 5: Add the web nudge helper**

`wakeBrowserOperationRuntime()` detects the unified extension, sends only
`{ action: 'wakeOperationRuntime' }`, and uses a three-second timeout. Operation
start callers invoke it best-effort after receiving the server run. Failure to
nudge does not fail the durable run; the 30-second alarm may recover it only
inside the same `ACCEPTING` API lifecycle. After restart, claim returns no old
run because Task 5 has already terminally cancelled it.

- [ ] **Step 6: Verify and commit**

```bash
rtk node --test extensions/tests/operation-runtime-client.test.mjs extensions/tests/operation-runtime-wake.test.mjs
rtk node --test extensions/tests/*.test.mjs extensions/tests/*/*.test.mjs
rtk node --check extensions/kiditem-os/background/operation-runtime-client.js
rtk node --check extensions/kiditem-os/background/external-dispatch.js
rtk node --check extensions/kiditem-os/background/service-worker.js
rtk npm exec --workspace=apps/web vitest -- run src/lib/__tests__/extension-bridge.spec.ts
rtk git add extensions apps/web/src/lib/extension-bridge.ts apps/web/src/lib/__tests__/extension-bridge.spec.ts
rtk git commit -m "feat(extension): wake and fence browser operations"
```

## Task 9: Migrate Wing catalog as the browser-operation pilot

**Phase:** Browser operation pilot

**Depends on:** Task 8 committed and verified on the integration branch

**Files:**

- Create: `packages/shared/src/sourcing/browser-operations.ts`
- Create: `packages/shared/src/sourcing/browser-operations.spec.ts`
- Modify: `packages/shared/src/sourcing/index.ts`
- Modify: `apps/server/src/sourcing/domain/operation/sourcing.operations.ts`
- Create: `apps/server/src/sourcing/adapter/in/operation/sourcing-browser.operation-handler.ts`
- Create: `apps/server/src/sourcing/adapter/in/operation/__tests__/sourcing-browser.operation-handler.spec.ts`
- Create: `apps/server/src/operations/application/port/in/operation-attempt-verifier.port.ts`
- Create: `apps/server/src/operations/application/service/operation-attempt-verifier.service.ts`
- Create: `apps/server/src/operations/application/service/__tests__/operation-attempt-verifier.service.spec.ts`
- Modify: `apps/server/src/operations/operations.module.ts`
- Modify: `apps/server/src/sourcing/adapter/in/http/sourcing-workspace.controller.ts`
- Modify: `apps/server/src/sourcing/adapter/in/http/__tests__/sourcing-workspace.controller.spec.ts`
- Modify: `apps/server/src/sourcing/application/service/sourcing-wing-catalog-ingest.service.ts`
- Modify: `apps/server/src/sourcing/application/service/__tests__/sourcing-wing-catalog-ingest.service.spec.ts`
- Modify: `apps/server/src/sourcing/sourcing.module.ts`
- Modify: `extensions/kiditem-os/background/coupang/worker.js`
- Modify: `extensions/tests/coupang-ads-scraper/wing-catalog-search-request.test.mjs`
- Create: `extensions/tests/coupang-ads-scraper/wing-catalog-operation.test.mjs`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/wing-catalog/components/WingCatalogPage.tsx`
- Create: `apps/web/src/app/(sourcing-ai)/sourcing-ai/wing-catalog/components/WingCatalogPage.operation.spec.tsx`
- Create: `apps/web/src/app/(sourcing-ai)/sourcing-ai/wing-catalog/lib/wing-catalog-api.ts`
- Create: `apps/web/src/app/(sourcing-ai)/sourcing-ai/wing-catalog/lib/wing-catalog-api.spec.ts`

- [ ] **Step 1: Write failing input/result and attempt-verifier tests**

The batch input is strict and bounded:

```ts
const SourcingWingCatalogBatchInputSchema = z
  .object({
    keywords: z.array(z.string().trim().min(1).max(100)).min(1).max(12),
    maxPages: z.number().int().min(1).max(5),
    purpose: z.enum([
      "catalog_search",
      "market_analysis",
      "recommendation_validation",
      "tracked_metrics",
    ]),
  })
  .strict();
```

The verifier test rejects wrong organization, operation key, status, and
attempt token. It returns a small active-attempt context only for the exact
running browser run.

- [ ] **Step 2: Confirm the focused tests fail**

```bash
rtk npm exec vitest -- run packages/shared/src/sourcing/browser-operations.spec.ts
rtk npm exec --workspace=apps/server vitest -- run src/operations/application/service/__tests__/operation-attempt-verifier.service.spec.ts src/sourcing/adapter/in/operation/__tests__/sourcing-browser.operation-handler.spec.ts
```

- [ ] **Step 3: Register the pilot operation**

Use engine `browser`, resource `extension_coupang`, maximum three attempts, and
a 15-minute deadline. The server handler does no browser work; it returns
`waiting_runtime`. Export the Operations attempt verifier port so Sourcing can
validate extension ingest without importing the repository or Prisma.

- [ ] **Step 4: Add fenced ingest and snapshot reads**

Add exact two-segment routes under the existing controller:

```text
POST /api/sourcing/workspace/browser-operations/:runId/coupang-observations
POST /api/sourcing/workspace/browser-operations/:runId/finalize
GET  /api/sourcing/workspace/wing-catalog?keyword=...
```

The two POST routes require `X-Operation-Attempt-Token`, validate the exact
operation and purpose, and derive organization from `@CurrentOrganization()`.
Each keyword batch uses an idempotency key derived from `runId + normalized
keyword`. Ingest does not refresh recommendations per chunk; finalize refreshes
once when the purpose requires it. The GET returns parsed owner data, not the
Operation result or raw arbitrary JSON.

- [ ] **Step 5: Register the exact extension handler**

Add only this operation key to the Coupang domain registry. The handler starts
one local session using `runId`, reuses one managed Wing tab across keywords,
calls the existing catalog search primitive, posts each keyword batch with the
attempt token, reports count progress, calls finalize, then returns the safe
summary. Login/CAPTCHA returns `attention_required`; all failed units return a
failed outcome. Do not add a generic URL or generic action handler.

- [ ] **Step 6: Replace the Wing page's direct extension promise**

The CTA starts the operation, best-effort nudges KidItem OS, renders
`SourcingOperationRunPanel`, and reads persisted catalog rows. Remove component
use of `searchWingCatalogProducts`. Keep the legacy helper because later tasks
still have callers; do not delete it yet.

- [ ] **Step 7: Verify end to end**

```bash
rtk npm exec vitest -- run packages/shared/src/sourcing/browser-operations.spec.ts
rtk npm exec --workspace=apps/server vitest -- run src/operations/application/service/__tests__/operation-attempt-verifier.service.spec.ts src/sourcing/adapter/in/operation/__tests__/sourcing-browser.operation-handler.spec.ts src/sourcing/adapter/in/http/__tests__/sourcing-workspace.controller.spec.ts src/sourcing/application/service/__tests__/sourcing-wing-catalog-ingest.service.spec.ts
rtk node --test extensions/tests/coupang-ads-scraper/wing-catalog-search-request.test.mjs extensions/tests/coupang-ads-scraper/wing-catalog-operation.test.mjs
rtk npm exec --workspace=apps/web vitest -- run src/app/\(sourcing-ai\)/sourcing-ai/wing-catalog/components/WingCatalogPage.operation.spec.tsx
rtk npm run build --workspace=packages/shared
rtk npm run build --workspace=apps/server
rtk npm run build --workspace=apps/web
```

In Chrome, start a one-keyword search, navigate away, return, reload the page,
cancel a run, and exercise login attention. Record the run IDs and terminal
states in the KID-24 phase checkpoint without copying marketplace rows.

- [ ] **Step 8: Commit**

```bash
rtk git add packages/shared apps/server/src/operations apps/server/src/sourcing extensions 'apps/web/src/app/(sourcing-ai)/sourcing-ai/wing-catalog'
rtk git commit -m "feat(sourcing): pilot Wing catalog operations"
```

## Task 10: Move market, recommendations, validation, and tracking onto Wing batches

**Phase:** Long-flow migration

**Depends on:** Tasks 7 and 9 committed and verified on the integration branch

**Files:**

- Modify: `apps/server/src/sourcing/domain/operation/sourcing.operations.ts`
- Modify: `apps/server/src/advertising/domain/operation/advertising.operations.ts`
- Create: `apps/server/src/advertising/adapter/in/operation/advertising-browser.operation-handler.ts`
- Create: `apps/server/src/advertising/adapter/in/operation/__tests__/advertising-browser.operation-handler.spec.ts`
- Modify: `apps/server/src/advertising/advertising.module.ts`
- Modify: `apps/server/src/sourcing/adapter/in/http/sourcing-workspace.controller.ts`
- Modify: `apps/server/src/sourcing/application/service/sourcing-wing-catalog-ingest.service.ts`
- Modify: `apps/server/src/advertising/adapter/in/http/wing-tracked-product.controller.ts`
- Modify: `apps/server/src/advertising/application/service/wing-tracked-product.service.ts`
- Modify: `apps/server/src/advertising/application/port/out/repository/wing-tracked-product.repository.port.ts`
- Modify: `apps/server/src/advertising/adapter/out/repository/wing-tracked-product.repository.adapter.ts`
- Modify: `extensions/kiditem-os/background/coupang/worker.js`
- Modify: `extensions/tests/coupang-ads-scraper/wing-catalog-operation.test.mjs`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/components/SellochMarketAnalysisPage.tsx`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/recommendations/components/TodayRecommendationsPage.tsx`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/components/SellochValidationPage.tsx`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/product-tracking/components/ProductTrackingPage.tsx`
- Create: `apps/web/src/app/(sourcing-ai)/sourcing-ai/components/SellochMarketAnalysisPage.operation.spec.tsx`
- Create: `apps/web/src/app/(sourcing-ai)/sourcing-ai/recommendations/components/TodayRecommendationsPage.operation.spec.tsx`
- Create: `apps/web/src/app/(sourcing-ai)/sourcing-ai/components/SellochValidationPage.operation.spec.tsx`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/product-tracking/components/ProductTrackingPage.spec.tsx`

- [ ] **Step 1: Write tests that forbid client Wing loops**

For each page, mock `operationsApi.start`, render a 12-keyword input, click the
CTA, and assert exactly one operation start with the correct purpose and bounded
keywords. Assert no call to the legacy extension helper. Add a tracking test
that terminal completion invalidates both product and bulk-history keys.

- [ ] **Step 2: Write fenced Ads ingest tests**

Add:

```text
POST /api/ads/wing-tracked-products/browser-operations/:runId/snapshots
```

Test exact organization/run/token verification, idempotent product snapshot
upsert, and rejection of products outside the organization's enabled trackers.

- [ ] **Step 3: Confirm the tests fail**

```bash
rtk npm exec --workspace=apps/server vitest -- run src/advertising/adapter/in/operation/__tests__/advertising-browser.operation-handler.spec.ts src/advertising/application/service/__tests__/wing-tracked-product.service.spec.ts src/sourcing/application/service/__tests__/sourcing-wing-catalog-ingest.service.spec.ts
rtk npm exec --workspace=apps/web vitest -- run src/app/\(sourcing-ai\)/sourcing-ai/components/SellochMarketAnalysisPage.operation.spec.tsx src/app/\(sourcing-ai\)/sourcing-ai/recommendations/components/TodayRecommendationsPage.operation.spec.tsx src/app/\(sourcing-ai\)/sourcing-ai/components/SellochValidationPage.operation.spec.tsx src/app/\(sourcing-ai\)/sourcing-ai/product-tracking/components/ProductTrackingPage.spec.tsx
```

- [ ] **Step 4: Extend the purpose-specific finalization**

Persist every successful keyword through Sourcing. At finalize, market purpose
refreshes the persisted market snapshot, recommendation purpose creates the
existing recommendation run, and validation purpose refreshes the existing
validation episodes exactly once.
For tracked metrics, post only matched tracked products to the fenced Ads sink.
The extension reports per-keyword failures and never returns rows in the run
result.

- [ ] **Step 5: Replace all four React loops**

Delete `cancelRef`, `sleep(700)`, component progress counters, and sequential
`searchWingCatalogProducts` loops. Use the shared operation hook and run panel.
Snapshot data remains visible while a run is active or failed. Validation and
recommendation policy code remains unchanged.

- [ ] **Step 6: Verify and commit**

```bash
rtk npm exec --workspace=apps/server vitest -- run src/advertising/adapter/in/operation/__tests__/advertising-browser.operation-handler.spec.ts src/advertising/application/service/__tests__/wing-tracked-product.service.spec.ts src/sourcing/application/service/__tests__/sourcing-wing-catalog-ingest.service.spec.ts
rtk node --test extensions/tests/coupang-ads-scraper/wing-catalog-operation.test.mjs
rtk npm exec --workspace=apps/web vitest -- run src/app/\(sourcing-ai\)/sourcing-ai/components/SellochMarketAnalysisPage.operation.spec.tsx src/app/\(sourcing-ai\)/sourcing-ai/recommendations/components/TodayRecommendationsPage.operation.spec.tsx src/app/\(sourcing-ai\)/sourcing-ai/components/SellochValidationPage.operation.spec.tsx src/app/\(sourcing-ai\)/sourcing-ai/product-tracking/components/ProductTrackingPage.spec.tsx
rtk npm run build --workspace=apps/server
rtk npm run build --workspace=apps/web
rtk git add apps/server/src/sourcing apps/server/src/advertising extensions 'apps/web/src/app/(sourcing-ai)/sourcing-ai'
rtk git commit -m "feat(sourcing): migrate Wing batch consumers"
```

## Task 11: Migrate keyword suggestions and competitor collection

**Phase:** Long-flow migration

**Depends on:** Tasks 8-9 committed and verified on the integration branch

**Files:**

- Modify: `apps/server/src/sourcing/domain/operation/sourcing.operations.ts`
- Modify: `apps/server/src/advertising/domain/operation/advertising.operations.ts`
- Modify: `apps/server/src/advertising/adapter/in/operation/advertising-browser.operation-handler.ts`
- Modify: `apps/server/src/advertising/adapter/in/operation/__tests__/advertising-browser.operation-handler.spec.ts`
- Modify: `apps/server/src/sourcing/adapter/in/http/dto/sourcing-workspace.dto.ts`
- Modify: `apps/server/src/sourcing/adapter/in/http/sourcing-workspace.controller.ts`
- Modify: `apps/server/src/sourcing/adapter/in/http/__tests__/sourcing-workspace.controller.spec.ts`
- Create: `apps/server/src/sourcing/application/service/sourcing-keyword-suggestion.service.ts`
- Create: `apps/server/src/sourcing/application/service/__tests__/sourcing-keyword-suggestion.service.spec.ts`
- Create: `apps/server/src/sourcing/application/port/out/repository/sourcing-keyword-suggestion.repository.port.ts`
- Create: `apps/server/src/sourcing/adapter/out/repository/sourcing-keyword-suggestion.repository.adapter.ts`
- Create: `apps/server/src/sourcing/adapter/out/repository/__tests__/sourcing-keyword-suggestion.repository.adapter.spec.ts`
- Modify: `apps/server/src/sourcing/sourcing.module.ts`
- Modify: `apps/server/src/advertising/adapter/in/http/advertising-ingest.controller.ts`
- Modify: `apps/server/src/advertising/adapter/in/http/dto/extension-sync.dto.ts`
- Modify: `apps/server/src/advertising/application/service/ad-sync.service.ts`
- Modify: `apps/server/src/advertising/application/service/keyword-rank-ingest.handler.ts`
- Modify: `apps/server/src/advertising/__tests__/keyword-rank-ingest.handler.spec.ts`
- Modify: `apps/server/src/advertising/adapter/in/http/__tests__/advertising.controller.spec.ts`
- Modify: `extensions/kiditem-os/background/coupang/worker.js`
- Create: `extensions/tests/coupang-ads-scraper/coupang-keyword-operation.test.mjs`
- Create: `extensions/tests/coupang-ads-scraper/competitor-collection-operation.test.mjs`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/keywords/components/KeywordAnalysisWorkbench.tsx`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/keywords/lib/coupang-keyword-extension.ts`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/competitor-analysis/hooks/useCompetitorProductTracking.ts`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/competitor-analysis/lib/competitor-extension.ts`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/competitor-analysis/components/CompetitorTrackingPage.tsx`
- Create: `apps/web/src/app/(sourcing-ai)/sourcing-ai/keywords/components/KeywordAnalysisWorkbench.operation.spec.tsx`
- Create: `apps/web/src/app/(sourcing-ai)/sourcing-ai/competitor-analysis/components/CompetitorTrackingPage.operation.spec.tsx`

- [ ] **Step 1: Lock the two operation inputs with failing tests**

Keyword suggestions accept one normalized keyword and maximum 30 results.
Competitor collection accepts either the configured organization watchlist or
one validated seller ID, never a URL. Test trigger allowlists, exact resource
class `extension_coupang`, and 15-minute deadlines.

- [ ] **Step 2: Add owner sinks before changing the UI**

Persist keyword suggestions as controlled Sourcing evidence with source key
`coupang.keyword_suggestion`, exact schema version, and attempt-token fencing.
Read them through a typed snapshot endpoint. Competitor rows continue through
the existing Ads ingest; add operation attempt verification without copying
competitor ownership into Sourcing.

- [ ] **Step 3: Register exact extension handlers**

Wrap the existing keyword and competitor primitives. Reuse local sessions and
progress checkpoints. Do not keep the web response channel open, and do not
register generic marketplace actions.

- [ ] **Step 4: Replace the route-local start/status loops**

The keyword and competitor pages start Operations and read persisted owner
snapshots. Remove extension status polling from React. Capability detection may
remain for installation guidance, but canonical run status comes only from
Operations.

- [ ] **Step 5: Verify and commit**

```bash
rtk npm exec --workspace=apps/server vitest -- run src/sourcing/application/service/__tests__/sourcing-keyword-suggestion.service.spec.ts src/sourcing/adapter/out/repository/__tests__/sourcing-keyword-suggestion.repository.adapter.spec.ts src/sourcing/adapter/in/http/__tests__/sourcing-workspace.controller.spec.ts src/advertising/adapter/in/operation/__tests__/advertising-browser.operation-handler.spec.ts src/advertising/__tests__/keyword-rank-ingest.handler.spec.ts src/advertising/adapter/in/http/__tests__/advertising.controller.spec.ts
rtk node --test extensions/tests/coupang-ads-scraper/coupang-keyword-operation.test.mjs extensions/tests/coupang-ads-scraper/competitor-collection-operation.test.mjs
rtk npm exec --workspace=apps/web vitest -- run src/app/\(sourcing-ai\)/sourcing-ai/keywords/components/KeywordAnalysisWorkbench.operation.spec.tsx src/app/\(sourcing-ai\)/sourcing-ai/competitor-analysis/components/CompetitorTrackingPage.operation.spec.tsx
rtk npm run build --workspace=apps/server
rtk npm run build --workspace=apps/web
rtk git add apps/server/src/sourcing apps/server/src/advertising extensions 'apps/web/src/app/(sourcing-ai)/sourcing-ai/keywords' 'apps/web/src/app/(sourcing-ai)/sourcing-ai/competitor-analysis'
rtk git commit -m "feat(sourcing): migrate keyword and competitor collection"
```

## Task 12: Move 1688 keyword and image work out of HTTP requests

**Phase:** Long-flow migration

**Depends on:** Tasks 2 and 5-7 committed and verified on the integration branch

**Files:**

- Modify: `apps/server/src/sourcing/domain/operation/sourcing.operations.ts`
- Create: `apps/server/src/sourcing/adapter/in/operation/sourcing-1688.operation-handler.ts`
- Create: `apps/server/src/sourcing/adapter/in/operation/__tests__/sourcing-1688.operation-handler.spec.ts`
- Modify: `apps/server/src/sourcing/application/port/out/provider/1688-keyword-search.port.ts`
- Modify: `apps/server/src/sourcing/application/port/out/provider/1688-image-search.port.ts`
- Modify: `apps/server/src/sourcing/adapter/out/1688/direct-1688-keyword-search.adapter.ts`
- Modify: `apps/server/src/sourcing/adapter/out/1688/direct-1688-keyword-search.adapter.spec.ts`
- Modify: `apps/server/src/sourcing/adapter/out/1688/direct-1688-image-search.adapter.ts`
- Modify: `apps/server/src/sourcing/adapter/out/1688/direct-1688-image-search.adapter.spec.ts`
- Modify: `apps/server/src/sourcing/application/service/sourcing-1688-keyword-search.service.ts`
- Modify: `apps/server/src/sourcing/application/service/sourcing-1688-image-search.service.ts`
- Modify: `apps/server/src/sourcing/adapter/in/http/sourcing-1688-keyword-search.controller.ts`
- Modify: `apps/server/src/sourcing/adapter/in/http/sourcing-1688-image-search.controller.ts`
- Create: `apps/server/src/sourcing/adapter/in/http/dto/sourcing-1688-search-result.dto.ts`
- Modify: `apps/server/src/sourcing/adapter/in/http/dto/index.ts`
- Create: `apps/server/src/sourcing/adapter/in/http/sourcing-1688-search-result.controller.ts`
- Create: `apps/server/src/sourcing/adapter/in/http/__tests__/sourcing-1688-search-result.controller.spec.ts`
- Create: `apps/server/src/sourcing/application/service/sourcing-1688-search-result.service.ts`
- Create: `apps/server/src/sourcing/application/service/__tests__/sourcing-1688-search-result.service.spec.ts`
- Create: `apps/server/src/sourcing/application/port/out/repository/sourcing-1688-search-result.repository.port.ts`
- Create: `apps/server/src/sourcing/adapter/out/repository/sourcing-1688-search-result.repository.adapter.ts`
- Create: `apps/server/src/sourcing/adapter/out/repository/__tests__/sourcing-1688-search-result.repository.adapter.spec.ts`
- Modify: `apps/server/src/sourcing/sourcing.module.ts`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/lib/1688-keyword-search-api.ts`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/lib/1688-image-search-api.ts`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/components/SellochWholesaleKeywordSearch.tsx`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/components/SellochWholesaleCoupangMatches.tsx`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/components/SellochWholesaleCollection.spec.tsx`

- [ ] **Step 1: Write failing async-start and cancellation tests**

Controller tests assert POST no longer invokes Playwright services and instead
returns the created `OperationRun`. Handler tests assert
`resourceClass=playwright_1688`, pass `context.signal` to provider ports, update
count progress per target, and stop before the next target after cancellation.

- [ ] **Step 2: Add typed result reads**

Add a bounded read endpoint over the existing authorized typed observations,
keyed by normalized search keyword and optional target identity. It returns the
latest completed records and capture time; it does not read arbitrary raw
snapshot JSON. Image matching passes the existing `match.searchQuery`, so the
same normalized keyword can recover its result after navigation.

- [ ] **Step 3: Register the two server operations**

`sourcing.search_1688_keyword_batch` accepts at most six keywords and
`sourcing.match_wholesale_images` accepts at most 24 canonical target IDs plus
their owner-resolved image/search data. The handler resolves target data on the
server, uses the existing source allowlist/coordinator, and writes each target
before reporting progress. Never accept an arbitrary provider URL from an
operation body.

- [ ] **Step 4: Convert legacy POST routes into operation-start facades**

During one release, preserve the route paths but return `202 + OperationRun` so
deployed web code fails visibly rather than holding a synchronous request. The
new web uses `operationsApi` directly. Keep status GETs until the new UI has
shipped, then remove them in Task 14.

- [ ] **Step 5: Replace wholesale button calls**

The explicit buttons added in Task 7 start one bounded batch operation and read
typed persisted results. Cards no longer own one promise per target. Show
complete, partial, no-change, and all-failed semantics from the run result.

- [ ] **Step 6: Verify and commit**

```bash
rtk npm exec --workspace=apps/server vitest -- run src/sourcing/adapter/in/operation/__tests__/sourcing-1688.operation-handler.spec.ts src/sourcing/application/service/__tests__/sourcing-1688-keyword-search.service.spec.ts src/sourcing/application/service/__tests__/sourcing-1688-image-search.service.spec.ts src/sourcing/application/service/__tests__/sourcing-1688-search-result.service.spec.ts src/sourcing/adapter/in/http/__tests__/sourcing-1688-search-result.controller.spec.ts src/sourcing/adapter/out/repository/__tests__/sourcing-1688-search-result.repository.adapter.spec.ts src/sourcing/adapter/out/1688/direct-1688-keyword-search.adapter.spec.ts src/sourcing/adapter/out/1688/direct-1688-image-search.adapter.spec.ts
rtk npm exec --workspace=apps/web vitest -- run src/app/\(sourcing-ai\)/sourcing-ai/components/SellochWholesaleCollection.spec.tsx
rtk npm run build --workspace=apps/server
rtk npm run build --workspace=apps/web
rtk git add apps/server/src/sourcing 'apps/web/src/app/(sourcing-ai)/sourcing-ai'
rtk git commit -m "feat(sourcing): queue 1688 search batches"
```

## Task 13: Split trend sources by lane and queue rising-product computation

**Phase:** Long-flow migration

**Depends on:** Tasks 1-6 and Task 12 committed and verified on the integration branch

**Files:**

- Modify: `apps/server/src/common/operation-definition.ts`
- Modify: `apps/server/src/operations/application/port/in/composite-operation-coordinator.port.ts`
- Modify: `apps/server/src/operations/application/service/composite-operation-coordinator.service.ts`
- Modify: `apps/server/src/operations/application/service/__tests__/composite-operation-coordinator.service.spec.ts`
- Modify: `apps/server/src/operations/application/service/operation-dispatcher.service.ts`
- Modify: `apps/server/src/sourcing/domain/operation/sourcing.operations.ts`
- Modify: `apps/server/src/sourcing/adapter/in/operation/sourcing-trend.operation-handler.ts`
- Modify: `apps/server/src/sourcing/adapter/in/operation/__tests__/sourcing-trend.operation-handler.spec.ts`
- Modify: `apps/server/src/sourcing/application/port/in/trend-collection.port.ts`
- Modify: `apps/server/src/sourcing/application/service/trend-collect.service.ts`
- Modify: `apps/server/src/sourcing/application/service/__tests__/trend-collect.service.spec.ts`
- Create: `apps/server/src/sourcing/adapter/in/operation/sourcing-rising-product.operation-handler.ts`
- Create: `apps/server/src/sourcing/adapter/in/operation/__tests__/sourcing-rising-product.operation-handler.spec.ts`
- Modify: `apps/server/src/sourcing/adapter/in/http/sourcing-rising-product.controller.ts`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/market/components/TrendCollectionSection.tsx`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/rising-products/lib/rising-products-api.ts`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/rising-products/components/RisingProductsPage.tsx`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/market/components/MarketIntelligencePage.spec.tsx`
- Create: `apps/web/src/app/(sourcing-ai)/sourcing-ai/rising-products/components/RisingProductsPage.spec.tsx`

- [ ] **Step 1: Write failing multi-child composite tests**

Add a distinct result kind:

```ts
| { kind: 'waiting_dependencies'; children: StartChildOperation[] }
```

Require two to 20 unique child keys/idempotency keys. Tests prove the
coordinator creates all children, waits until all are terminal, requeues the
parent once for all-settled aggregation, propagates attention, and cancels every
active child. This parent continuation is permitted only while the lifecycle
gate is `ACCEPTING`; it never crosses an API process boundary. Preserve existing
one-child behavior unchanged.

- [ ] **Step 2: Confirm the composite tests fail**

```bash
rtk npm exec --workspace=apps/server vitest -- run src/operations/application/service/__tests__/composite-operation-coordinator.service.spec.ts
```

- [ ] **Step 3: Register source-specific child operations**

Use these resource classes:

```text
sourcing.collect_naver_trends -> naver_api
sourcing.collect_1688_trends  -> playwright_1688
sourcing.collect_shorts_trends -> default
```

The existing `sourcing.collect_daily_trends` parent returns children on its
first execution. On resume it reads child runs, applies the fixed terminal
rules, and returns one safe source summary. Extract `collectSource()` from
`TrendCollectService`; source code and persistence behavior remain owner-local.

- [ ] **Step 4: Bound Naver internal concurrency**

Replace serial Naver chunk loops with a small `mapWithConcurrency` limit of two,
while preserving output ordering and request caps. 1688 seeds remain serial
inside their one lane. Use `context.signal` and checkpoint at every chunk/seed.

- [ ] **Step 5: Register rising detection as `snapshot_compute`**

`sourcing.detect_rising_products` wraps the existing deterministic service.
The direct `/detect` route becomes a start facade or is removed after the web
cutover; GET latest remains a pure read and `latestOrDetect` is retired because
a read must not silently compute. The page shows the latest snapshot plus the
active run panel.

- [ ] **Step 6: Verify and commit**

```bash
rtk npm exec --workspace=apps/server vitest -- run src/operations/application/service/__tests__/composite-operation-coordinator.service.spec.ts src/sourcing/adapter/in/operation/__tests__/sourcing-trend.operation-handler.spec.ts src/sourcing/application/service/__tests__/trend-collect.service.spec.ts src/sourcing/adapter/in/operation/__tests__/sourcing-rising-product.operation-handler.spec.ts src/sourcing/application/service/__tests__/sourcing-rising-product.service.spec.ts
rtk npm exec --workspace=apps/web vitest -- run src/app/\(sourcing-ai\)/sourcing-ai/market/components/MarketIntelligencePage.spec.tsx src/app/\(sourcing-ai\)/sourcing-ai/rising-products/lib/rising-products-api.spec.ts src/app/\(sourcing-ai\)/sourcing-ai/rising-products/components/RisingProductsPage.spec.tsx
rtk npm run build --workspace=apps/server
rtk npm run build --workspace=apps/web
rtk git add apps/server/src/common/operation-definition.ts apps/server/src/operations apps/server/src/sourcing 'apps/web/src/app/(sourcing-ai)/sourcing-ai/market' 'apps/web/src/app/(sourcing-ai)/sourcing-ai/rising-products'
rtk git commit -m "feat(sourcing): isolate trend and rising workloads"
```

## Task 14: Remove legacy paths, add the static gate, update architecture, and run full QA

**Phase:** Legacy removal and performance gates

**Depends on:** Tasks 1-13 committed and verified on the integration branch

**Files:**

- Create: `apps/web/src/app/(sourcing-ai)/sourcing-ai/wing-catalog/lib/wing-catalog-presenter.ts`
- Create: `apps/web/src/app/(sourcing-ai)/sourcing-ai/wing-catalog/lib/wing-catalog-presenter.spec.ts`
- Delete after caller search is zero: `apps/web/src/app/(sourcing-ai)/sourcing-ai/wing-catalog/lib/wing-catalog-extension.ts`
- Delete after caller search is zero: `apps/web/src/app/(sourcing-ai)/sourcing-ai/wing-catalog/lib/wing-catalog-extension.spec.ts`
- Delete after caller search is zero: `apps/web/src/app/(sourcing-ai)/sourcing-ai/keywords/lib/coupang-keyword-extension.ts`
- Delete after caller search is zero: `apps/web/src/app/(sourcing-ai)/sourcing-ai/keywords/lib/coupang-keyword-extension.spec.ts`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/competitor-analysis/lib/competitor-extension.ts`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/competitor-analysis/lib/competitor-extension.spec.ts`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/lib/1688-keyword-search-api.ts`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/lib/1688-image-search-api.ts`
- Modify: `apps/server/src/sourcing/adapter/in/http/sourcing-1688-keyword-search.controller.ts`
- Modify: `apps/server/src/sourcing/adapter/in/http/sourcing-1688-image-search.controller.ts`
- Create: `scripts/check-sourcing-long-running-actions.mjs`
- Create: `scripts/__tests__/check-sourcing-long-running-actions.test.mjs`
- Modify: `package.json`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/runbooks/deployment-architecture.md`
- Modify: `docs/runbooks/environment-variables.md`
- Create: `docs/runbooks/sourcing-collection-operations.md`
- Modify: `docs/runbooks/README.md`
- Modify: `apps/server/src/operations/AGENTS.md`
- Modify: `apps/server/src/sourcing/AGENTS.md`
- Create: `apps/server/src/advertising/AGENTS.md`
- Modify: `apps/web/src/app/(sourcing-ai)/AGENTS.md`
- Modify: `extensions/kiditem-os/AGENTS.md`

- [ ] **Step 1: Prove all legacy callers are gone**

Run and save the output in the KID-24 final verification checkpoint:

```bash
rtk rg -n 'searchWingCatalogProducts|searchCoupangKeywordSuggestions|runCompetitorCollection|runCompetitorSellerCollection|search1688ByKeyword|search1688ByImage|useQueries\(' 'apps/web/src/app/(sourcing-ai)'
rtk rg -n 'latestOrDetect|@Post\(.detect.\)' apps/server/src/sourcing
```

Expected: no component-owned collection loop, no mount collection call, no
sourcing per-product `useQueries`, and only explicitly approved compatibility
definitions. Stop deletion if any live caller remains.

- [ ] **Step 2: Write the static gate tests**

The script scans sourcing React files and fails on:

- an import/call of retired direct extension helpers;
- `useEffect` bodies containing a collection-start function from the explicit
  forbidden list;
- `useQueries` in product tracking;
- direct 1688 service execution from HTTP controllers;
- `latestOrDetect` read-or-compute behavior.

Extend the application-root architecture gate from Task 3 so production source
also fails on an `AppModule` import, an Operations import reachable from the
worker/MCP root, or either superseded lifecycle identifier
`cancelSourcingRunsForServerLifecycle` / `operation_worker_shutdown`.

Use a fixture directory in the script test to prove one allowed read effect and
one rejected collection effect. Avoid a broad regex that rejects unrelated
React effects.

- [ ] **Step 3: Add the repository command and remove dead code**

Add `check:sourcing-long-running-actions` to root scripts and include it in
`check:conventions`. Delete helpers/endpoints only when both `rg` and the static
gate prove there are no consumers. Keep shared extension primitives that serve
non-sourcing domains.

- [ ] **Step 4: Update durable architecture and operations runbook**

`docs/ARCHITECTURE.md` records:

```text
sourcing screen -> Operations start/read -> owner operation handler
browser handler -> KidItem OS claim -> fenced owner ingest
owner snapshot -> sourcing screen
Operations never owns sourcing or Ads canonical rows
```

The runbook documents resource limits, environment variable validation,
queue/stage/heartbeat inspection, cancellation, attention retry, provider
outage handling, safe result fields, and the exact Chrome regression matrix.
It also documents `BOOTSTRAPPING -> ACCEPTING -> STOPPING -> STOPPED`, startup
codes versus graceful-shutdown codes, the 30-second/5-second bounds, how to
diagnose a fail-closed boot, why a cancelled run is never reactivated, and how
an operator creates a new run after maintenance.

Deployment/environment guidance records one API instance, no rolling overlap,
API-owned Operations, Agent-worker isolation, `OPERATION_RESOURCE_CLASS_LIMITS`,
and the fact that lifecycle time budgets are code-owned rather than env role
switches. Keep Compose and the deployment architecture checks aligned. Preserve
the KID-23 architecture statements that Inventory owns the tabless complete
Sellpia workspace at `/inventory-hub` and that `/product-hub/options` is
retired; KID-24 adds process/run ownership without rewriting those route
decisions.

- [ ] **Step 5: Run full automated verification**

```bash
rtk npm run check:sourcing-long-running-actions
rtk npm run test:scripts
rtk npm run check:conventions
rtk npm run check:agents-hygiene
rtk npm run check:web-db-boundary
rtk npm run check:raw-snapshot-read-models
rtk npm run check:idor
rtk npm run check:tenant-scope
rtk npm exec --workspace=apps/server vitest -- run
rtk npm exec --workspace=apps/web vitest -- run
rtk npm run db:push
rtk npx prisma generate
rtk npm run build --workspace=packages/shared
rtk npm run build --workspace=apps/server
rtk npm run build --workspace=apps/web
rtk npm run db:erd
rtk npm run dev:server
rtk env AGENT_RUNTIME_WORKER_ENABLED=0 node apps/server/dist/worker.js
rtk node --test extensions/tests/*.test.mjs extensions/tests/*/*.test.mjs
rtk node extensions/scripts/sync-collection-session-adapters.mjs --check
rtk node --check extensions/kiditem-os/background/service-worker.js
rtk node -e "JSON.parse(require('fs').readFileSync('extensions/kiditem-os/manifest.json','utf8'))"
rtk docker compose --env-file deploy/office/office.env.example --env-file deploy/office/digest.env.example -f deploy/office/compose.office.yml config --quiet
rtk git diff --check
```

Run `db:push` only against the disposable KID-24 verification database if the
default local database reports unrelated drift; never use
`--accept-data-loss` for this additive change. For both server processes,
capture successful boot and terminate only their exact process trees.

- [ ] **Step 6: Run and record full Chrome QA**

Exercise all 14 routes from the design and every action in the 2026-08-13
baseline. For each route record:

- initial snapshot request count and elapsed time;
- absence of an external collection request on mount;
- start response elapsed time and run ID;
- queue/runtime/running/attention/terminal UI;
- progress counts and elapsed time;
- navigation away/back and reload recovery;
- cancel fencing and retry;
- complete, partial, no-change, and all-failed copy where applicable;
- console errors and duplicate-key warnings.

Acceptance values are design section 8.2. External provider total duration is
evidence, not a pass/fail SLO.

- [ ] **Step 7: Run PR guards against the intended base**

After opening the PR and completing its template fields:

```bash
rtk npm run check:pr-reconstruction -- --base origin/develop --head HEAD
rtk npm run check:pr-release-contract -- --base origin/develop --head HEAD
```

Read the live PR body back and confirm base, head, commit count, and diff scope.

- [ ] **Step 8: Commit**

```bash
rtk git add package.json scripts docs apps extensions packages
rtk git commit -m "refactor(sourcing): enforce operation-backed collection"
```

## Program closeout

After Task 14 merges:

1. Read the single KID-24 PR; confirm the target is `develop`, the commit and
   diff scope match this plan, required checks passed, and every in-scope item
   is complete or explicitly represented by a Linear issue.
2. Add a KID-24 completion comment containing the PR, squash merge SHA,
   automated gates, Chrome QA evidence, and final ownership decisions.
3. Read KID-24 back. Move it to `Done` only when every completion criterion in
   the design is evidenced.
4. Fetch/prune and fast-forward clean managed checkouts. Preserve dirty or
   active worktrees and never delete or classify `release/office` as stale.

## Plan self-review checklist

- [x] Every design acceptance criterion maps to at least one task and test.
- [x] Every long-running route action maps to an exact operation or is explicitly
      classified as a bounded direct read/mutation.
- [x] Canonical sourcing/Ads rows are never stored in Operation result JSON.
- [x] Organization scope comes only from authenticated server context.
- [x] Extension writes require exact run and attempt-token fencing.
- [x] `partial` remains a result outcome rather than an Operation status.
- [x] Provider cancellation reaches a signal/checkpoint and late writes cannot
      publish a successful snapshot.
- [x] One stalled provider cannot occupy another resource class.
- [x] Only the API root can import Operations; Agent worker, CLI, and MCP roots
      are controller-free and cannot reach it transitively.
- [x] Agent OS collection starts cross into API ownership only through the
      bounded grant, active tenant/request/run verification, derived actor and
      idempotency, internal-route deny rule, and central lifecycle gate.
- [x] Startup cancels every old active/waiting run and skips every missed
      schedule before listen; shutdown closes intake before bounded cancellation.
- [x] No lifecycle boundary deletes/requeues/reclaims a run or decrements its
      attempt; operator retry creates a new row.
- [x] Single-API/no-overlap deployment guidance and process-root boot tests are
      included.
- [x] No collection starts from a React mount effect.
- [x] Schema, server boot, web build, extension, reconstruction, release, static,
      and Chrome gates are all present.
