# Operation Automation Legacy Removal Implementation Plan

**Status:** ACTIVE

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the generic Operation/Automation/Workflow/Panel runtime after every surviving business action has a direct owner or capability path.

**Architecture:** A checked-in ownership manifest and read-only Office preflight establish the exact removal set. Surviving domain work uses its existing owner service, source attempt, CapabilityInvocation, or AiDirectJob; unused routes and UI are deleted. Alerts become a polling read model, Rules receives its own request identity, and the final v0.1.31 cutover drops generic execution tables and resets unreliable Alert/ABC state.

**Tech Stack:** NestJS, React/Next.js, Prisma 7/PostgreSQL, Node/Vitest scanners, Chrome extension, Office local deployer

**Spec:** `docs/superpowers/specs/2026-09-03-operation-automation-hard-cutover-design.md`

## Global Constraints

- This is the declared platform-boundary reconstruction exception to the one-domain-per-session rule; unrelated domain cleanup remains excluded.
- A business action is removed only after its owner/capability acceptance test passes, or the ownership manifest names it `DELETE` and operating preflight confirms no required schedule/workflow.
- ActionBoard application code is removed; `ActionTask` table and rows remain dormant and no production code reads or writes them.
- Database Alerts retain only source/rules human notifications. Existing unreliable Operation alerts are reset rather than migrated into a compatibility shape.
- Rules uses a Rules-owned `requestId`; it does not retain an Operation foreign key or invent a replacement execution ledger.
- The global notification UI polls `/api/alerts` every ten seconds and refetches on focus/dismiss. No SSE, replay, backfill, progress, or aggregate panel remains.
- Destructive schema/data commands run only through the explicit `0.1.31` cutover after backup and read-only preflight on the Windows Office host.
- No completion claim is made without NestJS boot, web build, focused PG tests, scanner green, and real browser execution.

---

### Task 1: Record Read-Only Operating Preflight

**Files:**

- Create: `scripts/operation-automation-cutover-preflight.mjs`
- Create: `scripts/__tests__/operation-automation-cutover-preflight.test.mjs`
- Create: `docs/runbooks/operation-automation-cutover.md`
- Modify: `package.json`

**Interfaces:**

- Consumes: an explicit read-only PostgreSQL URL and the deployed/release Office SHAs.
- Produces: sanitized JSON counts and identities needed to authorize the hard cutover; it performs no mutation.

```ts
type CutoverPreflight = Readonly<{
  generatedAt: string;
  deployedSha: string;
  releaseOfficeSha: string;
  counts: {
    operationRuns: number;
    activeOperationRuns: number;
    enabledSchedules: number;
    workflowTemplates: number;
    workflowRuns: number;
    marketplaceItems: number;
    actionTasks: number;
    operationAlerts: number;
    rulesApplications: number;
  };
  activeOperationKeys: readonly string[];
  enabledScheduleKeys: readonly string[];
  installedWorkflowNames: readonly string[];
}>;
```

- [ ] **Step 1: Write failing safety and output tests**

```js
it("uses only SELECT and rejects a writable execution mode", async () => {
  const sql = await buildPreflightSql();
  assert.doesNotMatch(sql, /\b(?:insert|update|delete|alter|drop|truncate)\b/i);
  assert.throws(() => parseArgs(["--apply"]), /read-only/);
});

it("prints counts and bounded names without row payloads or secrets", async () => {
  const report = await runAgainstFixture();
  assert.deepEqual(Object.keys(report.counts), expectedCountKeys);
  assert.equal(JSON.stringify(report).includes("input"), false);
  assert.equal(JSON.stringify(report).includes("result"), false);
});
```

- [ ] **Step 2: Run the script test and verify red**

Run: `node --test scripts/__tests__/operation-automation-cutover-preflight.test.mjs`

Expected: FAIL because the preflight command does not exist.

- [ ] **Step 3: Implement the read-only preflight and runbook**

The command requires `--database-url`, `--deployed-sha`, and `--release-office-sha`; opens a read-only transaction; queries table existence before counts; reports only counts and bounded catalog keys/names; and refuses URLs that do not parse. The runbook executes it from the Windows Office host before writer shutdown and stores output outside Git.

