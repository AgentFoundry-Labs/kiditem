# Sourcing Collection Operations

## Purpose

Use this runbook for an explicit sourcing collection, its operation status,
Chrome-backed browser claim, cancellation, retry, provider outage, and
lifecycle diagnosis. It is not a procedure for direct provider calls, direct
database edits, requeueing rows, or copying browser credentials.

The ownership flow is exact:

```text
sourcing screen -> Operations start/read -> owner operation handler
v2 1688 keyword handler -> Office Chrome CDP -> fenced owner commit
remaining browser handler -> KidItem OS claim -> fenced owner ingest
owner snapshot -> sourcing screen
Operations never owns sourcing or Ads canonical rows
```

Operations owns only the run envelope, queue, resource class, lifecycle gate,
and browser lease. Sourcing and Advertising owner handlers validate and ingest
their canonical rows. A screen reads an owner snapshot; an OperationRun result
is never a substitute canonical payload.

## Human Prerequisites

- Sign in to the intended KidItem organization and use its normal web session.
- Confirm exactly one API process/container is serving the environment. API
  replicas, rolling overlap, and a second API during maintenance are
  unsupported.
- Confirm the API is healthy before starting any collection. The separate Agent
  worker may run Agent OS only; it cannot import OperationsModule or
  query/mutate OperationRun.
- For a browser operation, load the unified KidItem OS extension in the same
  Chrome profile as the authenticated provider tab. Human login, OTP, CAPTCHA,
  and account selection stay in that profile.
- For a version-2 1688 keyword run, confirm the Office-managed Chrome CDP
  endpoint is reachable from the API and that its persistent Office profile is
  authenticated. Chrome is a host process, started manually or by an Office
  startup task; the profile may be a full clone of an authenticated operator
  profile when all source Chrome processes were stopped for the copy.
- Do not record credentials, cookies, tokens, raw provider rows, or extension
  payloads in tickets, logs, screenshots, or this runbook.

If the provider session or authenticated web/API stack is not available, run
the deterministic checks in Verification and report the missing prerequisite;
do not fabricate a Chrome action or provider outcome.

## Resource Limits And Environment Validation

The API Operations worker uses independent resource classes. The default
capacities are intentionally conservative:

| Resource class | Default capacity | Operational reason |
| --- | ---: | --- |
| default | 2 | ordinary provider HTTP and short orchestration |
| naver_api | 2 | bounded Naver API parallelism |
| playwright_1688 | 1 | Office CDP 1688 keyword page ownership and AlphaShop image matching remain serialized |
| snapshot_compute | 2 | bounded aggregation memory and database pressure |
| extension_coupang | 4 dispatch slots | extension dispatch is short; each environment has one active browser claim |

OPERATION_RESOURCE_CLASS_LIMITS is optional. If supplied, it is a complete JSON
object with exactly those keys and positive integer values, for example:

```json
{
  "default": 2,
  "naver_api": 2,
  "playwright_1688": 1,
  "snapshot_compute": 2,
  "extension_coupang": 4
}
```

The API rejects malformed JSON, a missing/unknown class, or a zero/negative
limit with operation_resource_class_limits_invalid. It does not silently merge
a partial object with defaults or place an unknown class in default. Correct
the protected API environment and boot an isolated API to validate the value;
never print the full environment file or copy it to an Agent/MCP child.

Also confirm the intended runtime settings before starting collection:

| Setting | Check |
| --- | --- |
| OPERATION_RUNTIME_WORKER_ENABLED | Set to 1 only when server-backed operations should execute. A disabled worker leaves them queued rather than bypassing Operations. |
| OPERATION_SCHEDULER_ENABLED | Set to 1 only for reviewed schedules; it does not make a disabled schedule active. |
| OPERATION_RUN_LEASE_MS | Positive. Browser heartbeats occur at least once per one-third of this lease. |
| SOURCING_PLAYWRIGHT_CDP_ENDPOINT | Required for the version-2 1688 keyword domain Operation. It accepts `http`, `https`, `ws`, or `wss`; the initial Office value is `http://kiditem-office:9444`. Image matching remains AlphaShop HTTP and opens no browser tab. |

## Lifecycle And Process Ownership

The API lifecycle is:

