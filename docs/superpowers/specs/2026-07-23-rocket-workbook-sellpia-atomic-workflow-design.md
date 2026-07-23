# Rocket Workbook and Sellpia Atomic Workflow Design

## Decision

The Coupang Rocket workflow does not expose or calculate an inventory
commitment or an `availableStock` balance. Operators create a Coupang workbook
from the latest Sellpia `currentStock`, upload it to Coupang, collect the
resulting confirmed orders, transmit those orders to Sellpia, and wait for a
new Sellpia inventory generation before creating another workbook.

This is not a distributed ACID transaction. Coupang upload, order collection,
Sellpia transmission, and inventory refresh cross external systems and include
a manual operator step. KidItem provides equivalent operational safety through
one durable, serialized workflow with idempotent retries and a generation
fence.

This design replaces the Rocket-specific confirmation and commitment behavior
on PR #361. It does not remove the common `InventoryCommitment` capability from
unrelated domains.

## Goals

- Use the operator's real action name: `쿠팡 엑셀 다운로드`.
- Keep Sellpia `currentStock` as the only stock quantity shown in Rocket.
- Prevent one workbook from counting the same Sellpia SKU stock more than once.
- Allow the exact generated workbook to be downloaded repeatedly.
- Prevent a new workbook from using stale stock while the previous workbook's
  confirmed orders are still being reflected in Sellpia.
- Make every external step retryable without duplicating Coupang orders or
  Sellpia transmission.
- Preserve the existing Rocket calendar, PO list, chart, matching links, edit
  panel, and workbook history UI.

## Non-Goals

- A distributed transaction across KidItem, Coupang, and Sellpia.
- A Rocket-specific inventory reservation ledger.
- Displaying `activeCommitmentQuantity` or `availableStock` in Rocket.
- Deleting common commitment models or availability APIs used by other domains.
- Automatically uploading the generated workbook to Coupang.
- Allowing multiple unresolved Rocket workbook workflows for one organization.

## Operator Flow

```text
latest Sellpia inventory generation
  -> Rocket preview from currentStock
  -> operator reviews quantities and shortage reasons
  -> Coupang workbook generated and downloaded
  -> operator uploads workbook to Coupang
  -> Coupang confirmed orders collected
  -> collected orders transmitted to Sellpia
  -> Sellpia inventory refreshed
  -> newer verified inventory generation observed
  -> next new workbook becomes available
```

The same generated workbook remains downloadable throughout and after this
workflow. A repeated download does not recalculate quantities, create another
workflow, or transmit another order.

## Serialization Boundary

KidItem permits at most one non-terminal Rocket workbook workflow per
organization because the organization's Rocket accounts consume the same
Sellpia inventory source.

The workflow gate applies only to creating a **new** workbook. It does not block:

- previewing the already selected saved collection;
- reviewing or fixing product and inventory mappings;
- retrying order collection, Sellpia transmission, or inventory refresh;
- downloading the exact workbook artifact already stored in history.

Before starting a new workflow, the server acquires the organization-scoped
Rocket workflow lock and verifies both conditions:

1. no earlier Rocket workbook workflow is non-terminal;
2. the Sellpia inventory generation is fresh and verified.

## Workflow States

The UI projects `ready` when no non-terminal workflow exists. A stored workflow
uses the remaining operator-facing states rather than inventory commitment
terminology:

- `awaiting_coupang_confirmation`: workbook stored and downloadable while the
  operator uploads it and Coupang processes it;
- `orders_collected`: matching confirmed Coupang orders have been collected;
- `sellpia_transmitting`: collected orders are being sent through the existing
  idempotent Sellpia transmission lane;
- `awaiting_inventory_sync`: Sellpia accepted the orders and KidItem is waiting
  for a newer verified inventory generation;
- `completed`: the post-transmission Sellpia generation is verified and the
  next workbook may be generated;
- `failed`: the current step needs retry or reconciliation; a new workbook
  remains blocked.

An abandoned workbook cannot be silently discarded. Before an operator can
close it, KidItem must run Coupang collection reconciliation and prove that no
matching confirmed order exists. This avoids opening the gate while an uploaded
workbook is merely waiting to be collected.

## Preview and Allocation

Rocket preview reads recipe components from confirmed product mappings and
reads physical quantities from one fresh Sellpia generation. It does not read
or subtract active commitments.

Within one preview/export calculation, the server creates an in-memory map:

```text
remainingStock[sellpiaInventorySkuId] = currentStock
```

Rows are processed in stable ETA, PO, and line order. For each row, the maximum
variant quantity is the minimum component capacity:

```text
rowCapacity = min(floor(remainingStock[sku] / unitsPerVariant))
exportQuantity = min(requestedQuantity, operatorQuantity, rowCapacity)
remainingStock[sku] -= exportQuantity * unitsPerVariant
```

This is calculation-local stock consumption, not a stored reservation. It only
prevents two lines in the same workbook from independently using the same
physical units.