- [ ] **Step 4: Run local fixture tests**

Run: `node --test scripts/__tests__/operation-automation-cutover-preflight.test.mjs`

Expected: PASS and the fixture query log contains SELECT/transaction-control statements only.

- [ ] **Step 5: Run Office preflight when on the Windows host**

```powershell
npm run deploy:office:status
node scripts/operation-automation-cutover-preflight.mjs --database-url "$env:DATABASE_URL" --deployed-sha "$env:KIDITEM_DEPLOYED_SHA" --release-office-sha "$env:KIDITEM_RELEASE_OFFICE_SHA"
```

Expected: the report identifies zero active runs and zero enabled schedules at the agreed writer-stop window. If not, the cutover stops and the named work is completed or cancelled manually before rerunning the same read-only command.

- [ ] **Step 6: Commit preflight tooling**

```bash
git add package.json scripts/operation-automation-cutover-preflight.mjs scripts/__tests__/operation-automation-cutover-preflight.test.mjs docs/runbooks/operation-automation-cutover.md
git commit -m "test: add operation cutover preflight"
```

### Task 2: Give Rules Its Own Direct Request Identity

**Files:**

- Modify: `prisma/models/system.prisma`
- Modify: `apps/server/src/rules/services/types.ts`
- Modify: `apps/server/src/rules/services/rules.service.ts`
- Modify: `apps/server/src/rules/controllers/rule-evaluation.controller.ts`
- Modify: `apps/server/src/rules/rules.module.ts`
- Modify: `apps/server/src/rules/AGENTS.md`
- Modify: `apps/server/src/rules/__tests__/rules.controller.spec.ts`
- Modify: `apps/server/src/rules/__tests__/rules-evaluation.pg.integration.spec.ts`
- Delete: `apps/server/src/rules/adapter/in/operation/rules-evaluation.operation-handler.ts`
- Delete: `apps/server/src/rules/adapter/in/operation/__tests__/rules-evaluation.operation-handler.spec.ts`
- Delete: `apps/server/src/rules/domain/operation/rules.operations.ts`
- Delete: `apps/server/src/rules/adapter/out/automation/operation-alert.adapter.ts`
- Delete: `apps/server/src/rules/application/port/out/cross-domain/operation-alert.port.ts`

**Interfaces:**

- Consumes: authenticated organization/user and an HTTP idempotency key.
- Produces: synchronous `RulesService.evaluateAll({ organizationId, requestedByUserId, idempotencyKey })` with a Rules-owned `requestId` and an idempotent `RulesEvaluationApplication` receipt.

- [ ] **Step 1: Write failing direct Rules tests**

```ts
it("evaluates and applies without creating an OperationRun", async () => {
  const result = await service.evaluateAll({
    organizationId,
    requestedByUserId,
    idempotencyKey,
  });
  expect(result).toMatchObject({
    requestId: expect.any(String),
    status: "completed",
  });
  expect(await prisma.operationRun.count()).toBe(0);
});

it("replays the same Rules request without duplicating alerts or applications", async () => {
  const first = await evaluate(idempotencyKey);
  const second = await evaluate(idempotencyKey);
  expect(second).toEqual(first);
  expect(await countApplications()).toBe(1);
});
```

- [ ] **Step 2: Run Rules tests and verify red**

Run: `npm exec --workspace=apps/server vitest -- run src/rules/__tests__/rules.controller.spec.ts`

Then: `npm run test:integration --workspace=apps/server -- src/rules/__tests__/rules-evaluation.pg.integration.spec.ts`

Expected: FAIL because Rules currently starts and reads an OperationRun.

- [ ] **Step 3: Replace the Operation foreign key**

Rename `RulesEvaluationApplication.operationRunId` to `requestId`, unique by `(organizationId, requestId)`. Derive one stable request ID from the authenticated actor plus idempotency key or create it once in an owner receipt. Execute the existing deterministic evaluation transaction directly, insert Rules Alerts in that transaction, and return the stored result on replay.

