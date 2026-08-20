# Office 1688 CDP Keyword Collection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move only `sourcing.search_1688_keyword_batch` from the Chrome extension to the server's Office-managed, authenticated Chrome CDP session while preserving OperationRun lifecycle, exact-attempt fencing, persisted snapshots, and operator login/session continuity.

**Architecture:** The existing operation key becomes a version-2 `domain` operation. Its Nest handler executes one to six keywords serially through a CDP-only 1688 provider. Provider I/O happens outside a database transaction; each keyword's canonical result commits through `withActiveDomainAttemptFence` and `commitInAttempt`. The adapter creates exactly one owned page in the host Chrome's existing context and closes only that page plus its Playwright client connection. The extension keeps daily 1688 trends and image matching stays AlphaShop HTTP, but the exact keyword handler, hook, and browser-ingest route are removed.

**Tech Stack:** NestJS, TypeScript, Playwright `connectOverCDP`, Prisma transaction capabilities, Zod/shared sourcing contracts, Node/Vitest extension tests, static architecture gates.

---

## Working boundaries

- Work only in `/Users/dev125/workspace/kiditem/.worktrees/kid-24-sourcing-operation-run`.
- Prefix every shell command with `rtk`.
- Preserve and deliberately reconcile the pre-existing dirty 1688 QA drafts; never reset or check them out:
  - `extensions/kiditem-os/background/sourcing/worker.js`
  - `extensions/kiditem-os/content/sourcing/extractors/1688.js`
  - `extensions/kiditem-os/manifest.json`
  - `extensions/kiditem-os/content/sourcing/extractors/1688-search-hook.js`
  - `extensions/tests/product-scraper/1688-current-search.regression-1.test.mjs`
- Do not restore the deleted synchronous HTTP keyword endpoint, anonymous MTOP path, local Chromium launch fallback, generic extension message bridge, or recommendation refresh side effect.
- `sourcing.collect_1688_trends` remains extension/browser-owned.
- `sourcing.match_wholesale_images` remains server-owned AlphaShop HTTP and must not open a browser page.
- Never push. Commit each coherent task only after its focused verification is green.

## Task 1: Build the CDP-only provider and current-site extractor

**Files:**

- Create: `apps/server/src/sourcing/application/port/out/provider/1688-keyword-search.port.ts`
- Create: `apps/server/src/sourcing/adapter/out/1688/1688-keyword-search.extractor.ts`
- Create: `apps/server/src/sourcing/adapter/out/1688/1688-keyword-search.extractor.spec.ts`
- Create: `apps/server/src/sourcing/adapter/out/1688/direct-1688-keyword-search.adapter.ts`
- Create: `apps/server/src/sourcing/adapter/out/1688/direct-1688-keyword-search.adapter.spec.ts`
- Modify: `apps/server/src/sourcing/adapter/out/1688/abortable-browser-session.ts`
- Create or modify: `apps/server/src/sourcing/adapter/out/1688/abortable-browser-session.spec.ts`

- [ ] Read the scoped server/sourcing AGENTS files and the TDD skill before editing.
- [ ] Add RED extractor tests for current 1688 data and DOM shapes:
  - `http://detail.m.1688.com/page/index.html?offerId=123456` becomes `offerId: "123456"` and canonical `https://detail.1688.com/offer/123456.html`.
  - `近30天成交 88 笔` becomes `monthlySales: 88`, not `30`.
  - API and DOM duplicates collapse by offer ID, output is bounded, and malformed/raw fields do not escape.
  - open shadow-root cards are traversed; closed/inaccessible trees fail safely.
- [ ] Run the extractor spec and capture the intended RED due to missing production modules.
- [ ] Implement a pure, bounded extractor. Keep persisted output limited to the typed port fields:

```ts
export interface Search1688KeywordItem {
  offerId: string | null;
  title: string;
  priceCny: number | null;
  sourceUrl: string;
  imageUrl: string | null;
  monthlySales: number | null;
  tradeScore: number | null;
  repurchaseRate: string | null;
  supplierName: string | null;
  score: number;
}
```

- [ ] Add RED adapter/session tests proving:
  - missing or malformed `SOURCING_PLAYWRIGHT_CDP_ENDPOINT` fails closed before any provider navigation;
  - `http`, `https`, `ws`, and `wss` endpoint schemes are accepted;
  - the adapter calls only `chromium.connectOverCDP`, uses the host browser's existing context, and never calls `launchPersistentContext` or `browser.newContext`;
  - one page is created for a batch/provider session, response observation is installed before navigation, and keywords are visited serially;
  - caller abort closes the owned page and returns without further navigation or result writes;
  - normal/failed completion closes only the owned page and Playwright client connection, not the host Chrome or unrelated pages;
  - login/security challenge produces a typed `Sourcing1688KeywordAttentionError` rather than a generic provider failure;
  - unreachable CDP produces a bounded configuration/provider error without leaking endpoint credentials or raw response bodies.
