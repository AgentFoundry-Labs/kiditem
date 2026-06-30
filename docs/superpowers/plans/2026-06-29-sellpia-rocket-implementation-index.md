# Sellpia Rocket Inventory Plan Set Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the Sellpia + Coupang Rocket inventory sync design into independently executable implementation plans.

**Architecture:** The feature spans schema/contracts, Sellpia backend import/review, Rocket inventory ledger, and web UI. Each plan produces a buildable checkpoint and preserves Inventory as the only stock writer.

**Tech Stack:** NestJS, Prisma v7 multi-file schema, Zod, @e965/xlsx through `xlsx`, Next.js App Router, React Query, Vitest.

---

## Scope Split

The source spec covers multiple subsystems, so writing-plans scope check splits execution into four plan files. Execute in this order:

1. [Schema And Contracts](/Users/yhc125/workspace/kiditem/docs/superpowers/plans/2026-06-29-sellpia-rocket-schema-contracts.md)
2. [Sellpia Backend](/Users/yhc125/workspace/kiditem/docs/superpowers/plans/2026-06-29-sellpia-backend-import-review.md)
3. [Rocket Backend](/Users/yhc125/workspace/kiditem/docs/superpowers/plans/2026-06-29-rocket-inventory-ledger-backend.md)
4. [Web UI And Runbook](/Users/yhc125/workspace/kiditem/docs/superpowers/plans/2026-06-29-sellpia-rocket-web-runbook.md)

Source material:

- `/Users/yhc125/workspace/kiditem/docs/superpowers/specs/2026-06-28-sellpia-rocket-inventory-sync-design.md`
- `/Users/yhc125/workspace/kiditem/docs/superpowers/plans/2026-06-28-sellpia-inventory-import.md`
- `/Users/yhc125/workspace/kiditem/docs/references/exported-list.xlsx`

Global invariants all plans must preserve:

- Inventory owns every stock write.
- Sellpia imports are row-scoped; absent products are ignored.
- Sellpia import never auto-adjusts stock.
- Missing Sellpia `상품코드` matches become new product candidates.
- Rocket reservations affect `reservedStock`, not `currentStock`.
- Rocket issue affects both `reservedStock` and `currentStock`.
- Receipt upload workbook generation remains behind a template adapter until the official Sellpia receipt-upload template is configured.

## Engineering Review Findings Applied

- Domain policies stay pure: no NestJS exceptions, HTTP types, Prisma types, or service-layer parser imports in `apps/server/src/inventory/domain/**`.
- Orders integrates Rocket reservation through the existing `INVENTORY_PORT`; InventoryModule keeps exporting only `INVENTORY_PORT`.
- Stock mutations reuse the existing Inventory repository row-lock path instead of adding a parallel stock writer.
- Sellpia import uses batched option matching, Rocket ledger totals, and recent-stock-event lookups so large workbooks do not create per-row database queries.
- Web XLSX upload uses `apiClient.uploadParsed` because `apiClient.post` is JSON-only.
- Receipt upload tracking is represented as workflow state only until the official Sellpia upload template is configured.

## What Already Exists

- `/Users/yhc125/workspace/kiditem/apps/server/src/inventory/application/service/inventory.service.ts` owns `receive`, `issue`, and `adjust`.
- `/Users/yhc125/workspace/kiditem/apps/server/src/inventory/adapter/out/repository/inventory.repository.adapter.ts` already locks `inventory` rows with tenant-scoped `FOR UPDATE`.
- `/Users/yhc125/workspace/kiditem/apps/server/src/inventory/domain/policy/stock-mutation.ts` is the pure-domain pattern to follow for stock rules and custom errors.
- `/Users/yhc125/workspace/kiditem/apps/server/src/inventory/__tests__/inventory.architecture.spec.ts` freezes layer boundaries.
- `/Users/yhc125/workspace/kiditem/apps/server/src/inventory/__tests__/inventory.module.wiring.spec.ts` freezes InventoryModule provider/controller/export wiring.
- `/Users/yhc125/workspace/kiditem/apps/server/src/inventory/__tests__/inventory-flow.pg.integration.spec.ts` verifies row locks and bundle stock fan-out.
- `/Users/yhc125/workspace/kiditem/apps/server/src/orders/services/rocket-po-confirm.service.ts` already previews and generates Rocket confirm rows.
- `/Users/yhc125/workspace/kiditem/apps/web/src/lib/api-client.ts` already has `uploadParsed` for multipart uploads with Zod parsing.
- `/Users/yhc125/workspace/kiditem/apps/web/src/app/(inventory)/inventory-hub/page.tsx` already owns Inventory Hub tabs.

## Not In Scope