- [ ] **Step 4: Remove handler/module dependencies and run Rules tests**

```bash
npm exec --workspace=apps/server vitest -- run src/rules/__tests__/rules.controller.spec.ts
npm run test:integration --workspace=apps/server -- src/rules/__tests__/rules-evaluation.pg.integration.spec.ts
```

Expected: PASS with organization isolation, replay idempotency, and no Operation/Panel/OperationAlert reference.

- [ ] **Step 5: Commit the Rules seam**

```bash
git add prisma/models/system.prisma apps/server/src/rules
git commit -m "refactor: make rules evaluation directly owned"
```

### Task 3: Move Surviving Domain Actions Off Operations

**Files:**

- Modify: `apps/server/src/agent-os/agent-os-invocation.module.ts`
- Modify: `apps/server/src/agent-os/agent-os-runtime-http.module.ts`
- Modify: `apps/server/src/agent-os/agent-os-worker.module.ts`
- Modify: `apps/server/src/agent-os/adapter/in/mcp/kiditem-agent-os-mcp-server.ts`
- Delete: `apps/server/src/agent-os/adapter/out/automation/operation-run-operation-alert.bridge.ts`
- Modify: `apps/server/src/ai/ai.module.ts`
- Modify: `apps/server/src/ai/ai-product-generation-runtime.module.ts`
- Delete: `apps/server/src/ai/adapter/out/automation/operation-alert.adapter.ts`
- Modify: `apps/server/src/channels/channels.module.ts`
- Delete: `apps/server/src/channels/adapter/in/operation/coupang-rocket-purchase-order.operation-handler.ts`
- Delete: `apps/server/src/channels/adapter/in/operation/__tests__/coupang-rocket-purchase-order.operation-handler.spec.ts`
- Delete: `apps/server/src/channels/adapter/out/automation/operation-alert.adapter.ts`
- Modify: `apps/server/src/inventory/inventory.module.ts`
- Modify: `apps/server/src/inventory/inventory-freshness-runtime.module.ts`
- Delete: `apps/server/src/inventory/adapter/in/operation/coupang-shipment-summary.operation-handler.ts`
- Delete: `apps/server/src/inventory/adapter/in/operation/sellpia-inventory.operation-handler.ts`
- Delete: `apps/server/src/inventory/adapter/in/operation/__tests__/coupang-shipment-summary.operation-handler.spec.ts`
- Delete: `apps/server/src/inventory/adapter/in/operation/__tests__/sellpia-inventory.operation-handler.spec.ts`
- Delete: `apps/server/src/inventory/adapter/out/automation/operation-alert.adapter.ts`
- Modify: `apps/server/src/orders/orders.module.ts`
- Delete: `apps/server/src/orders/adapter/in/operation/marketplace-order-collection.operation-handler.ts`
- Delete: `apps/server/src/orders/adapter/in/operation/__tests__/marketplace-order-collection.operation-handler.spec.ts`
- Modify: `apps/server/src/products/products.module.ts`
- Delete: `apps/server/src/products/products-operation-worker.module.ts`
- Delete: `apps/server/src/products/adapter/in/operation/listing-generation.operation-handler.ts`
- Modify: `apps/server/src/products/adapter/in/agent/products-listing-generation-capability.adapter.ts`
- Modify: `apps/server/src/sourcing/sourcing.module.ts`
- Delete: `apps/server/src/sourcing/sourcing-operation-worker.module.ts`
- Delete: `apps/server/src/sourcing/sourcing-shadow-operation.module.ts`
- Delete: `apps/server/src/sourcing/adapter/in/operation/`
- Delete: `apps/server/src/sourcing/adapter/out/operations/`
- Modify: `apps/server/src/sourcing/adapter/in/agent/sourcing-final-capability.adapter.ts`
- Modify: `apps/server/src/sourcing/adapter/in/http/trend-collection.controller.ts`
- Modify: `apps/server/src/advertising/advertising.module.ts`
- Delete: `apps/server/src/advertising/adapter/in/operation/`
- Delete: `apps/server/src/advertising/adapter/out/automation/operation-alert.adapter.ts`
- Modify: `apps/server/src/analytics/traffic/traffic.module.ts`
- Delete: `apps/server/src/analytics/traffic/adapter/out/automation/operation-alert.adapter.ts`