- [ ] Run the adapter/session specs and capture the intended RED.
- [ ] Implement the provider port and CDP-only adapter. Use the existing search URL:

```ts
new URL('https://s.1688.com/selloffer/offer_search.htm')
```

Install the response listener before `page.goto`, use API payload results when valid, and fall back only to authenticated page DOM extraction—not MTOP and not a new browser profile.
- [ ] Keep all waits signal-aware and bounded. Reuse `abortableBrowserStep`; narrow `openAbortableBrowserSession` to the exact CDP contract or add a new exact helper if changing the generic helper would affect unrelated runtimes.
- [ ] Run:

```bash
rtk npm run test --workspace=apps/server -- \
  apps/server/src/sourcing/adapter/out/1688/1688-keyword-search.extractor.spec.ts \
  apps/server/src/sourcing/adapter/out/1688/direct-1688-keyword-search.adapter.spec.ts \
  apps/server/src/sourcing/adapter/out/1688/abortable-browser-session.spec.ts
rtk npm run build --workspace=apps/server
rtk git diff --check
```

- [ ] Self-review for anonymous/local fallbacks, non-owned tab closure, unbounded payload traversal, raw secret/error leakage, and accidental changes to image matching.
- [ ] Commit exactly this task with `feat: add office CDP 1688 keyword provider`.

## Task 2: Move the exact Operation to the domain handler and fence every keyword commit

**Files:**

- Create: `apps/server/src/sourcing/application/service/sourcing-1688-keyword-search.service.ts`
- Create: `apps/server/src/sourcing/application/service/sourcing-1688-keyword-search.service.spec.ts`
- Modify: `apps/server/src/sourcing/domain/operation/sourcing.operations.ts`
- Modify: `apps/server/src/sourcing/adapter/in/operation/sourcing-1688.operation-handler.ts`
- Modify: `apps/server/src/sourcing/adapter/in/operation/sourcing-1688.operation-handler.spec.ts`
- Modify: `apps/server/src/sourcing/adapter/in/operation/sourcing-browser.operation-handler.ts`
- Modify: `apps/server/src/sourcing/adapter/in/operation/sourcing-browser.operation-handler.spec.ts`
- Modify: `apps/server/src/sourcing/sourcing.module.ts`
- Modify: `apps/server/src/sourcing/__tests__/sourcing.module.wiring.spec.ts`
- Modify: `apps/server/src/sourcing/adapter/in/http/sourcing-browser-trend-operation.controller.ts`
- Modify: `apps/server/src/sourcing/adapter/in/http/sourcing-browser-trend-operation.controller.spec.ts`
- Modify: `apps/server/src/sourcing/application/service/sourcing-browser-trend-operation.service.ts`
- Modify: `apps/server/src/sourcing/application/service/sourcing-browser-trend-operation.service.spec.ts`
- Add focused real-PostgreSQL coverage beside the existing Operations/Sourcing attempt-fence integration specs.

- [ ] Add RED definition and registry tests requiring:

```ts
{
  key: 'sourcing.search_1688_keyword_batch',
  version: 2,
  engineType: 'domain',
  resourceClass: 'playwright_1688',
  maxAttempts: 3,
  executionTimeoutMs: 15 * 60_000,
}
```

The browser handler must no longer register this key; `Sourcing1688OperationHandler` must register it alongside image matching.
- [ ] Add RED service/handler tests for one-to-six canonical unique keywords, serial execution, one provider browser session/page per batch, progress/checkpoints, `AbortSignal`, truthful complete/partial/no-change/all-failed summaries, and `attention_required` with marketplace-login reason.
- [ ] Add RED transaction tests proving the final canonical write is supplied as:

```ts
commitWithinActiveOperationAttempt: (commit) =>
  attemptVerifier.withActiveDomainAttemptFence(
    {
      organizationId: context.organizationId,
      runId: context.runId,
      expectedOperationKey: SOURCING_1688_KEYWORD_BATCH_OPERATION.key,
      attemptToken: context.attemptToken,
    },
    (_attempt, transaction) => commit(transaction),
  )
```

