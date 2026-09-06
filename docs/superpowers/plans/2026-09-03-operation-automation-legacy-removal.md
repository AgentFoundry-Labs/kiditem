# Operation Automation Legacy Removal Implementation Plan

**Status:** ACTIVE

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the generic Operation/Automation/Workflow/Panel runtime after every surviving business action has a direct owner or capability path.

**Architecture:** A checked-in ownership manifest and read-only Office preflight establish the exact removal set. Surviving domain work uses its existing owner service, source attempt, CapabilityInvocation, or AiDirectJob; unused routes and UI are deleted. Alerts become a polling read model, Rules receives its own request identity, and the final v0.1.31 cutover drops generic execution tables and resets unreliable Alert/ABC state.

**Tech Stack:** NestJS, React/Next.js, Prisma 7/PostgreSQL, Node/Vitest scanners, Chrome extension, Office local deployer

**Spec:** `docs/superpowers/specs/2026-09-03-operation-automation-hard-cutover-design.md`

## Global Constraints

- This is the declared platform-boundary reconstruction exception to the one-domain-per-session rule; unrelated domain cleanup remains excluded.
- Use Astra for all implementation and review subagents, with high reasoning
  by default. Simple deletion, import/module wiring, and local changes may use
  medium. Continue to mark
  work protecting invariants across two or more boundaries as `경계 불변식 작업`
  (`boundary-invariant work`), but do not select another model for it.
  After every two feedback-to-fix rounds on the same task, raise reasoning one
  tier (medium → high → xhigh → max). Do not repeat an unchanged review
  merely to trigger escalation.
- The root agent owns integration and tests. Run one Astra/high final review only
  after implementation and focused tests; that review reports only new P0/P1
  findings and deletable complexity through the Ponytail lens.
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

- [x] **Step 1: Write failing safety and output tests**

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

- [x] **Step 2: Run the script test and verify red**

Run: `node --test scripts/__tests__/operation-automation-cutover-preflight.test.mjs`

Expected: FAIL because the preflight command does not exist.

- [x] **Step 3: Implement the read-only preflight and runbook**

The command requires `--database-url`, `--deployed-sha`, and `--release-office-sha`; opens a read-only transaction; queries table existence before counts; reports only counts and bounded catalog keys/names; and refuses URLs that do not parse. The runbook executes it from the Windows Office host before writer shutdown and stores output outside Git.

- [x] **Step 4: Run local fixture tests**

Run: `node --test scripts/__tests__/operation-automation-cutover-preflight.test.mjs`

Expected: PASS and the fixture query log contains SELECT/transaction-control statements only.

- [ ] **Step 5: Run Office preflight when on the Windows host**

```powershell
npm run deploy:office:status
node scripts/operation-automation-cutover-preflight.mjs --database-url "$env:DATABASE_URL" --deployed-sha "$env:KIDITEM_DEPLOYED_SHA" --release-office-sha "$env:KIDITEM_RELEASE_OFFICE_SHA"
```

Expected: the report identifies zero active runs and zero enabled schedules at the agreed writer-stop window. If not, the cutover stops and the named work is completed or cancelled manually before rerunning the same read-only command.

- [x] **Step 6: Commit preflight tooling**

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

- [x] **Step 1: Write failing direct Rules tests**

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

- [x] **Step 2: Run Rules tests and verify red**

Run: `npm exec --workspace=apps/server vitest -- run src/rules/__tests__/rules.controller.spec.ts`

Then: `npm run test:integration --workspace=apps/server -- src/rules/__tests__/rules-evaluation.pg.integration.spec.ts`

Expected: FAIL because Rules currently starts and reads an OperationRun.

- [x] **Step 3: Replace the Operation foreign key**

Rename `RulesEvaluationApplication.operationRunId` to `requestId`, unique by `(organizationId, requestId)`. Derive one stable request ID from the authenticated actor plus idempotency key or create it once in an owner receipt. Execute the existing deterministic evaluation transaction directly, insert Rules Alerts in that transaction, and return the stored result on replay.

- [x] **Step 4: Remove handler/module dependencies and run Rules tests**

```bash
npm exec --workspace=apps/server vitest -- run src/rules/__tests__/rules.controller.spec.ts
npm run test:integration --workspace=apps/server -- src/rules/__tests__/rules-evaluation.pg.integration.spec.ts
```

Expected: PASS with organization isolation, replay idempotency, and no Operation/Panel/OperationAlert reference.

- [x] **Step 5: Commit the Rules seam**

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