Mapping, missing recipe, inactive component, and stale-inventory blockers still
prevent workbook generation. A recipe-backed insufficient-stock row may use a
smaller quantity with an explicit controlled shortage reason.

## Workbook Artifact and History

`쿠팡 엑셀 다운로드` performs a final server revalidation under the Rocket
workflow lock, persists an immutable workbook export snapshot, stores the exact
generated file, and returns that file.

The durable record is a workbook export, not proof that Coupang accepted an
order and not an inventory reservation. It records:

- organization and Rocket channel account;
- source import run and Sellpia generation;
- operator and generated time;
- immutable line quantities, shortage reasons, mapping identity, and recipe
  evidence used to produce the file;
- workflow state and external-step attempt metadata;
- stored workbook artifact identity.

The existing confirmation tables may retain their physical table names for a
compatible transition, but application, API, and UI terminology must use
workbook export semantics. No Rocket export creates, replaces, settles, or
releases an `InventoryCommitment`.

## Order Collection and Sellpia Synchronization

Order collection matches a workbook export line by organization, Rocket
account, PO number, product number, and barcode evidence when both sides provide
it. Collection persists orders and advances the workflow in the same local
transaction. The workflow reaches `orders_collected` only after every positive
workbook line expected to become a Coupang order has been collected; zero-
quantity lines are not awaited.

Sellpia transmission uses a caller-stable idempotency key per collected order.
Provider or browser failure keeps the workflow non-terminal and retryable; it
does not create a second transmission intent.

After all matching orders are accepted by Sellpia, KidItem requests a fresh
inventory generation. The workflow completes only after a verified generation
newer than the export generation is observed. Until then, a new Rocket workbook
remains blocked even though the previously generated artifact may still be
downloaded.

## UI Contract

The Rocket edit table shows:

- PO and product identity;
- requested quantity;
- Sellpia current stock;
- workbook quantity;
- shortage reason;
- mapping/configuration state and Product Hub resolution link.

It does not show `약정` or `가용재고` columns.

The primary action is `쿠팡 엑셀 다운로드`. While another workflow is active,
the action explains the current step using plain states such as:

- `쿠팡 업로드·발주확정 대기`;
- `주문수집 완료`;
- `Sellpia 반영 중`;
- `재고 동기화 대기`;
- `재고 동기화 실패 — 다시 시도`.

Workbook history distinguishes `동일 파일 다시 다운로드` from creating a new
workbook. Re-download is always tied to the stored artifact and never performs
a new stock calculation.

## Error and Recovery Rules

- Stale or failed Sellpia inventory refresh blocks new workbook generation.
- Mapping and recipe drift between preview and download returns the relevant
  row blockers and requires recalculation.
- Coupang collection failure retries collection without changing the workbook.
- Sellpia transmission failure retries the same transmission intent.
- Inventory refresh failure retains `awaiting_inventory_sync` or `failed` and
  keeps the new-workbook gate closed.
- A repeated request with the same idempotency key and normalized input returns
  the same workbook export; different input with the same key is a conflict.
- No failure path silently converts missing data into zero stock.

## Compatibility and Scope

- Existing `/rocket-orders` presentation and Product Hub deep links remain.
- Rocket preview and workbook DTOs remove commitment-facing fields.
- Generic Inventory availability and commitment capabilities remain available
  to other domains until separately redesigned.
- Rocket-specific scoped `AGENTS.md` contracts, PR body, and PR comments must be
  updated to describe workbook serialization instead of capacity reservation.
- Physical schema compatibility should be preserved where possible through
  mapped logical names. Any required schema change follows the repository's
  `db:push`, Prisma generation, shared build, and release-decision rules.

## Verification

Domain tests must prove:

- two lines sharing a component cannot exceed one `currentStock` snapshot;
- pack and multi-component recipes consume `remainingStock` correctly;
- Rocket calculations ignore common active commitments;
- a non-terminal workflow blocks a new workbook;
- an existing artifact remains repeatedly downloadable while blocked;
- idempotent export requests return the same artifact;
- order collection advances only the matching organization/account/export;
- Sellpia transmission is not duplicated on retry;
- completion requires a verified generation newer than the export generation;
- a failed external step remains retryable and keeps the gate closed;
- stale inventory, mapping drift, and recipe drift block export;
- Rocket UI contains no commitment/available-stock terminology and preserves
  the existing calendar, list, chart, matching, and history surfaces.

Integration tests must cover the local transaction boundaries for workflow
creation, order collection advancement, transmission intent creation, and
generation-fenced completion. Frontend tests must cover the action labels,
workflow-state messages, disabled new-export behavior, and repeated-download
path.

## Accepted Trade-off

Serializing Rocket workbook workflows reduces concurrency. That is intentional:
the operational process is linear, and the simpler gate is easier to observe
and recover than hidden per-SKU reservations created before KidItem can know
whether the operator uploaded the workbook to Coupang.