**Interfaces:**

- Consumes: owner services/capabilities that already persist their own result: `CapabilityInvocation`, `AiDirectJob`, source import attempt, purchase-order transmission, listing mutation receipt, and sourcing owner records.
- Produces: the same surviving HTTP/Agent OS business result without OperationRun creation or OperationAlert emission.

- [ ] **Step 1: Add failing no-Operation assertions to existing owner acceptance tests**

```ts
expect(await prisma.operationRun.count()).toBe(0);
expect(await prisma.alert.count({ where: { kind: "operation" } })).toBe(0);
```

Add those observations to the existing PostgreSQL tests for Agent capability invocation, channel registration/deletion, Sellpia inventory, shipment summary, order collection, sourcing Wing/live-commerce/1688 publication, and AI direct generation. Tests must call the public owner HTTP/capability seam, not an Operation handler.

- [ ] **Step 2: Run the affected acceptance tests and verify red**

```bash
npm run test:integration --workspace=apps/server -- src/agent-os/__tests__/capability-invocation-races.pg.integration.spec.ts src/channels/__tests__/product-sync.pg.integration.spec.ts src/inventory/__tests__/sellpia-inventory-import.repository.pg.integration.spec.ts src/orders/__tests__/coupang-direct-order-collection.pg.integration.spec.ts src/sourcing/__tests__/sourcing-wing-browser-publication.pg.integration.spec.ts src/sourcing/__tests__/sourcing-live-commerce-domain-publication.pg.integration.spec.ts src/sourcing/__tests__/sourcing-1688-keyword-domain-fence.pg.integration.spec.ts
```

Expected: FAIL at current Operation starts, handlers, or missing direct owner entrypoints. The listed paths are the existing owner-level PostgreSQL suites on this branch.

- [ ] **Step 3: Route each surviving action directly and delete its wrapper**

Agent OS invokes only deterministic registered capabilities. AI uses `AiDirectJob`. Channels and Supply use their existing owner receipts/transmissions. Inventory, Orders, Advertising, and Sourcing browser collectors begin/read/complete their domain owner attempts. Delete unused operation-only actions by changing their producer disposition to `DELETE` and removing their UI entrypoint in the same slice.

- [ ] **Step 4: Run module and acceptance tests after each domain slice**

```bash
npm exec --workspace=apps/server vitest -- run src/__tests__/application-roots.architecture.spec.ts src/agent-worker-application.module.spec.ts src/advertising/__tests__/advertising.module.wiring.spec.ts src/channels/__tests__/channels.module.wiring.spec.ts src/inventory/__tests__/inventory.module.wiring.spec.ts src/orders/__tests__/orders.module.wiring.spec.ts src/products/__tests__/products.architecture.spec.ts
npm run check:operation-automation-cutover
```

Expected: the scanner's surviving references shrink after every commit; no public owner behavior regresses.

- [ ] **Step 5: Commit bounded domain groups**

```bash
git add apps/server/src/agent-os apps/server/src/ai apps/server/src/channels apps/server/src/inventory apps/server/src/orders apps/server/src/products apps/server/src/sourcing apps/server/src/advertising apps/server/src/analytics/traffic extensions/kiditem-os/background/source-owner-manifest.js
git commit -m "refactor: move domain work off operations"
```

### Task 4: Replace Panel With Alert Polling And Remove Automation UI

**Files:**