**Approved sequencing deviation:** The retained 1688, live-commerce, TikTok,
and Wing Sourcing collectors cannot be moved by renaming their current
Operation routes. Their existing `SourcingEvidenceIngestionRun` lifecycle must
first be hard-reshaped to the three-state source-attempt contract, including
fixed expiry, frozen plan, terminal checksum/current COMPLETE pointer, and
owner-transaction Alert handling. Implement and verify that scoped schema/data
cutover with Astra/high after the Advertising slice and before deleting the
generic backend runtime. Do not add a temporary route, compatibility layer, or
generic source-attempt model.

This is a lifecycle transplant, not a collector rewrite. Preserve each
extension collector's existing URL, target selection and count, region,
pagination, login/block detection, extractor/content script, response mapping,
deduplication, timeout, retry, and failure semantics. A server-frozen plan must
contain the same inputs the collector previously selected at start; it must not
introduce new defaults or limits. Characterization tests prove the old target
plan and normalized output are unchanged for the same inputs before the owner
attempt replaces `OperationRun`, claim, and heartbeat. Keep live-site behavior
marked unverified until browser QA exercises it.

**Sourcing checkpoint (2026-09-05):** Applied the approved Ponytail shrink:
1688, TikTok, and Live share one extension transport/correlation helper,
one Sourcing-local HTTP token/public-response helper, and owner primitives.
Collector plans, extraction, normalization, and terminal interpretation remain
source-specific; no new worker or generic lifecycle was introduced. Removed
the obsolete browser Live Operation controller/service/catalog registration
after its registration regression tests failed, then passed. Taobao remains
in scope and has not been removed.

Focused verification: 45 server tests and 59 extension tests pass, including
wire retries, collector characterization, route wiring, and worker boot. The
cutover scanner still reports 865 legacy references, zero unowned producers,
and zero source-to-ABC references. This is not full acceptance: shared Sourcing
read/write convergence, Wing/server-producer migration, schema/data cutover,
NestJS boot, web build, and actual browser QA remain open. The full server build
fails with 71 type errors, including retained Sourcing callers of removed
interfaces and ABC/Advertising type mismatches. Resolve these as integration
work before boot/merge acceptance. No operating DB was accessed for this
checkpoint; live-site behavior remains unverified.

**Integration checkpoint (2026-09-06):** Source-owner work remains incomplete;
the earlier checkpoint is historical evidence, not the current error count.
Sourcing's URL ingestion and shared Trend callers now use direct owners;
the Sourcing unit gate passes 113 files / 654 tests. Inventory shipment summary
now uses a frozen attempt, immutable date observations, one atomic terminal
and Alert transaction, and separate capture/calendar reads. Existing untagged
dates remain unverified. Its HTTP/PostgreSQL gate passes 7 tests; integrated
extension, web, and Inventory module/service gates pass 82, 23, and 13 tests.
The actual provider site is still unverified.

Ponytail checks removed unmounted Advertising UI, the orphan page-owned
Sellpia snapshot bridge, unused Orders Operation wrappers, and the uncalled
application-wide cancellation endpoint. Direct AI cancellation stays intact;
its six focused suites pass, and integrated application-root tests pass 8.
These deletions do not count as completion of the remaining live collectors.
Local commits include `7ecc172`, `3fb713a77`, and `9c597fb54`; nothing was deployed.

The current scanner reports 741 legacy references, zero unowned producers, and
zero source-to-ABC references. Server build still fails on 3 retired Automation
session exports; the latest web build fails on 9 retained browser-session
imports. Do not restore compatibility exports to hide these gaps. Conventions
still stops at schema/ERD drift while the schema cutover remains in flight.

Resolve the documented live-collector conflicts before changing their policy:
catalog chunks currently mutate canonical data before finalization; Advertising
keyword completion can report partial coverage; physical Sellpia stock's old
`full` action includes a different profit window; Shadow admission retains a
daily paid-IO limit. Preserve collector inputs and output meaning until the
necessary decision is explicit. Orders artifact-only and canonical ingestion
branches also remain separate responsibilities, not a new generic runtime.
Operating preflight/clone approval, remaining owner migrations, final schema
cutover, successful boot/build, browser QA, and the one final Astra review are
still open. No operating database or clone was accessed for this checkpoint.

**Rocket PO checkpoint (2026-09-06):** Channels now owns the frozen one-shot
Rocket attempt and atomic terminal/snapshot/Alert transaction. The extension
keeps its existing URL, full pagination, normalized rows, detail concurrency,
login retry and timeout; only the execution envelope changes. Confirmation,
Orders and Dashboard read owner state independently of row count and preview
an exact COMPLETE source. A later failed attempt retains the previous COMPLETE;
empty COMPLETE replaces current rows. Preview failure cannot fail the source.
Removed only the uncalled `listRocketPos` action, not the live full PO collector.

