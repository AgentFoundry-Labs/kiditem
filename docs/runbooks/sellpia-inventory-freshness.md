# Sellpia Inventory Freshness Operations

This is the authoritative operator runbook for Sellpia inventory freshness.
Sellpia is the stock source of truth. KidItem publishes only a
validated full option-product export and never guesses, increments, or
decrements `SellpiaInventorySku.currentStock` from an order or purchase action.
Public availability is exactly the latest published physical stock.

## Prerequisites

- Prisma schema and the durable data migration
  `v0.1.19:001_sellpia_inventory_freshness` are applied. The immutable
  `v0.1.21` inventory-commitment implementation is historical evidence and is
  not registered for execution.
- NestJS and the web app are running, with exactly one backend listener on port
  4000 during local verification.
- The operator is signed in to the intended KidItem organization and to
  `https://kiditem.sellpia.com` in Chrome.
- The current worktree's `extensions/kiditem-os` is loaded and its ping
  advertises `sellpiaInventorySourceOwnerV1: true`.
- The organization has confirmed the fixed source binding:
  `https://kiditem.sellpia.com` / `kiditem`. Only an owner or admin can confirm
  it. The authenticated organization and user come from the KidItem session;
  they are never accepted from a request body.

Do not continue when the Chrome session belongs to a different Sellpia account
or the KidItem organization is ambiguous.

## State And Ownership

`SellpiaInventoryState` is one organization-scoped row. Inventory alone owns
freshness derivation, fixed source-attempt expiry, publication, and the opaque
`freshnessFence`.

| State | Meaning | Operator action |
|---|---|---|
| `fresh` | A completed full snapshot was verified less than 10 minutes ago and no newer generation is pending. | Continue normal work. |
| `refresh_required` | There is no verified snapshot, the 10-minute TTL elapsed, or a newer generation was requested. | Explicitly start collection from the owning screen. |
| `syncing` | An Inventory source attempt is within its fixed five-minute expiry. | Observe or resume the same attempt; do not create a competing collection. |
| `failed` | The requested generation failed after the last verified generation. | Correct the displayed failure and explicitly retry. |

Exactly 10 minutes is stale. The server owns TTL, generation, lease, and
confirmation clocks. Public generation values are decimal strings even
though persistence uses `BigInt`.

The previous completed snapshot remains the current stock basis during every
refresh request, download, validation failure, quality block, lease loss, or
provider ambiguity. A failed attempt does not publish partial rows.

`currentStock` is the latest completed physical Sellpia full snapshot, and
`availableStock === currentStock`. Preview allocation is transient and never
persists a hold. Never edit `currentStock` to imitate shipment.

## One-Time Source Binding

1. Open the authenticated `/inventory-hub` workspace and use its Sellpia sync
   action. The same tabless workspace owns physical stock, the complete
   read-only SKU collection, URL-authoritative filters, and confirmed
   destinations. Matching views display the shared state without replacing the
   active matching-center UI.
2. Confirm that the Inventory source action shows origin `https://kiditem.sellpia.com` and
   account `kiditem`.
3. As an owner or admin, choose **출처 연결 확인**.
4. Confirm the source binding is confirmed. Do not edit the database to create or
   change a binding.

## Explicit Browser Collection

1. The owning screen begins an Inventory source attempt with an idempotency
   key at `/api/inventory/sellpia-source/attempts`. Inventory fixes the source,
   generation, token and five-minute expiry before browser capture.
2. The screen sends the attempt identity to the extension. A lost response or
   page reload resumes the same RUNNING attempt. There is no Operation claim,
   heartbeat, automatic TTL collector or background recovery runtime.
3. The extension uses the already authenticated Chrome session. It loads
   `product_list_total.html` without stealing focus and posts the fixed
   `mode=soldout_manager`, `soldout_include=Y`, `limit=0` request directly to
   `product_search.ajax.html`. It does not generate or download Excel.
4. The extension rejects login HTML, wrong origin/path, invalid or empty JSON,
   duplicate product-option identities, incomplete rows, more than 20,000
   rows, oversized data, and timed-out/network responses. It preserves the
   normalized, identity-sorted, versioned snapshot contract.
5. The extension uploads directly to the issued attempt's `/complete` route.
   The owner checks the attempt token, organization and content checksum.
   Uncertain delivery is resolved by reading that exact attempt, not by
   assuming failure or beginning another collection.
6. Inventory validates the version, row count, ordering, identities, and row
   fields again, evaluates bounded quality evidence, and publishes in one
   fenced transaction. Known product codes absent from a valid new snapshot
   stay identifiable but become inactive with stock zero.
7. Publication rotates the opaque fence and completes the generation with
   stock/provenance and Alert resolution in one transaction. The existing web
   invalidation path refreshes consumer queries. Failure preserves the prior
   snapshot and updates source status/Alert atomically. Collection does not
   publish ABC grades.