```text
BOOTSTRAPPING -> ACCEPTING -> STOPPING -> STOPPED
```

Only ACCEPTING admits a user/schedule start, retry, server/browser claim,
composite resume, or child creation. Other states return
operation_server_lifecycle_unavailable. Heartbeats and reports remain
attempt-token fenced, so stale browser work cannot publish after intake closes.

### Startup: fail closed

Before the HTTP listener, scheduler, worker, browser claim, or composite resume
opens, the API:

1. Reads the database clock.
2. Cancels every old queued, waiting_runtime, waiting_dependency, or running
   OperationRun in batches.
3. Advances missed schedules to the first future occurrence without creating a
   run.
4. Verifies no old active/waiting work remains, then transitions to ACCEPTING.

This startup cleanup has a code-owned 30 second total limit. Old rows receive
the startup code operation_server_lifecycle_expired. If cleanup, the database
clock, or a lock cannot finish in time, the API remains BOOTSTRAPPING and does
not listen. Diagnose the database/lock problem first; do not bypass cleanup,
manually restore queued, or start another API replica.

### Graceful shutdown

Shutdown moves the gate to STOPPING before draining intake. It stops the
scheduler and worker, clears/fences browser claims, runs a first cancellation
sweep, aborts active work, then runs a final sweep for a boundary commit. Both
sweeps use operation_server_shutdown. Provider/browser cleanup has a code-owned
5 second total limit. A failed or incomplete sweep emits
operation_server_lifecycle_cleanup_failed and the process must not claim a
clean shutdown.

A cancelled row is immutable audit history. Restart, maintenance, crash
recovery, or lease expiry never reactivates, decrements attempts, restores
queued, or creates a replacement run. After maintenance, an operator may make
an explicit retry only once one API is ACCEPTING; that action creates a new
OperationRun and preserves the old cancellation row.

## Office 1688 Keyword CDP Runtime

`sourcing.search_1688_keyword_batch` is a version-2 server domain Operation.
It connects only to the configured Office Chrome CDP endpoint, creates one
operation-owned page, and closes only that page when it finishes, fails, or is
cancelled. Host Chrome, its login state, and unrelated pre-existing tabs must
survive every run. The extension neither registers nor dispatches this operation.

The endpoint accepts `http`, `https`, `ws`, and `wss`. The initial same-PC Office
endpoint, `http://kiditem-office:9444`, reaches the host through the Compose host
alias and needs no TLS, mTLS, or authentication proxy. A later HTTPS/WSS endpoint
requires API-container reachability, a certificate the container trusts, and a
proxy that preserves CDP discovery plus WebSocket upgrade traffic. That is Office
configuration work, not an application-code change.

The persistent Office profile may be prepared as a full clone of an authenticated
operator profile: stop all source Chrome processes, copy the complete User Data
parent, then start the selected profile with remote debugging. Operations never
recopy, launch, terminate, or close host Chrome. Login/security challenges remain
operator attention; there is no automatic extension, anonymous-browser, or
fresh-profile fallback.

## Start And Inspect A Collection

The normal operator path is the sourcing screen's explicit collection CTA. It
starts:

```text
POST /api/operations/:operationKey/runs
```

with a scoped authenticated session and receives 202 plus a run. Page mount,
reload, route navigation, filter changes, and snapshot reads must start zero
external collection. The screen shows the last owner snapshot while a separate
run panel reports status.

For read-only diagnosis in the authenticated application session, use the
Operations endpoints rather than a database console:

```text
GET /api/operations/runs
GET /api/operations/runs/:runId
POST /api/operations/runs/:runId/cancel
```

Inspect these safe fields:

| Field | Meaning | Operator response |
| --- | --- | --- |
| status | queued, waiting_runtime, waiting_dependency, running, attention_required, succeeded, failed, cancelled, or skipped | Follow the state table below; do not mutate the row manually. |
| stage and stageUpdatedAt | code-owned progress boundary and its freshness | A stale stage with fresh updatedAt can be a heartbeat; a stale stage and heartbeat needs provider/browser diagnosis. |
| progress, progressCurrent, progressTotal | normalized and numeric progress when known | Treat absent counts as unknown, not zero accepted. |
| updatedAt / heartbeat age | last fenced lease renewal or report | Past lease/deadline is a fence/cancellation concern, not a reason to resurrect a run. |
| deadlineAt and attempts | run policy copied at start and durable audit count | Do not extend a deadline or decrement attempts manually. |
| result.summary and result.sources | terminal safe counts/outcomes | Use for UI/operator summary only; read canonical rows through their owner API. |