Stable Ponytail review removed snapshot-reuse and multi-snapshot branches that
cannot occur after one-shot fencing, the identity passthrough, and unused
preview injection. Owner PostgreSQL25 and existing workbook PostgreSQL10 pass;
server units64, shared26, web62 and integrated extension74 pass. Main reran the
affected web31 after shrinking its API and aligning the test mock boundary.
The 4,000-product fixture is 2,332,981 bytes: measured terminal2,219ms and exact
reload118ms after replacing a pathological nested join with two bounded identity
reads. These timings are disposable-PG observations, not an operating SLA.

The compact scanner remains red at740 legacy references, with zero unowned
producers and source-to-ABC calls. Fresh server/web builds retain the same3/9
generic-session errors. The full extension suite has5 failures in unchanged
Orders lifecycle/Sellpia legacy-contract tests; focused Rocket tests do not
substitute for that open gate. Old Rocket facts/workbook references still need
the coordinated Task6 preflight and cutover; no compatibility read, synthetic
COMPLETE backfill, operating access, provider QA or independent deployment was
performed. Task3 and the overall plan remain incomplete.

**Rank owner checkpoint (2026-09-06):** Immutable SERP/Wing capture and
per-keyword COMPLETE publication are implemented, including the three serving
read models' source provenance. Readiness now applies the same-org COMPLETE
Wing source/parser fence to its existing date/coverage/count queries while
retaining the selected active-account scope and freshness policy. Source
admission/read HTTP+PostgreSQL38, Readiness HTTP+PostgreSQL4 and existing
Readiness16 tests passed against disposable databases.

Frozen batch admission adds no parent runtime/table: the first actual keyword
attempt stores immutable ordered member IDs (and Wing selection metadata).
Same-key replay preserves members after failures/configuration drift; individual
keyword publication remains independent. Original enabled SERP selection and
Wing pending-today-or-all policy remain unchanged. All members are admitted in
one source-locked transaction with queue-aware fixed expiries (SERP10min plus
index×(10min+8s), Wing25min plus index×(25min+2.5s)); no heartbeat, renewal or
invented target cap. Empty selection is a nonpersisted no-op, not COMPLETE.

The extension's Wing direct transport and batch dispatch reuse its original
collector, pacing and normalized output. Actual full-worker tests passed44
cases, with shared progress-schema/cancellation regression8 passing after the
producer was restored to the existing `advertising.wing_rank` contract.
Dispatch ACK is not completion; the current unconfirmed terminal is never
contradicted by a failure submission, and unstarted interrupted members are
failed through their owners. The rank screen and Readiness entrypoint now
admit/dispatch the frozen batch and read owner results; the rank URL retains
only its receipt key for reload, cancellation and attention-tab recovery.
Dispatch/cancel ACKs do not become terminal state. Web focused gates passed
50 rank/API tests and12 selected Wing Readiness tests. One duplicated source-
text assertion was removed after Ponytail review; the actual hook8 passed
again. The complete legacy Readiness suite still has10 failures, and the fresh
web build still fails on8 retired generic-session exports in other consumers.
No whole-web success is claimed. Commits55d00de,71f0df9,2d00219 and6e6321cf5
record these bounded server, extension and web slices.
SERP seller enrichment, old rank runtime deletion,
actual unpacked/provider browser QA, aggregate boot/build and Task6 cutover
remain open. These focused results do not complete Task3 or the plan.

**Remaining source boundaries (approval is source-specific):**

- **Catalog:** On 2026-09-06 the user approved
  private staging followed by one measured full-publication transaction, not
  generation-aware catalog/media reads. Remove chunk publication and prove
  rollback/visibility through owner HTTP and public catalog reads on disposable
  PostgreSQL. Complete the same owner's token/expiry/replay and terminal/Alert
  fencing without changing collector inputs or outputs. Measure statement count
  and elapsed time; operating-clone access remains separately approval-gated.
- **Advertising keyword:** the existing 300-ad/10-minute invocation budget and
  partial cursor do not prove the full roster. A continued attempt needs frozen
  account/date/roster and receipt-backed coverage; a capped or failed enumeration
  must not be certified COMPLETE. Keep current collection limits and require a
  scope/continuation decision before changing capture meaning.
- **Physical Sellpia:** reconnect the actual stock collector, not the already
  migrated profitability action. Its legacy `full` scope includes a different
  profit window; settle that scope and immutable stock-artifact storage before
  replacing the live lease/import paths. Do not reinstate Operation dispatch.