Orders collected from one or many malls do not request a refresh by themselves.
Before the extension submits a generated file, the server persists an
organization-scoped Orders-owned idempotent transmission intent. An unresolved
intent protects that exact file from accidental resubmission; it does not read,
request, invalidate, or advance Inventory freshness. Only observed Sellpia
acceptance finalizes the intent. Explicit confirmed non-submission aborts it for
a safe retry, while an unknown result requires audited reconciliation. KidItem
does not pre-check local stock before upload. Sellpia validates the workbook,
and a rejection is shown with its provider error and no Inventory recovery
action. Inventory marks expired evidence stale; collection remains explicit,
including the existing purchase-preflight recovery action.

Internal operation links return to the screen that owns the action: mall
collection to `/order-collection`, channel order results to `/orders`, channel
inventory to `/inventory`, and inventory analysis to `/stock-ops`. This
navigation contract keeps those four active URLs independently reachable and
does not change the server-owned TTL, lease, fence, or single-writer rules.

Historical warning links such as `/stock-ops?tab=freshness` are compatibility
ingress: `/stock-ops` redirects them to the owning `/inventory-hub` workspace. The
independent `/stock-ops` route remains analysis-only and owns
`product-outflow` and `channel-zero`; compatibility ingress does not transfer
freshness ownership back to it.

Order transmission recovery renders in the existing generated-file flow on
`/order-collection`. It updates only that file's Orders-owned transmission
state and does not route the operator to Inventory synchronization.

Each explicit browser collection has a distinct generation even when content
matches. Its checksum still protects same-attempt replay. Attested manual
imports retain their existing file-hash duplicate/reverification contract;
that input-path rule is not a consumer's stock-selection policy.

## Manual Fallback And Attestation

Use manual import only when automatic collection cannot be restored promptly.

1. In Sellpia, generate a new full option-product Excel export immediately
   before the fallback.
2. Submit through the retained authenticated manual import endpoint
   `POST /api/inventory/sellpia-sync/import` with the explicit fresh-export
   attestation. The removed freshness drawer is not a supported entrypoint.
3. Wait for the same server validation, quality, publication and history path
   as browser collection; never bypass it with direct database writes.

The attestation records the authenticated actor and time. It does not bypass
file validation, quality thresholds, tenant scope, generation fencing, or the
single-writer rule. Never upload an old reference workbook merely to make the
status green.

## Recovery Matrix

| Failure | Safe recovery |
|---|---|
| Source binding unconfirmed | Owner/admin explicitly confirms only the fixed origin/account through the Inventory source action. Do not insert the state row manually. |
| `sellpia_login_required` | Sign in to the intended Sellpia account in Chrome, return to KidItem, and choose **다시 갱신**. Do not copy cookies to the server. |
| Extension absent | Load/re-enable `extensions/kiditem-os`, confirm it responds, then retry. |
| Extension outdated | Reload/update the worktree extension and confirm `sellpiaInventorySourceOwnerV1` before retrying. |
| `sellpia_download_contract_drift` | Stop automatic use. Inspect the fixed Sellpia JSON endpoint and response shape; update the extension contract with tests before retrying. Do not fall back to a blind click. |
| `sellpia_invalid_workbook` or HTML response | Automatic flow: confirm the fixed endpoint returned a complete versioned JSON snapshot. Manual recovery: confirm the file is a fresh XLS/XLSX/CSV full option-product export. Retry after login/session recovery. |
| Timeout/network failure | Confirm Chrome connectivity and the Sellpia page, then retry. Repeated failures may use the attested manual fallback. |
| Quality hard block | Compare the fresh export with the prior completed snapshot. Row loss or active-code loss of at least 30% is blocked. Correct the export/source issue and retry; never accept by editing rows. |
| Quality warning | Review missing name/barcode/price, duplicate barcode, 10–30% snapshot churn, and inactive confirmed-recipe references. Warnings are keyed by file hash and do not auto-change recipes. |
| Another attempt is running | Observe or resume that exact attempt; admission rejects competing collection. Closing a tab does not change its fixed expiry. |
| Attempt expired | Explicitly retry with a new attempt. The owner rejects expired or older terminal submissions; do not reuse a stale token. |
| Sellpia order workbook rejected | Show the exact Sellpia error. Correct the workbook/provider-side issue and retry; Sellpia performs order-level duplicate validation. Do not run Inventory synchronization as recovery. |
| Purchase blocked by `SELLPIA_SYNC_REQUIRED` | The purchase UI joins/requests automatic sync, waits for one fresh generation, and retries the exact submission once with the same idempotency key. This purchase rule does not apply to order workbook submission. |
| Purchase item inactive/reference invalid | Correct the purchase item or confirmed recipe. Do not retry automatically. |
| External submit is `provider_unknown` | Do not submit again. Inspect the provider outside KidItem, then use explicit `reconcileSubmission` with the authenticated actor and known outcome/reference. |