- Create: `apps/web/src/components/alerts/AlertsPopover.tsx`
- Create: `apps/web/src/components/alerts/AlertsPopover.spec.tsx`
- Create: `apps/web/src/lib/alerts-api.ts`
- Create: `apps/web/src/lib/__tests__/alerts-api.spec.ts`
- Modify: `apps/web/src/components/layout/AppLayout.tsx`
- Modify: `apps/web/src/components/layout/RightAuxiliaryPanel.tsx`
- Modify: `apps/web/src/components/layout/Sidebar.tsx`
- Modify: `apps/web/src/components/layout/sidebar-menu.ts`
- Modify: `apps/web/src/components/layout/__tests__/AppLayout.auth.spec.tsx`
- Modify: `apps/web/src/components/layout/__tests__/RightAuxiliaryPanel.spec.tsx`
- Modify: `apps/web/src/components/layout/__tests__/Sidebar.right-surface.spec.tsx`
- Delete: `apps/web/src/components/panel/`
- Delete: `apps/web/src/app/(automation)/action-board/`
- Delete: `apps/web/src/app/(automation)/workflows/`
- Delete: `apps/web/src/app/(automation)/marketplace/`
- Delete: `apps/web/src/app/(automation)/_shared/marketplace/`
- Delete: `apps/web/src/lib/operation-alert-actions.ts`
- Delete: `apps/web/src/lib/operation-alert-lifecycle.ts`
- Delete: `apps/web/src/lib/operation-alerts.ts`
- Delete: `apps/web/src/lib/operations-api.ts`
- Delete: `apps/web/src/lib/operation-cancellation.ts`
- Delete: `apps/web/src/lib/manual-operation-actions.ts`
- Delete: `apps/web/src/hooks/useOperationRun.ts`

**Interfaces:**

- Consumes: `GET /api/alerts` and `POST /api/alerts/:id/dismiss`.
- Produces: one alert popover that polls every 10 seconds, refetches on focus, and invalidates after dismiss.

- [ ] **Step 1: Write failing Alert polling tests**

