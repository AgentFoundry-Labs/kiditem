# Sellpia Inventory Freshness Operations

This is the authoritative operator runbook for Sellpia inventory freshness in
release `0.1.19`. Sellpia is the stock source of truth. KidItem publishes only a
validated full option-product export and never guesses, reserves, increments,
or decrements `MasterProduct.currentStock` from an order or purchase action.

## Prerequisites

- Repository root `VERSION` is exactly `0.1.19`.
- Prisma schema and durable data migration
  `v0.1.19:001_sellpia_inventory_freshness` are applied.
- NestJS and the web app are running, with exactly one backend listener on port
  4000 during local verification.
- The operator is signed in to the intended KidItem organization and to
  `https://kiditem.sellpia.com` in Chrome.
- `extensions/order-collector` version `0.1.67` or newer is loaded and its ping
  advertises `collectSellpiaInventory: true`.
- The organization has confirmed the fixed source binding:
  `https://kiditem.sellpia.com` / `kiditem`. Only an owner or admin can confirm
  it. The authenticated organization and user come from the KidItem session;
  they are never accepted from a request body.

Do not continue when the Chrome session belongs to a different Sellpia account
or the KidItem organization is ambiguous.

## State And Ownership

`SellpiaInventoryState` is one organization-scoped row. Inventory alone owns
freshness derivation, the browser claim lease, publication, and the opaque
`freshnessFence`.

| State | Meaning | Operator action |
|---|---|---|
| `fresh` | A completed full snapshot was verified less than 10 minutes ago and no newer generation is pending. | Continue normal work. |
| `refresh_required` | There is no verified snapshot, the 10-minute TTL elapsed, or a newer generation was requested. | Leave an authenticated KidItem tab open; automatic coordination claims it when due. |
| `syncing` | One user owns a live 90-second claim lease. | Other tabs join and observe. Only the owner may cancel. |
| `failed` | The requested generation failed after the last verified generation. | Open the freshness drawer, correct the typed failure, and choose **다시 갱신**. |

Exactly 10 minutes is stale. The server owns TTL, generation, lease, settle,
and confirmation clocks. Public generation values are decimal strings even
though persistence uses `BigInt`.

The previous completed snapshot remains the current stock basis during every
refresh request, download, validation failure, quality block, lease loss, or
provider ambiguity. A failed attempt does not publish partial rows.

## One-Time Source Binding

1. Open an authenticated KidItem operations screen and use the floating
   Sellpia freshness status. `/product-hub/matching` displays the same shared
   status inline. The dedicated sync entry is
   `/inventory-hub?tab=sellpia-sync`.
2. Confirm that the drawer shows origin `https://kiditem.sellpia.com` and
   account `kiditem`.
3. As an owner or admin, choose **출처 연결 확인**.
4. Confirm the state becomes claimable. Do not edit the database to create or
   change a binding.

## Normal Automatic Flow

1. The web coordinator polls the organization freshness state every 15
   seconds. Multiple KidItem tabs use a per-organization browser lock and the
   server's atomic claim, so only one tab can own the collection.
2. When a request is due, the winner claims a 90-second lease and sends a
   heartbeat every 20 seconds. Other tabs receive the same `syncing` state but
   cannot control the claim.
3. The extension uses the already authenticated Chrome session. It loads
   `product_list_total.html` without stealing focus, verifies the fixed form
   contract, selects option products (`downopt=2`) in the request, and posts
   directly to `product_search.down.html`. It does not click the visible
   download button.
4. The extension rejects login HTML, wrong origin/path, changed form contract,
   unsupported workbook envelopes, oversized data, and timed-out/network
   responses before returning bytes to the KidItem tab.
5. The authenticated KidItem tab uploads the collected workbook to
   `POST /api/inventory/sellpia-sync/import` with its claim token, generation,
   trigger, and fixed source identity.