`provider_unknown` also covers an ambiguous timeout or a `prepared` attempt that
is still unresolved after 15 minutes. Reconciliation records what happened; it
must not trigger a second provider call.

## Safe Agent Actions

An agent may:

- read freshness/status/history and sanitized quality counts;
- verify extension version/capability and the presence of an authenticated
  Sellpia page without reading credential fields;
- explicitly start or resume collection and observe its owner attempt when
  authorized;
- run deterministic tests, builds, scanners, schema generation, and the guarded
  local data migration;
- inspect row counts, state transitions, and sanitized error codes;
- exercise Rocket preview because it has no submit side effect.

An agent must not:

- print, capture, persist, or transmit passwords, cookies, auth tokens, raw
  provider responses, raw snapshot contents, raw workbook contents, or
  workbook base64;
- attach a real workbook to Git, a PR, an issue, chat, fixture, dev-data bundle,
  screenshot, or log;
- edit `currentStock`, freshness rows, source runs, attempts, or confirmed
  recipes directly to clear an error;
- reuse a stale attempt token or bypass owner controls;
- retry an ambiguous provider submission or imply that a request proves
  external acceptance;
- call a Rocket marketplace provider or mutate Sellpia physical stock from the
  `0.1.21` internal confirmation/PA/workbook flow.

## Verification Commands

Run from the repository root. A disposable local `DATABASE_URL` and a
Docker-compatible runtime are required for the data and PostgreSQL gates.

```bash
rtk npm run db:push
rtk npx prisma generate
rtk npm exec --workspace=packages/shared vitest -- run
rtk npm run build --workspace=packages/shared
rtk npm run db:erd
rtk npm run test:scripts
rtk npm run data:migrate -- status
rtk npm run data:migrate -- up --target local --confirm APPLY_DATA_MIGRATIONS
rtk npm run data:migrate -- up --target local --confirm APPLY_DATA_MIGRATIONS
rtk npm run data:migrate -- status
rtk npm run check:schema-artifact-sync

rtk npm exec --workspace=apps/server vitest -- run src/inventory src/channels src/supply src/orders src/products src/analytics/sellpia-product-sales
rtk npm run test:integration --workspace=apps/server -- src/inventory/__tests__/sellpia-inventory-freshness.repository.pg.integration.spec.ts src/orders/__tests__/coupang-direct-order-collection.pg.integration.spec.ts
rtk npm run check:idor
rtk npm run check:tenant-scope
rtk npm run build --workspace=apps/server

rtk npm exec --workspace=apps/web vitest -- run
rtk npm run build --workspace=apps/web
rtk node --test extensions/tests/order-collector-sellpia-inventory.test.mjs extensions/tests/order-collector-rocket-sales-contract.test.mjs extensions/tests/order-collector-action-coverage.test.mjs extensions/tests/collection-focus-policy.test.mjs
rtk node --test scripts/__tests__/sellpia-authoritative-inventory-contract.test.mjs
rtk npm exec --workspace=apps/web vitest -- run src/app/\(orders\)/rocket-orders/lib/rocket-purchase-decision-boundary.spec.ts
```

Boot `rtk npm run dev:server` after backend changes, confirm Nest starts with
Inventory, Channels, and Supply wired, then stop only the server process started
for that check. Do not start a duplicate listener when a watch server is already
running.

## Blockers

Stop and report the exact blocker when:

- migration status is dirty or generated schema artifacts drift;
- the source origin/account or active organization cannot be established;
- extension/login recovery would require exposing credentials or session data;
- an automatic or manual import cannot prove a complete current export;
- a hard quality threshold fires and the source loss cannot be explained;
- a non-Inventory runtime path writes `SellpiaInventorySku.currentStock`;
- a purchase path bypasses the freshness fence or retries an ambiguous provider
  side effect;
- a Rocket path writes physical stock or couples finalized order transmission
  to an Inventory generation;
- a required test, scanner, build, migration rehearsal, or server boot fails.

## Final Report Format

Report only observed identifiers/counts. Never paste raw workbook/provider data.

```text
Release: <root VERSION>
Source binding: confirmed/unconfirmed (<fixed origin/account only>)
Freshness: <fresh|refresh_required|syncing|failed>; requested <n>; verified <n>
Collection: automatic/manual; <published|same_hash_verified|same_hash_confirmation_scheduled|failed>
Artifact: <sanitized file name or download-before-failure>; rows <count>
Quality: warnings <count>; hard block <yes/no>; previous snapshot preserved <yes/no>
Attempt: identity / idempotency / fixed-expiry / older-terminal rejection <executed or test-backed>
Order transmission independence: <no Inventory read/request/invalidation/action; executed or test-backed>
Purchase gate/retry/reconcile: <executed or test-backed>; provider calls <count or not invoked>
Rocket: transmission finalization boundary verified <yes/no>; Inventory generation not required <yes/no>; physical stock write not invoked
Automated gates: <exact commands and result>
Live Chrome checks: <safe observations only>
Blockers: <none or exact blocker>
```