and that cancellation, token mismatch, deadline expiry, or lifecycle stop between provider completion and commit produces zero canonical writes.
- [ ] Restore only the operation-oriented keyword service from history. It must use `SourcingCollectionCoordinator.execute`, pass `signal`, `operationCheckpoint`, and `commitWithinActiveOperationAttempt`, and use `commitInAttempt`. Keep the existing six-result behavior per keyword and existing snapshot idempotency. Do not restore old public `searchByKeyword`, status, random-idempotency HTTP, or recommendation-refresh methods.
- [ ] Implement the domain handler serial loop. Use one provider batch/session API if necessary so the adapter owns one page for the full one-to-six-keyword run, while still committing each keyword independently through the exact attempt fence.
- [ ] Add a real PostgreSQL interleaving test: lock/cancel or expire the OperationRun after provider completion but before callback entry; assert callback/collection commit count is zero. Add the positive exact-token case and cross-organization/key rejection.
- [ ] Wire the port, adapter, service, and handler in `SourcingModule`; update the wiring spec from explicit absence to exact ownership.
- [ ] Only after the domain path is green, delete the exact browser-ingest path:
  - remove `POST /sourcing/operations/1688-search/:runId/results`;
  - remove `ingest1688Search`, its special result type/helpers/constants, and exact tests;
  - preserve `1688-trends` and TikTok browser owner routes unchanged.
- [ ] Run focused server tests, the real-PG test, IDOR/tenant/raw guards, and build:

```bash
rtk npm run test --workspace=apps/server -- \
  apps/server/src/sourcing/adapter/in/operation/sourcing-1688.operation-handler.spec.ts \
  apps/server/src/sourcing/adapter/in/operation/sourcing-browser.operation-handler.spec.ts \
  apps/server/src/sourcing/application/service/sourcing-1688-keyword-search.service.spec.ts \
  apps/server/src/sourcing/__tests__/sourcing.module.wiring.spec.ts \
  apps/server/src/sourcing/adapter/in/http/sourcing-browser-trend-operation.controller.spec.ts \
  apps/server/src/sourcing/application/service/sourcing-browser-trend-operation.service.spec.ts
rtk npm run check:idor
rtk npm run check:tenant-scope
rtk npm run check:raw-snapshot-boundary
rtk npm run build --workspace=apps/server
rtk git diff --check
```

- [ ] Self-review exact owner/key/token/lease/deadline checks, Operation-row-first lock order, per-keyword idempotency, no provider I/O inside a transaction, and no recommendation side effect.
- [ ] Commit exactly this task with `refactor: run 1688 keyword batches through domain operations`.

## Task 3: Remove the extension keyword runtime and encode the Office operating contract

**Files:**

- Modify: `extensions/kiditem-os/background/sourcing/worker.js`
- Modify: `extensions/kiditem-os/content/sourcing/extractors/1688.js`
- Modify: `extensions/kiditem-os/manifest.json`
- Delete: `extensions/kiditem-os/content/sourcing/extractors/1688-search-hook.js`
- Modify: `extensions/tests/product-scraper/sourcing-operation-handlers.test.mjs`
- Modify: `extensions/tests/product-scraper/1688-search-extractor.test.mjs`
- Delete after migrating its assertions: `extensions/tests/product-scraper/1688-current-search.regression-1.test.mjs`
- Modify: `scripts/check-sourcing-long-running-actions.mjs`
- Modify: `scripts/__tests__/check-sourcing-long-running-actions.test.mjs`
- Add a sourcing-worker fixture under `scripts/__tests__/fixtures/sourcing-long-running-actions/`
- Modify: `apps/server/.env.example`
- Modify: `deploy/office/office.env.example`
- Modify if required by environment passthrough: `deploy/office/compose.office.yml`
- Modify: `docs/runbooks/environment-variables.md`
- Modify: `docs/runbooks/sourcing-collection-operations.md`
- Modify: `apps/server/src/sourcing/AGENTS.md`
- Modify: `extensions/kiditem-os/background/sourcing/AGENTS.md`
- Modify `docs/ARCHITECTURE.md` only if its current ownership text needs correction.

- [ ] Re-run the existing dirty extension regression tests before reconciliation and record their current GREEN/RED state.
- [ ] Add RED extension registry tests asserting `sourcing.search_1688_keyword_batch` has no extension handler while `sourcing.collect_1688_trends`, TikTok, and live handlers remain registered.
- [ ] Add a RED static-gate fixture where the sourcing worker registers or dispatches the retired exact keyword key. Extend the production scanner to include `extensions/kiditem-os/background/sourcing/worker.js` and fail on this exact legacy ownership.
- [ ] Remove `runSourcing1688KeywordSearchOperation`, its registry entry, its search-response hook injection, and the keyword-specific manifest script. Delete `1688-search-hook.js`.
- [ ] Reconcile the dirty `1688.js` changes deliberately:
  - preserve generic/current-site fixes still required by daily `sourcing.collect_1688_trends`: query-string offer ID, canonical HTTPS URL, open shadow DOM, and correct `近30天成交 N 笔` parsing;
  - remove fields/listeners that exist only for the deleted keyword search response hook;
  - migrate durable assertions from `1688-current-search.regression-1.test.mjs` into the canonical extractor test, then delete the temporary regression filename.