6. Inventory validates the file and headers, parses the full option-product
   snapshot, evaluates bounded quality evidence, and publishes in one fenced
   transaction. Known product codes absent from a valid new snapshot stay
   identifiable but become inactive with stock zero.
7. Publication rotates the opaque fence, completes the generation, invalidates
   stock/history queries, and updates the compact status. File imports and
   pre-download collection failures appear in the same history.

Orders collected from one or many malls do not request a refresh by themselves.
Only a successful Sellpia transmission request schedules
`order_transmission_requested`. The server waits two minutes for Sellpia to
settle and coalesces later successful transmissions, capped at five minutes
from the first pending request. A successful extension request means only that
transmission was requested; the later Sellpia snapshot is the acceptance and
stock evidence.

Internal operation links return to the screen that owns the action: mall collection to
`/order-collection`, channel order results to `/orders`, channel inventory to
`/inventory`, and inventory warnings to `/stock-ops`. This navigation contract
does not change the server-owned TTL, lease, fence, or single-writer rules.

An identical workbook is not republished. The first post-order identical hash
schedules one `same_hash_confirmation` at least three minutes later. The next
identical download verifies the generation; it does not create a third loop.
Normal TTL/manual verification of an unchanged file verifies the existing run
without stock mutation.

## Manual Fallback And Attestation

Use manual import only when automatic collection cannot be restored promptly.

1. In Sellpia, generate a new full option-product Excel export immediately
   before the fallback.
2. Open the freshness drawer, choose the file under **수동 파일 가져오기**,
   and check **이 파일이 방금 Sellpia에서 내보낸 최신 재고 파일임을
   확인합니다**.
3. Submit and wait for the same server validation, quality, publication, and
   history path as an automatic import.

The attestation records the authenticated actor and time. It does not bypass
file validation, quality thresholds, tenant scope, generation fencing, or the
single-writer rule. Never upload an old reference workbook merely to make the
status green.

## Recovery Matrix

| Failure | Safe recovery |
|---|---|
| Source binding unconfirmed | Owner/admin confirms only the fixed origin/account in the drawer. Do not insert the state row manually. |
| `sellpia_login_required` | Sign in to the intended Sellpia account in Chrome, return to KidItem, and choose **다시 갱신**. Do not copy cookies to the server. |
| Extension absent | Load/re-enable `extensions/order-collector`, confirm it responds, then retry. |
| Extension outdated | Reload/update to version `0.1.67` or newer and confirm the collection capability before retrying. |
| `sellpia_download_contract_drift` | Stop automatic use. Inspect the Sellpia form action/method and option-product/export fields; update the extension contract with tests before retrying. Do not fall back to a blind click. |
| `sellpia_invalid_workbook` or HTML response | Confirm the response is a real XLS/XLSX full option-product file from the fixed origin. Retry after login/session or Sellpia export recovery. |
| Timeout/network failure | Confirm Chrome connectivity and the Sellpia page, then retry. Repeated failures may use the attested manual fallback. |
| Quality hard block | Compare the fresh export with the prior completed snapshot. Row loss or active-code loss of at least 30% is blocked. Correct the export/source issue and retry; never accept by editing rows. |
| Quality warning | Review missing name/barcode/price, duplicate barcode, 10–30% snapshot churn, and inactive confirmed-recipe references. Warnings are keyed by file hash and do not auto-change recipes. |
| Another tab owns the lease | Wait and observe. Only `activeSync.canControl` may cancel. Closing the owner tab stops its heartbeat; the claim becomes reclaimable only after server expiry. |
| Lease lost or expired | Let the current worker stop. After expiry a new tab may claim the pending generation. Never reuse a stale token. |
| Purchase blocked by `SELLPIA_SYNC_REQUIRED` | The purchase UI joins/requests automatic sync, waits for one fresh generation, and retries the exact submission once with the same idempotency key. |
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
- request or join a refresh, observe a lease, and owner-cancel when explicitly
  authorized;
