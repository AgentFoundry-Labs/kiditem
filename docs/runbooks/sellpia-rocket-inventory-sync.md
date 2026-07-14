# Sellpia Inventory And Rocket Read-Only Boundary

## Purpose

This runbook defines the release `0.1.8` operating boundary after the inventory
cutover:

- the latest completed Sellpia workbook is the only KidItem stock snapshot;
- `MasterProduct.currentStock` has no manual adjustment or ledger path;
- each marketplace SKU has an explicit `ChannelSkuComponent` recipe;
- channel `sellableStock` is a nullable read projection over that recipe;
- Rocket is a `ChannelAccount`, while Rocket purchase-order quantity decisions
  remain deferred and `/rocket-orders` is read-only.

For the two approved workbook uploads and matching workflow, use
[Import Sellpia And Wing Data And Match Channel SKUs](channel-sellpia-matching.md).

## Runtime Contract

```text
Sellpia complete workbook
  -> POST /api/inventory/sellpia-sync/import
  -> MasterProduct.currentStock full replacement
  -> /inventory, /inventory-hub, /stock-ops

ChannelSku + confirmed ChannelSkuComponent recipe
  -> GET /api/channels/sku-availability
  -> nullable sellableStock + component capacities + bottlenecks

Rocket order-collector extension
  -> listRocketPos
  -> /rocket-orders read-only summaries
  -> no confirm/reserve/generate/stock action
```

Marketplace option identity and pricing live on `ChannelListingOption`; there
is no internal `ProductOption` stock owner. Channel bundles have no separately
materialized stock and consume only the exact Sellpia component quantities
saved on that channel SKU.

## Preserved Operator Screens

| Route | Current responsibility |
|---|---|
| `/inventory` | Paginated latest Sellpia MasterProduct snapshot, summary, barcode print, and export. |
| `/inventory-hub` | Snapshot status, Sellpia import, import history, assets, channel availability, and procurement navigation. |
| `/stock-ops` | Sellpia/channel zero stock, bottlenecks, mapping attention, assets, freshness, and operation records. |
| `/product-hub/matching` | Account-scoped ChannelSku metadata import and exact component-recipe confirmation. |
| `/order-status-hub` | Order lines enriched with nullable channel SKU availability. |
| `/rocket-orders` | Read-only extension-collected Rocket PO summaries and pre-existing local file history. |

None of these routes may offer receive, issue, adjust, reserve, release,
restock, Rocket stock events, or a generic stock-ledger mutation.

## Record-Only Operations

- `StockTransfer` references `masterProductId` and records requested warehouse
  movement and status. Create/update/complete does not change currentStock.
- `PickingItem` is expanded from the order line's ChannelSku recipe and records
  pick/verify state. It does not deduct currentStock.
- `ReturnTransfer` references `masterProductId` and records condition,
  restocked/disposed quantities, and status. Those fields do not write the
  Sellpia snapshot.
- Sellpia receipt-upload batches record whether an external receipt file still
  needs upload/confirmation. They do not modify currentStock.

The next completed Sellpia full snapshot is what reflects any real-world stock
change after external warehouse or marketplace processing.

## Rocket Operation

1. Load `extensions/order-collector` in Chrome and sign in to
   `supplier.coupang.com`.
2. Open `/rocket-orders`.
3. Choose the ETA range and status, then click **불러오기**.
4. Review week/month/chart summaries and expand PO rows as needed.

The page does not collect SKU detail for confirmation, calculate delivery
quantity, generate/fill confirmation workbooks, reserve inventory, or call a
backend Rocket action route. Existing files already stored in browser IndexedDB
may be listed, downloaded, or deleted; that local history is not server truth
and does not imply the retired confirmation workflow is active.

Rocket account rules:

- use `ChannelAccount.channel = 'rocket'` for Rocket metadata;
- use `channel = 'coupang'` for Wing metadata;
- never infer either channel from the display name;
- never create a Rocket-only inventory balance or ledger;
- future PO decisions must resolve Rocket ChannelSkus, their exact component
  recipes, and the shared Sellpia-backed availability projection.

## Local Development Reset And Bootstrap

This section is destructive and is permitted only for the disposable local
development database. Never run it for staging, production, Supabase hosted
databases, or an ambiguous `DATABASE_URL`.

### After Pulling `develop`

1. Run `git pull` and `npm install --legacy-peer-deps`.
2. Confirm root `VERSION` is `0.1.8` and inspect `DATABASE_URL` with the guard
   below.
3. Rebuild the disposable local database with the reset/bootstrap sequence.
4. Restore the developer's membership with `sync-supabase-user.ts`.
5. Start KidItem, import Sellpia first, then import Wing metadata.
6. Confirm component recipes in `/product-hub/matching`; do not invent bundle
   quantities from product names.

Pulling code alone does not update the database. Staging and production use
the guarded GitHub Actions reconstruction workflow, never these local commands.

### Prerequisites