- [ ] Update the environment contract:
  - `SOURCING_PLAYWRIGHT_CDP_ENDPOINT=http://kiditem-office:9444` is the Office example;
  - runtime accepts `http`, `https`, `ws`, or `wss` endpoints;
  - later HTTPS use requires a reachable trusted certificate and websocket proxying, not code changes;
  - Chrome runs manually or via an Office startup task with an Office-managed persistent profile cloned from the authenticated operator profile when desired;
  - no TLS/mTLS/auth proxy is required for the initial same-PC Office setup;
  - no extension/anonymous/fresh-profile automatic fallback exists.
- [ ] Correct scoped AGENTS ownership: server domain Operation owns keyword batches; extension owns only the remaining exact browser keys. Remove the stale instruction that forbids moving keyword collection back to the server.
- [ ] Run:

```bash
rtk node --test extensions/tests/product-scraper/sourcing-operation-handlers.test.mjs
rtk node --test extensions/tests/product-scraper/1688-search-extractor.test.mjs
rtk npm run test --workspace=extensions/kiditem-os
rtk npm run test:scripts
rtk npm run check:sourcing-long-running-actions
rtk npm run check:agents-hygiene
rtk npm run check:conventions
rtk docker compose --env-file deploy/office/office.env.example \
  --env-file deploy/office/digest.env.example \
  -f deploy/office/compose.office.yml config --quiet
rtk git diff --check
```

- [ ] Run exact caller/registry scans and require zero matches for the retired keyword extension handler, hook, and browser-ingest route while confirming the daily trend key remains.
- [ ] Self-review the dirty-draft reconciliation, manifest load order, scanner coverage, scoped instructions, and Office endpoint wording.
- [ ] Commit exactly this task with `refactor: retire extension 1688 keyword collection`.

## Task 4: Verify the whole migration and execute Office CDP QA

**Files:**

- Modify production/tests only if verification finds a direct regression; use RED first and commit each verified fix separately.

- [ ] Record the implementation base and head, then inspect the whole range against the approved design:

```bash
rtk git log --oneline --decorate --reverse fa3dcae0..HEAD
rtk git diff --stat fa3dcae0..HEAD
rtk git diff --check fa3dcae0..HEAD
rtk git status --short
```

- [ ] Run serial builds so generated shared declarations cannot race:

```bash
rtk npm run build --workspace=packages/shared
rtk npm run build --workspace=apps/server
rtk npm run build --workspace=apps/web
```

- [ ] Run all changed focused suites, full extension tests, server/web affected suites, static/convention/tenant/IDOR/raw guards, and the exact real-PG fence suite.
- [ ] Boot Nest only with a fresh disposable PostgreSQL container, explicit `DATABASE_URL`, unique `PORT`, and worker/scheduler disabled. Confirm `SourcingModule` initializes, then stop the exact PID/container and verify ports are closed. Never use the default/local `kiditem` database.
- [ ] On the Office PC, start or attach to the authenticated managed Chrome profile with remote debugging on port `9444`. Confirm `/json/version` is reachable at `http://kiditem-office:9444` from the API runtime.
- [ ] Execute a real `sourcing.search_1688_keyword_batch` from the UI/API with one known keyword and then a multi-keyword batch. Verify:
  - the OperationRun uses version 2/domain and progresses to a truthful terminal state;
  - an owned search tab appears and only that tab closes;
  - host Chrome stays alive, unrelated tabs stay open, and 1688 login remains valid;
  - persisted snapshot contains canonical HTTPS offer URLs and correct monthly sales;
  - refresh/reconnect reads persisted state without restarting work;
  - stopping/cancelling during a provider-to-commit barrier produces no post-cancel canonical write;
  - CDP absence and login challenge fail closed with no fallback, and login challenge is shown as attention required.
- [ ] If Office Chrome/CDP/login is unavailable, report the exact external prerequisite as a blocker and do not fabricate live QA. Deterministic tests and disposable boot are not substitutes for the live-session claim.
- [ ] Run final PR reconstruction/release guards against `origin/develop`, but do not push or open a PR unless explicitly requested.
- [ ] Leave a clean worktree and provide exact commit SHAs, RED/GREEN evidence, live-QA result, any external blocker, and teardown confirmation.

## Whole-work review gate

After Tasks 1–4 are implemented, run exactly one whole-range review against `fa3dcae0..HEAD`. The reviewer must inspect the approved design, this plan, production code, tests, dirty-draft reconciliation, Office operating contract, and verification evidence. Report only code-proven Critical/Important findings with exact paths and reproduction. Any validated finding returns to a Terra implementation worker for RED→GREEN correction, followed by a whole-range re-review.