- run deterministic tests, builds, scanners, schema generation, and the guarded
  local data migration;
- inspect row counts, state transitions, and sanitized error codes;
- exercise Rocket preview because it has no submit side effect.

An agent must not:

- print, capture, persist, or transmit passwords, cookies, auth tokens, raw
  provider responses, raw workbook contents, or workbook base64;
- attach a real workbook to Git, a PR, an issue, chat, fixture, dev-data bundle,
  screenshot, or log;
- edit `currentStock`, freshness rows, source runs, attempts, or confirmed
  recipes directly to clear an error;
- reuse a stale claim token, bypass owner controls, or cancel another user's
  lease;
- retry an ambiguous provider submission or imply that a request proves
  external acceptance;
- enable Rocket confirmation, reservation, workbook generation, provider
  submit, or stock mutation in release `0.1.19`.

## Verification Commands

Run from the repository root. A disposable local `DATABASE_URL` and a
Docker-compatible runtime are required for the data and PostgreSQL gates.

```bash
rtk npm run db:push
rtk npx prisma generate
rtk npm exec --workspace=packages/shared vitest -- run
rtk npm run build --workspace=packages/shared
rtk npm run db:erd
rtk npm run graphify:schema
rtk npm run test:scripts
rtk npm run data:migrate -- status
rtk npm run data:migrate -- up --target local --confirm APPLY_DATA_MIGRATIONS
rtk npm run data:migrate -- up --target local --confirm APPLY_DATA_MIGRATIONS
rtk npm run data:migrate -- status
rtk npm run check:schema-artifact-sync

rtk npm exec --workspace=apps/server vitest -- run src/inventory src/channels src/supply
rtk npm run test:integration --workspace=apps/server -- src/inventory/__tests__/sellpia-inventory-freshness.repository.pg.integration.spec.ts src/inventory/__tests__/sellpia-inventory-import.repository.pg.integration.spec.ts src/inventory/__tests__/inventory-sku-snapshot-list.repository.pg.integration.spec.ts src/channels/__tests__/channel-sku-mapping.pg.integration.spec.ts src/channels/__tests__/rocket-po-catalog.repository.pg.integration.spec.ts src/supply/__tests__/purchase-order-submission.pg.integration.spec.ts
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

- `VERSION` is not `0.1.19`, migration status is dirty, or generated schema
  artifacts drift;
- the source origin/account or active organization cannot be established;
- extension/login recovery would require exposing credentials or session data;
- an automatic or manual import cannot prove a complete current export;
- a hard quality threshold fires and the source loss cannot be explained;
- a non-Inventory runtime path writes `MasterProduct.currentStock`;
- a purchase path bypasses the freshness fence or retries an ambiguous provider
  side effect;
- Rocket exposes any actual confirmation/submission/reservation/stock action;
- a required test, scanner, build, migration rehearsal, or server boot fails.

## Final Report Format

Report only observed identifiers/counts. Never paste raw workbook/provider data.

```text
Release: 0.1.19
Source binding: confirmed/unconfirmed (<fixed origin/account only>)
Freshness: <fresh|refresh_required|syncing|failed>; requested <n>; verified <n>
Collection: automatic/manual; <published|same_hash_verified|same_hash_confirmation_scheduled|failed>
Artifact: <sanitized file name or download-before-failure>; rows <count>
Quality: warnings <count>; hard block <yes/no>; previous snapshot preserved <yes/no>
Lease: owner-only control / heartbeat / expiry-reclaim evidence <executed or test-backed>
Order settle/coalescing: <executed or test-backed>
Purchase gate/retry/reconcile: <executed or test-backed>; provider calls <count or not invoked>
Rocket: preview-only boundary verified <yes/no>; provider submit not invoked
Automated gates: <exact commands and result>
Live Chrome checks: <safe observations only>
Blockers: <none or exact blocker>
```