- **Shadow:** the current daily admission blocks further paid IO even after
  failure. Explicit retry cannot silently become unlimited same-day paid IO.
  Preserve provider/evaluation behavior while deciding that admission contract.
- **Orders:** ordinary malls generate files kept in IndexedDB; only Coupang
  directship also ingests canonical Orders. Define owner-durable export storage
  and authenticated replay without turning other mall exports into Order writes.
  Art09 converts in the browser. Kakao calls a converter absent from both this
  checkout and its local `origin/release/office` controller/service; a new field
  mapping cannot be invented as a transplant. Live-host behavior is unverified.
- **Rank:** preserve successful per-keyword publication and Wing's existing
  pending-today selection. The three daily rank tables are mutable serving data;
  distinguish immutable capture from that projection, or make typed rows
  generation-scoped before changing reads. Include the direct Readiness reader
  and seller-identity enrichment: accepted seller catalog publication and the
  still-unfenced identity path both mutate SERP JSON after rank collection.
  Do not freeze enrichment targets before the new SERPs that currently select
  them, delete enrichment, or add aggregate batch/child workflow state.

These findings name remaining implementation and product decisions; they are
not a new collection policy, extra worker, permission to access operating data,
or proof that a retained source is complete. Existing collector inputs and
outputs remain the characterization authority until a conflict is resolved.

**Seller-identity implementation decision (2026-09-06):** Use one Advertising
snapshot attempt for the existing post-SERP days30/limit200 target selection,
not a durable attempt per product. The collector still visits/deduplicates the
same targets, retries extraction as before, and returns the same successful
identity rows. Its existing null result cannot prove normal absence: a missing
seller anchor and a failed/blocked page are indistinguishable. Do not add a new
extractor or fabricate empty evidence. The owner publishes only when all
eligible frozen target identities are present; otherwise it records FAILED /
`IDENTITY_EVIDENCE_INCOMPLETE`, retaining previous COMPLETE data. This is the
approved new source-publication policy, not a collector-policy rewrite.
Server-selected zero targets may complete as an explicitly empty source;
invalid target URLs are excluded with counts rather than visited.

The fixed expiry is5 minutes plus1 minute per unique eligible product, covering
the existing45-second navigation, up to two1.2-second render waits and at most
1.5-second inter-product delay with headroom. No heartbeat or collector timeout
change is introduced. Reuse SourceImportRun and ChannelScrapeSnapshot for
immutable capture and the existing enrichment/keyword transaction locks for
serving updates plus terminal/Alert atomicity. Existing optional enrichment
remains independent of already-published per-keyword SERP results. Conservative
failure for a legitimately absent seller identity remains an explicit limitation
until actual provider evidence can establish a reliable absence predicate.

The retained optional post-SERP sequence stays initial seller catalogs → seller
identities → newly identified seller catalogs. Each phase is a direct source
owner call, not a persisted parent/child workflow. Catalog `target: rank_enrichment` may
reference `excludeCompletedAttemptId`: the owner excludes only the exact same-
organization COMPLETE rank-enrichment catalog receipt's frozen seller IDs from the original
days30/top20 selection, then freezes the remainder. Failed or uncertain earlier
publication stops later enrichment without rolling back completed keyword SERPs.
Keys identify these direct calls and do not become a second status authority.
Preserve the two existing bounds: standalone all/seller_id catalogs retain100
products, while the original SERP enrichment retains500. The shared envelope may
accept500, but the owner validates the concrete frozen input's original bound.
No new collector limit, selector, partial-success proof or retry policy is added.

**SERP transport integration checkpoint (2026-09-06):** The direct SERP batch
now uses the same small rank-local transport as Wing, without a new batch table,
worker or parent workflow. Existing keyword capture and4–8s pacing precede the
three direct enrichment owner calls above. A failed/unconfirmed enrichment or
explicit cancellation stops subsequent phases; cancellation arriving during
admission settles the exact newly admitted owner before provider IO. Original
collector functions remain unchanged (9 retained functions have matching hashes
against the preceding catalog-integration commit).

Removed the old single/batch SERP execution shell, its alarm, local terminal
status and unfenced rank/identity/catalog posting helpers. The server rejects
their old extension-sync types while keeping other live sync types and the
owner-only normalizers. Catalog capture preserves standalone100 versus rank500,
including their original nullable-field mapping. Terminal retries keep the exact
payload; missing ACK or a newer attempt in the response triggers an exact-owner
read, never a fabricated COMPLETE or contradictory automatic failure. A focused
regression also corrected the inherited same-URL navigation-completion wait and
the catalog owner's tab-ID registration, without changing navigation targets,
timeouts or extraction.