```tsx
it("polls durable alerts, refetches on focus, and dismisses through the Alert API", async () => {
  render(<AlertsPopover />);
  await advanceTimersByTimeAsync(10_000);
  expect(fetchAlerts).toHaveBeenCalledTimes(2);
  window.dispatchEvent(new Event("focus"));
  expect(fetchAlerts).toHaveBeenCalledTimes(3);
  await user.click(screen.getByRole("button", { name: "알림 닫기" }));
  expect(dismissAlert).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run focused web tests and verify red**

Run: `npm exec --workspace=apps/web vitest -- run src/components/alerts/AlertsPopover.spec.tsx src/lib/__tests__/alerts-api.spec.ts src/components/layout/__tests__/RightAuxiliaryPanel.spec.tsx src/components/layout/__tests__/Sidebar.right-surface.spec.tsx`

Expected: FAIL because current UI reads Panel SSE/Operation projections and exposes Automation routes.

- [ ] **Step 3: Implement polling and delete the active Automation surfaces**

Use one TanStack Query with `refetchInterval: 10_000`, `refetchOnWindowFocus: true`, and no background interval. Dismiss invalidates the Alerts key. Remove ActionBoard/Workflow/Marketplace navigation and routes, Panel stores/SSE/recovery, run overlays, promote-to-task commands, and operation hooks.

- [ ] **Step 4: Run web tests and build**

```bash
npm exec --workspace=apps/web vitest -- run src/components/alerts/AlertsPopover.spec.tsx src/lib/__tests__/alerts-api.spec.ts src/components/layout/__tests__/AppLayout.auth.spec.tsx src/components/layout/__tests__/RightAuxiliaryPanel.spec.tsx src/components/layout/__tests__/Sidebar.right-surface.spec.tsx
npm run build --workspace=apps/web
```

Expected: PASS and deleted routes return Next.js 404 in the browser.

- [ ] **Step 5: Commit the web cutover**

```bash
git add apps/web/src/components/alerts apps/web/src/lib/alerts-api.ts apps/web/src/lib/__tests__/alerts-api.spec.ts apps/web/src/components/layout apps/web/src/components/panel 'apps/web/src/app/(automation)' apps/web/src/lib/operation-alert-actions.ts apps/web/src/lib/operation-alert-lifecycle.ts apps/web/src/lib/operation-alerts.ts apps/web/src/lib/operations-api.ts apps/web/src/lib/operation-cancellation.ts apps/web/src/lib/manual-operation-actions.ts apps/web/src/hooks/useOperationRun.ts
git commit -m "refactor: replace panel with durable alerts"
```

### Task 5: Delete Backend Operations And Automation

**Files:**

- Delete: `apps/server/src/operations/`
- Delete: `apps/server/src/operation-cancellation/`
- Delete: `apps/server/src/automation/`
- Create: `apps/server/src/alerts/AGENTS.md`
- Create: `apps/server/src/alerts/CLAUDE.md`
- Modify: `apps/server/src/api-application.module.ts`
- Modify: `apps/server/src/__tests__/application-roots.architecture.spec.ts`
- Delete: `apps/server/src/common/operation-definition.ts`
- Delete: `packages/shared/src/schemas/operations.ts`
- Delete: `packages/shared/src/schemas/operations.spec.ts`
- Delete: `packages/shared/src/operations.ts`
- Delete: `packages/shared/src/operation-lifecycle.ts`
- Delete: `packages/shared/src/schemas/operation-cancellation.ts`
- Delete: `packages/shared/src/schemas/operation-cancellation.spec.ts`
- Delete: `packages/shared/src/operation-cancellation.ts`
- Delete: `packages/shared/src/schemas/workflow.ts`
- Delete: `packages/shared/src/workflow.ts`
- Delete: `packages/shared/src/schemas/marketplace.ts`
- Delete: `packages/shared/src/marketplace.ts`
- Delete: `packages/shared/src/panel/`
- Modify: `packages/shared/package.json`
- Modify: `package.json`

**Interfaces:**

- Consumes: all preceding direct owner/capability and Alerts implementations.
- Produces: application roots and shared exports with zero generic runtime reference.

- [ ] **Step 1: Tighten the cutover scanner to the final zero-reference set**

```js
const forbidden = [
  "OperationRun",
  "OperationSchedule",
  "OPERATION_RUNNER_PORT",
  "/api/operations",
  "/api/panel",
  "/api/workflows",
  "/api/marketplace",
  "OperationAlert",
  "restartCollectionSession",
  "finalizeCollectionSession",
];
```

The scanner searches production server/web/extension/shared sources and root composition files while excluding tests, generated Prisma output, and superseded design history.

- [ ] **Step 2: Run the scanner and verify red**

Run: `npm run check:operation-automation-cutover`

Expected: FAIL with only the generic runtime directories and their root exports/composition.

- [ ] **Step 3: Delete runtime directories and wire Alerts directly**

Remove `AutomationModule`, `OperationsHttpModule`, and `OperationCancellationModule` from `ApiApplicationModule`; import `AlertsModule`. Remove Operations from API/worker roots and environment scripts, including `OPERATION_RUNTIME_WORKER_ENABLED` in `dev:core`. Remove unused shared exports and dependencies.

- [ ] **Step 4: Run scanners, unit suites, and NestJS boot**

```bash
npm run check:operation-automation-cutover
npm run check:conventions
npm run build --workspace=packages/shared
npm exec --workspace=apps/server vitest -- run src/__tests__/application-roots.architecture.spec.ts src/agent-worker-application.module.spec.ts
npm run dev:server
```

Expected: scanner and builds pass; NestJS reaches successful boot with no missing provider/module dependency.

- [ ] **Step 5: Commit backend deletion**

```bash
git add apps/server/src packages/shared/src packages/shared/package.json package.json
git commit -m "refactor: delete operation automation runtime"
```

### Task 6: Apply The v0.1.31 Data And Schema Cutover Contract

**Files:**

- Modify: `prisma/models/core.prisma`
- Modify: `prisma/models/system.prisma`
- Modify: `prisma/models/agents.prisma`
- Create: `scripts/data-migrations/v0.1.31/003_prepare_operation_automation_cutover.ts`
- Create: `scripts/__tests__/operation-automation-cutover-migration.spec.ts`
- Modify: `scripts/data-migrations/index.ts`
- Modify: `scripts/__tests__/run-data-migrations.spec.ts`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/runbooks/operation-automation-cutover.md`
- Modify: `AGENTS.md`
- Modify: `apps/server/AGENTS.md`
- Modify: `apps/server/src/agent-os/AGENTS.md`
- Modify: `apps/server/src/ai/AGENTS.md`
- Modify: `apps/server/src/advertising/AGENTS.md`
- Modify: `apps/server/src/analytics/AGENTS.md`
- Modify: `apps/server/src/channels/AGENTS.md`
- Modify: `apps/server/src/finance/AGENTS.md`
- Modify: `apps/server/src/inventory/AGENTS.md`
- Modify: `apps/server/src/orders/AGENTS.md`
- Modify: `apps/server/src/products/AGENTS.md`
- Modify: `apps/server/src/rules/AGENTS.md`
- Modify: `apps/server/src/sourcing/AGENTS.md`
- Modify: `apps/web/AGENTS.md`
- Modify: `apps/web/src/app/(advertising)/AGENTS.md`
- Modify: `apps/web/src/app/(catalog)/AGENTS.md`
- Modify: `apps/web/src/app/(catalog)/product-hub/AGENTS.md`
- Modify: `apps/web/src/app/(analytics)/AGENTS.md`
- Modify: `apps/web/src/app/(analytics)/dashboard/AGENTS.md`
- Modify: `apps/web/src/app/(automation)/AGENTS.md`
- Modify: `apps/web/src/app/(automation)/agents/AGENTS.md`
- Modify: `extensions/AGENTS.md`
- Modify: `extensions/kiditem-os/AGENTS.md`
- Modify: `extensions/kiditem-os/background/coupang/AGENTS.md`
- Modify: `prisma/AGENTS.md`
- Modify: `scripts/AGENTS.md`