- Pushing stock from KidItem to external shopping malls.
- Automatically changing Sellpia stock from a full export without operator approval.
- Parsing Coupang shipment PDFs or shipment labels.
- Generating the Sellpia receipt upload workbook before the official template is configured.
- Matching Sellpia rows by barcode fallback when `상품코드` is missing.
- Approving every row in a workbook as a whole-snapshot operation.

## Data Flow

```text
Sellpia XLSX export
  -> Inventory/Sellpia import controller
  -> parser ignores 상품분류, 품절, 품절일, 단종, 단종일
  -> batched ProductOption.legacyCode match
  -> batched Rocket ledger net
  -> snapshot preview rows
  -> operator approves selected row
  -> existing Inventory row lock
  -> ADJUST stock transaction
```

```text
Coupang Rocket confirm preview
  -> Orders confirm-commit endpoint
  -> INVENTORY_PORT.applyRocketInventoryEvent(reserve)
  -> existing Inventory row lock
  -> reservedStock delta
  -> RocketInventoryLedger idempotency key
```

```text
Manual Rocket shipment / return
  -> Inventory Hub Rocket event form
  -> Inventory Rocket event endpoint
  -> INVENTORY_PORT.applyRocketInventoryEvent(issue | return_restock | release)
  -> existing Inventory row lock
  -> currentStock / reservedStock delta
  -> RocketInventoryLedger idempotency key
```

## Failure Modes

| Case | Handling |
|---|---|
| Malformed XLSX or empty workbook | Controller returns 400 and UI shows the upload error. |
| XLSX exceeds size or row limit | Controller/parser returns 400 before persistence. |
| Duplicate Sellpia `상품코드` | Row is review-only with `duplicate_code`; no stock adjustment during import. |
| Missing Sellpia `상품코드` | Row is rejected as a parse warning, not auto-created. |
| Unmatched Sellpia `상품코드` | Row becomes a new product candidate that must be created, linked, or ignored. |
| Recent KidItem stock event after export time | Row is review-only; operator must explicitly approve target quantity. |
| Concurrent Sellpia approvals | Existing inventory row lock plus item status transition prevents double adjustment. |
| Duplicate Rocket commit/event | `organizationId + sourceActionId + eventType` unique key returns idempotent success. |
| Rocket issue over open reservation | Requires explicit override flag and reason. |
| Multipart upload auth failure | UI reports failure; automatic JSON retry is not used for FormData. |

## Test Coverage Diagram

```text
Shared contracts
  -> Zod schema specs
  -> packages/shared build

Inventory domain
  -> Sellpia recommendation policy specs
  -> Rocket event policy specs
  -> inventory architecture spec

Inventory application
  -> Sellpia service specs with batched repository assertions
  -> Rocket service specs through INVENTORY_PORT
  -> inventory module wiring spec

Postgres integration
  -> concurrent Sellpia approval idempotency
  -> concurrent Rocket reservation idempotency
  -> Rocket over-reservation override rule
  -> bundle recompute after Sellpia/Rocket mutations

Web
  -> inventory API helper specs
  -> Sellpia import UI specs
  -> Rocket manual event UI specs
  -> Rocket confirm commit UI specs
  -> web build
```

## Worktree Parallelization Strategy

```text
Plan 1 schema/contracts
  -> must land first because backend and web import shared types

Plan 2 Sellpia backend
  -> may run after Plan 1
  -> isolated to Inventory backend

Plan 3 Rocket backend
  -> may run after Plan 1
  -> touches Inventory and Orders integration

Plan 4 Web/runbook
  -> starts after shared contracts exist
  -> final build after Plan 2 and Plan 3 endpoint names are fixed
```

## Completion Gate

After all four plans are implemented:

```bash
npm run db:push
npx prisma generate
cd packages/shared && npm run build
npm run build --workspace=apps/server
npm run build --workspace=apps/web
npm run check:idor
npm run check:tenant-scope
```

Expected: all commands complete with exit code 0. For `npm run dev:server`, boot the server and confirm Nest finishes module initialization without provider errors.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-29-sellpia-rocket-implementation-index.md`. Two execution options:

1. Subagent-Driven (recommended) - dispatch a fresh subagent per task, review between tasks, fast iteration
2. Inline Execution - execute tasks in this session using executing-plans, batch execution with checkpoints

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | - | Not run for this plan set. |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | - | Not run for this plan set. |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 3 | CLEAR (PLAN) | 12 plan issues found and applied; 0 unresolved decisions; 0 critical gaps; commit `c106204a`. |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | - | Not run; recommended before building the Inventory Hub UI. |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | - | Not run; not required before implementation. |

- **UNRESOLVED:** 0
- **VERDICT:** ENG CLEARED - ready to implement after choosing the execution mode.