Extension browser operations move to waiting_runtime until KidItem OS claims the
exact run. The browser handler creates/resumes the extension-local session with
the same run ID, a verified environment, and the exact producer. It sends raw
provider rows only to the owner ingest endpoint using the attempt token. Its
terminal report includes safe counts and references, never raw rows. The v2 1688
keyword domain Operation instead commits through its active-attempt fence after
Office CDP provider work completes.

## Cancel, Retry, Attention, And Provider Outage

| Situation | Safe action | Never do |
| --- | --- | --- |
| queued, waiting, or running run is no longer wanted | Use the run panel cancel control or POST /api/operations/runs/:runId/cancel; confirm terminal cancelled state. | Delete/update OperationRun, clear its token yourself, or launch a second competing collection. |
| browser requires login, OTP, CAPTCHA, or account selection | Keep the managed provider tab, complete the human action, then use the screen's attention retry after the API is ACCEPTING. Browser attention retry creates a new run. | Treat authentication/CAPTCHA as a transient automatic retry or bypass it with a copied session. |
| retryable provider outage or timeout | Preserve the prior owner snapshot, record the bounded error code and source outcome, restore provider readiness, then use an explicit CTA/retry. | Replace the snapshot with empty data, claim a failed run succeeded, or replay client loops. |
| partial source outcome | Keep accepted canonical observations and inspect result.sources for failed source codes. | Report all-source completion, erase accepted rows, or put raw provider errors in the UI stage. |
| server-lifecycle cancellation | Wait for one API to complete BOOTSTRAPPING and reach ACCEPTING; then start a deliberate new run if still needed. | Reactivate/requeue the old row, decrement attempts, or let maintenance silently create a new run. |
| fence/heartbeat lost | Stop browser work and close owned background tabs if still open; inspect the run and lifecycle state. | Send a late terminal report or continue provider collection with a stale attempt token. |

The browser-specific attention retry endpoint is:

```text
POST /api/operation-runtime/browser/runs/:runId/retry
```

It is valid only for an attention_required browser run while the API is
ACCEPTING, and deliberately starts a new run. Non-browser failures use their
explicit screen CTA and policy; there is no generic direct-database retry.

## Safe Result Contract

The terminal operation result stays below the safe-result size limit and
contains only bounded operational information:

```ts
{
  outcome: "complete" | "partial" | "no_change",
  summary: {
    discovered: number,
    accepted: number,
    duplicate: number,
    unchanged: number,
    failed: number
  },
  sources: [{
    source: string,
    outcome: "complete" | "partial" | "no_change" | "failed" | "skipped",
    accepted: number,
    failed: number,
    errorCode?: string
  }],
  snapshotGeneratedAt?: string
}
```

Do not add raw provider rows, responses, URLs containing secrets, payloads,
files, cookies, credentials, or arbitrary error text. The UI maps code-owned
stages to localized copy and reads detailed canonical data through the owner
snapshot endpoint.

## Chrome Regression Matrix

Run this matrix only when all prerequisites are genuinely present: authenticated
KidItem API and web session, the unified extension loaded from the intended
build, and the relevant Coupang/1688 prepared provider session. For every row,
record network requests, console errors, elapsed time, status/stage/progress,
terminal text, cancellation, route navigation while active, and reload
recovery. Every route must prove that mount itself starts zero external
collection.