Evidence: integrated extension8 suites/121 tests, server ingress/owner focused62,
catalog HTTP/PostgreSQL5, shared14 and shared build passed. Extension syntax,
adapter-copy and diff checks passed. The broader server build still fails on
3 retired Automation session exports; scanner remains709 legacy references,
zero unowned producers and zero source-to-ABC references. No full web/boot,
provider/browser QA, operating DB access or final independent review is claimed.
The remaining source-boundary decisions above still block generic runtime and
schema cutover completion; these results do not complete Task3 or the plan.

**Wing catalog publication checkpoint (2026-09-06):** Detail uploads now stay
private; the final transaction validates the exact staged receipt set and
publishes listings/options/media, absence, mapping generation and the receipt
atomically. Same-attempt replay is unchanged; new A → B → A captures publish
again. Lost final ACK is reconciled against the exact owner receipt. The screen
shows hydration progress and invalidates canonical reads once after completion.

The existing AI media adapter now batches writes in500-row groups in that same
transaction, preserving provider asset identity and manual thumbnail selections.
Disposable PostgreSQL integration24 passed, including visibility, rollback,
receipt races and manual-selection concurrency. The1000-product/3000-option/
1000-media fixture measured50 statements/1255ms for new publication and41/
3792ms for refresh, versus13032 statements before bulk persistence; only query
count is asserted. Server unit/controller11, web focused15 and extension408
passed. Nest build still has3 retired Automation export errors and web build7
retired generic-session export errors. No full boot or real-provider QA is
claimed. Owner token/fixed-expiry/terminal-Alert convergence remains the next
catalog slice; this storage checkpoint does not complete Task3 or the plan.

**Wing catalog owner checkpoint (2026-09-06):** The same `SourceImportRun`
now owns begin, the fixed 24-hour permit and terminal receipt. Its linked
collection row is only private chunk storage. The final transaction fences
the active account and frozen publication revision (including file imports),
then commits the canonical catalog and source Alert together. Same-key replay
recovers the permit; active conflicts identify the current attempt. Expired
reads are side-effect-free, and the next admission retires the expired owner.
Cancellation is FAILED / USER_CANCELLED without a new actionable Alert.

The Catalog web consumer now polls the owner and local browser progress only;
it neither creates Alert state nor relies on generic execution controls. Lost
begin/dispatch ACK reuses the saved key, and cancellation settles the owner
before best-effort local cleanup. Canonical cache invalidation occurs once
after COMPLETE. The logged-in Wing vendor remains unverified by the existing
extractor; frozen server identity is not evidence of browser account identity.

The extension now transports the permit directly, persists an immutable pending
terminal body and uses the existing small wire helper. Removed the old Catalog
execution shell. Local leftovers without valid permits cannot block admission;
a different previous attempt is replaced only after its exact owner is terminal.
Fixed expiry stops automatic retry, preserving uncertain receipts for explicit
owner reconciliation. Original URLs, 20-product chunks, five extraction tries,
500ms delays and normalized output are covered by characterization tests.

Final root combined disposable PostgreSQL 35 passed. The same large fixture
measured 55 SQL / 1238ms for new publication and 46 SQL / 3810ms for refresh.
Root web 37, shared 10, server unit/controller 11, extension 433 plus actual
worker 2, shared build, scoped lint/syntax and adapter-copy checks passed.
Fresh whole builds still fail on server 3 / web 7 retired generic-session
exports. The cutover scanner retains 707 legacy references, zero unowned
producers and zero source-to-ABC references. This bounded Catalog integration
does not certify real-provider QA, operating data, Task3 or the overall cutover.

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

**Residual checkpoint (2026-09-06):** Existing Alert polling and retired
ActionBoard/Workflow/Marketplace route removal remain intact. Commit `7d7a32f64`
removes unused Workflow/cache declarations, nine uncalled Operation hooks and
their exclusive API methods. It also removes only thumbnail-batch Operation
Alert writes, preserving 15-row chunks, two-second delay, local progress,
partial/all failure, callbacks and request cancellation. Main's combined gate
passes81 tests; the product-pipeline sweep passes393/fails2 at the unchanged
catalog generic-ID dependency. No real-browser route or whole-web build success
is claimed. The subsequent Agent-card retirement removes its Operation lookup,
card, hook and query keys while preserving receipt summary/resources/approvals;
historical JSON is ignored, not rewritten. Main's integrated Alert/Agent/route
gate passes215 tests. The scanner is still red at711 references (web27), with
zero unowned producers and source-to-ABC calls. Live Sellpia/browser-source
migration remains required before deleting the remaining helper modules.

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