- Root `VERSION` is `0.1.8`.
- `DATABASE_URL` hostname is `localhost`, `127.0.0.1`, or `::1`.
- The database name does not contain `prod`, `production`, or `staging`.
- The approved workbook files remain outside git.
- Record the organization UUID, display name, login email, and any account UUIDs
  that must remain stable.

Run this guard before the reset. Continue only after it prints the intended
local host/database name:

```bash
rtk node --env-file=.env -e 'const u=new URL(process.env.DATABASE_URL); const local=new Set(["localhost","127.0.0.1","::1"]); const name=decodeURIComponent(u.pathname.slice(1)); if(!local.has(u.hostname)||!name||/(prod|production|staging)/i.test(name)) throw new Error("refusing non-local database"); console.log(`${u.hostname}/${name}`)'
```

Reset the schema, regenerate Prisma, and create only the organization plus one
Wing and one Rocket account:

```bash
rtk npx prisma db push --force-reset
rtk npx prisma generate
rtk npm run build --workspace=packages/shared
rtk npm run inventory:bootstrap:dev -- \
  --organization-id <organization-uuid> \
  --organization-name "<organization-name>" \
  --organization-slug <organization-slug> \
  --coupang-account-id <optional-stable-wing-account-uuid> \
  --rocket-account-id <optional-stable-rocket-account-uuid>
```

`scripts/bootstrap-authoritative-inventory-dev.ts` independently refuses a
non-local host or a database name containing production/staging markers. It
does not create users, memberships, inventory rows, mappings, or sample stock.
Omit either optional account-ID pair of arguments when a stable UUID is not
needed.

Release `0.1.8` has no durable data-migration script. Do not run
`npm run data:migrate` as a substitute for this local reconstruction.

Restore the authenticated user's local mirror and active membership after the
organization exists:

```bash
rtk npx tsx scripts/sync-supabase-user.ts \
  --email <supabase-login-email> \
  --organizationId <organization-uuid> \
  --role admin
```

Then start the app, upload Sellpia first and Wing second, and verify the clean
baseline:

| Imported data | Expected |
|---|---:|
| MasterProduct | 1,964 |
| ChannelProduct | 1,225 |
| ChannelSku | 2,241 |
| Skipped Wing rows | 3 |
| Initial ChannelSkuComponent | 0 |

The bootstrap creates an active Rocket account as channel metadata only. It
does not import Rocket catalog data or enable PO decisions.

## Forbidden Actions

- Do not run the reset/bootstrap sequence against staging or production.
- Do not edit currentStock directly or restore legacy Inventory,
  StockTransaction, Rocket inventory ledger, reserve/release, receive/issue,
  or manual adjustment paths.
- Do not treat transfer, picking, return, receipt-batch, shipment-file, or PO
  status changes as stock writes.
- Do not restore `ProductOption` stock fields or product bundle capacity; those
  fields/behaviors are outside the current schema.
- Do not substitute `sellableStock = 0` when a ChannelSku is unmapped. Null is
  the required result until the complete recipe is confirmed.
- Do not restore `/api/orders/rocket/*` preview, fill, generate, commit, or
  inventory-event endpoints.

## Verification

Check the runtime boundaries after import:

- `/inventory` shows 1,964 Sellpia rows from the latest completed run;
- `/inventory-hub` history and asset totals use the same snapshot;
- `/stock-ops` separates Sellpia zero, channel capacity zero, and null mapping
  attention;
- an 8-unit recipe returns `floor(currentStock / 8)`;
- a mixed recipe reports the minimum capacity and bottleneck components;
- transfer/picking/return record changes leave MasterProduct currentStock
  unchanged;
- `/rocket-orders` performs extension reads only;
- no Rocket confirm or inventory mutation controller is registered.

Focused checks:

```bash
rtk npm exec --workspace=apps/server vitest -- run src/inventory src/channels src/orders
rtk npm exec --workspace=apps/web vitest -- run 'src/app/(inventory)' 'src/app/(orders)/order-status-hub' 'src/app/(orders)/return-scan' 'src/app/(orders)/rocket-orders/lib/rocket-purchase-decision-boundary.spec.ts'
rtk npm run test:scripts
rtk npm run check:conventions
```

## Blockers

Stop and report when:

- the reset guard does not print the intended local database;
- `VERSION` is not `0.1.8`;
- organization/account/user membership metadata cannot be reconstructed;
- approved workbook counts differ from 1,964 / 1,225 / 2,241 / 3;
- a non-Sellpia path writes currentStock;
- a Rocket preview/confirm/reserve/generate path is still callable;
- a required test, build, or server boot fails.

## Final Report Format

```text
Release: 0.1.8
Database reset: local <host>/<database> only
Bootstrap: organization + coupang/rocket ChannelAccounts + membership restored
Sellpia import: 1964 MasterProducts
Wing import: 1225 ChannelProducts / 2241 ChannelSkus / 3 skipped
Inventory authority: completed Sellpia snapshot only
Record-only operations verified: transfer / picking / return
Rocket boundary: read-only; PO decision deferred
Blockers: <none or exact blocker>
```