| Route | Explicit interaction | Required evidence |
| --- | --- | --- |
| /sourcing-ai | Open dashboard, inspect rank/recommendation reads. | Snapshot renders; no automatic collection. |
| /sourcing-ai/category-sourcing | Change category/filter and search UI. | Read/local interaction only; no implicit provider call. |
| /sourcing-ai/competitor-analysis | Start competitor catalog collection. | advertising.collect_competitor_catalog run, persisted snapshot, cancel/reload behavior. |
| /sourcing-ai/decision-center | Open and inspect entry recommendation/interest views. | Owner read model only; no collection on entry. |
| /sourcing-ai/final-selection | Open final-selection workspace without sending an unapproved model request. | Route is stable and starts no sourcing collection. |
| /sourcing-ai/keywords | Submit a keyword collection CTA. | sourcing.collect_keyword_suggestions run and persisted keyword snapshot. |
| /sourcing-ai/market | Start daily trend collection. | sourcing.collect_daily_trends parent/child outcome and source-safe summary. |
| /sourcing-ai/product-tracking | Refresh tracked metrics explicitly. | advertising.refresh_tracked_wing_products and one bulk history read, not N per-product calls. |
| /sourcing-ai/recommendations | Start recommendation validation collection. | sourcing.collect_wing_catalog_batch with persisted recommendation snapshot. |
| /sourcing-ai/rising-products | Click detect. | sourcing.detect_rising_products and persisted rising model; no synchronous detect endpoint. |
| /sourcing-ai/settings | Open/edit then cancel settings interaction. | No external collection on mount or settings edit. |
| /sourcing-ai/validation | Start validation collection. | explicit Wing-batch run, run panel, retained snapshot on failure. |
| /sourcing-ai/wholesale-search | Explicitly run an Office CDP 1688 keyword batch, then a tabless AlphaShop image match for selected targets. | version-2 `sourcing.search_1688_keyword_batch` domain run and `sourcing.match_wholesale_images`, no route-entry batch. Only the CDP operation-owned tab closes; host Chrome, login, and unrelated tabs survive. |
| /sourcing-ai/wing-catalog | Submit Wing catalog search/next page. | sourcing.collect_wing_catalog_batch browser claim, fenced ingest, persisted catalog snapshot. |

Provider-unavailable is a required case when a real stack is available: confirm
that it becomes attention_required, partial, or failed with safe code-level
feedback; it must not display a false successful count. If the stack is absent,
the substitute evidence is the focused UI/static tests plus an explicit list of
missing API session, extension, or provider-session prerequisites.

## Verification

Run these checks from the repository root before relying on a deployment:

```bash
rtk npm run check:sourcing-long-running-actions
rtk npm run test:scripts
rtk npm run check:conventions
rtk npm run check:agents-hygiene
rtk npm run check:web-db-boundary
rtk npm run check:raw-snapshot-read-models
rtk npm run check:idor
rtk npm run check:tenant-scope
```

For a schema/boot check, use a fresh disposable PostgreSQL database only:

```bash
rtk npm run db:push
rtk npx prisma generate
rtk npm run build --workspace=packages/shared
rtk npm run build --workspace=apps/server
rtk npm run build --workspace=apps/web
```

Do not use an accepted-data-loss flag, default local database, or production
Office database for this verification. See deployment-architecture.md for the
single-API Compose contract and environment-variables.md for strict
OPERATION_RESOURCE_CLASS_LIMITS validation.

## Blockers

Stop and report rather than working around any of these conditions:

- more than one API process/container, a planned rolling overlap, or an API
  lifecycle not ACCEPTING;
- startup cleanup timeout, operation_server_lifecycle_cleanup_failed, or
  residual active/waiting run that would require manual requeue;
- malformed resource class limits or an unvalidated protected API environment;
- missing authenticated KidItem/API session, the required extension capability
  for an extension-owned operation, Office CDP reachability for a v2 1688
  keyword run, or required provider login/CAPTCHA completion for a live test;
- a mount/reload/navigation causes an external collection, or a terminal result
  claims success without a persisted owner snapshot;
- a request exposes raw provider data, credentials, tokens, cookies, or
  arbitrary provider error text in result/stage/log evidence.

## Final Report Format

```text
Environment: <isolated local|Office>
Organization: <authenticated organization identifier, not a secret>
API topology: one API=<yes|no>; Agent worker isolated=<yes|no>
Lifecycle: <ACCEPTING|blocked code>
Resource limits: <defaults|validated complete override>
Run: <runId>; key=<operationKey>; status=<terminal status>
Snapshot: <owner endpoint and generated time>
Result: <safe counts/outcome/source codes only>
Cancellation/retry/attention: <action and evidence>
Chrome matrix: <14/14 evidence or exact unavailable prerequisites>
Automated gates: <commands and result>
Blockers/concerns: <none or exact condition>
```