**Interfaces:**

- Consumes: a backed-up, writer-stopped Office database whose preflight has zero active runs and enabled schedules.
- Produces: schema without Operation/Workflow/Marketplace and with dormant ActionTask, focused Alerts, direct Rules identity, source generations, and reset ABC state.

- [ ] **Step 1: Write failing migration/schema tests**

```ts
it("resets unreliable operation alerts and detaches dormant ActionTask rows", async () => {
  await prepareOperationAutomationCutover(prisma);
  expect(await prisma.alert.count()).toBe(0);
  expect(await prisma.actionTask.count()).toBe(seedActionTaskCount);
});

it("contains no generic runtime model or foreign key after schema cutover", () => {
  for (const token of [
    "model OperationRun",
    "model OperationSchedule",
    "model WorkflowRun",
    "model WorkflowTemplate",
    "model Marketplace",
    "operationRunId",
  ]) {
    expect(fullPrismaSchema).not.toContain(token);
  }
});
```

- [ ] **Step 2: Run migration/schema tests and verify red**

Run: `npm run test:scripts`

Expected: FAIL because generic models and the pre-schema preparation migration still exist.

- [ ] **Step 3: Implement pre-schema cleanup and remove models**

The pre-schema migration records counts, deletes existing Alerts and Rules applications, and removes only foreign-key-dependent generic rows. It leaves `ActionTask` rows intact. Prisma then drops OperationRun/Checkpoint/Schedule, WorkflowRun/Template, and Automation Marketplace plus Organization/User relations. Rules has `requestId`; Alert has the focused fields from the source plan.

- [ ] **Step 4: Validate on a disposable clone**

```bash
npm run data:migrate -- up --target local --confirm APPLY_DATA_MIGRATIONS
npm run db:push -- --accept-data-loss
npx prisma generate
npm run build --workspace=packages/shared
npm run test:scripts
npm run db:erd
```

Expected: pre-schema migration, destructive Prisma apply, and post-schema formula initialization all succeed; legacy ABC/Alert/runtime rows are absent and ActionTask count is unchanged.

- [ ] **Step 5: Update ownership documentation and run conventions**

Run: `npm run check:agents-hygiene && npm run check:conventions && npm run check:operation-automation-cutover`

Expected: PASS with no stale instruction that assigns ownership to Operations or Automation.

- [ ] **Step 6: Commit the schema cutover**

```bash
git add prisma/models scripts/data-migrations/v0.1.31/003_prepare_operation_automation_cutover.ts scripts/data-migrations/index.ts scripts/__tests__/operation-automation-cutover-migration.spec.ts scripts/__tests__/run-data-migrations.spec.ts docs/ARCHITECTURE.md docs/runbooks/operation-automation-cutover.md AGENTS.md apps/server/AGENTS.md apps/server/src/agent-os/AGENTS.md apps/server/src/ai/AGENTS.md apps/server/src/advertising/AGENTS.md apps/server/src/analytics/AGENTS.md apps/server/src/channels/AGENTS.md apps/server/src/finance/AGENTS.md apps/server/src/inventory/AGENTS.md apps/server/src/orders/AGENTS.md apps/server/src/products/AGENTS.md apps/server/src/rules/AGENTS.md apps/server/src/sourcing/AGENTS.md apps/web/AGENTS.md 'apps/web/src/app/(advertising)/AGENTS.md' 'apps/web/src/app/(catalog)/AGENTS.md' 'apps/web/src/app/(catalog)/product-hub/AGENTS.md' 'apps/web/src/app/(analytics)/AGENTS.md' 'apps/web/src/app/(analytics)/dashboard/AGENTS.md' 'apps/web/src/app/(automation)/AGENTS.md' 'apps/web/src/app/(automation)/agents/AGENTS.md' extensions/AGENTS.md extensions/kiditem-os/AGENTS.md extensions/kiditem-os/background/coupang/AGENTS.md prisma/AGENTS.md scripts/AGENTS.md
git commit -m "refactor: cut over operation automation schema"
```

### Task 7: Prove Runtime And Browser Behavior

**Files:**

- Modify: `docs/runbooks/product-profitability-refresh.md`
- Modify: PR 493 body through GitHub.
- Modify: Linear KID-33 checkpoint through Linear.

**Interfaces:**

- Consumes: exact topic-branch SHA, disposable operating-data clone, local API/web, and installed extension.
- Produces: measured request, DB, browser, and merge-readiness evidence.

- [ ] **Step 1: Run the complete local gate**

```bash
npm run check:pr-reconstruction -- --base origin/develop
npm run check:pr-release-contract -- --base origin/develop
npm run check:operation-automation-cutover
npm run check:conventions
npm run test:scripts
npm run build --workspace=packages/shared
npm run build --workspace=apps/web
npm run dev:server
```

- [ ] **Step 2: Exercise source failure and recovery in a real browser**

Begin an Advertising or Sellpia attempt, close the initiating page, let the extension finish direct upload, then verify the owner screen reads the COMPLETE generation. Cause one controlled provider failure, verify the prior COMPLETE data remains visible with a stale/failure label and one unread Alert, retry with a new attempt, and verify the Alert becomes RESOLVED.

- [ ] **Step 3: Exercise explicit ABC publication in a real browser**

Open Product Hub with sources READY, record the current publication revision, click `등급 새로고침`, observe one POST, verify `PUBLISHED`, reload, and verify the revision/grades/cutoff remain. Repeat with a stale source and verify `SOURCE_NOT_READY`, no Evaluation/cache/history change, and the last grade remains. Trigger a concurrent input change and verify `409 INPUT_CHANGED` plus refetch without automatic retry.

- [ ] **Step 4: Measure the full baseline on the operating-data clone**

Run `EXPLAIN (ANALYZE, BUFFERS)` for evidence/contribution/publication selection and invoke the full synchronous baseline through the real proxy/browser path. Record product/fact counts, query shape, buffer use, total request duration, and timeout ceiling without storing business rows in Git or Linear.

- [ ] **Step 5: Perform one independent final review and fix confirmed findings**

Review `origin/develop...HEAD` once after all focused tests. Report only new P0/P1 defects and complexity safe to delete. Apply accepted fixes with a fresh red→green focused test and rerun the affected full gate.

- [ ] **Step 6: Update PR and Linear after reading them live**

Record exact commit SHA, commands, browser evidence, DB reset/baseline decision, Office cutover command, and rollback limitation. Read PR 493 and KID-33 back. Mark `병합 준비` only when base is `develop`, checks are green, no blocking conversation remains, and the independent review is clean.
