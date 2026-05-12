# sourcing — Owner Domain

Sourcing owns Chinese new-product discovery — scraper ingest from 1688 /
Alibaba, the `SourcingCandidate` inbox, and the candidate → master promotion
handoff. Supplier registry, master-supplier policy, and purchase-order
procurement live in `supply/` (extracted during issue #192 follow-up Track A
PR 1). `supplier-payments` lives in `finance/`.

Sourcing scrape/agent and products-catalog boundaries use application ports and
outgoing adapters.

## Public Routes

| Capability | Route |
|---|---|
| extension ingest + scrape | `/api/sourcing/extension/*`, `/api/sourcing/scrape-url` |
| sourcing candidate detail | `GET /api/sourcing/:id` |
| candidate promotion | `POST /api/sourcing/candidates/:id/promote` |
| candidate rejection | `POST /api/sourcing/candidates/:id/reject` |

Route shape is frozen.

## Layout

```text
sourcing/
  sourcing.module.ts
  adapter/in/http/        sourcing candidate ingest + scrape + promote/reject controllers + DTOs
  adapter/out/agent/      SOURCING_AGENT_GATEWAY_PORT implementation
  adapter/out/products/   products catalog port adapter
  adapter/out/repository/ SOURCING_CANDIDATE_REPOSITORY_PORT adapter
  application/port/out/   agent gateway + products catalog + candidate repo ports
  application/service/    sourcing, sourcing-promotion services
  __tests__/
```

## Boundary Rules

- `/api/sourcing/scrape-url` delegates to Agent OS through
  `SOURCING_AGENT_GATEWAY_PORT.scrapeUrl`. `SourcingService` must not inject
  Agent OS services or runtime adapters directly.
- Sourcing extension ingest writes `SourcingCandidate` + `CandidateImage`
  rows via `SOURCING_CANDIDATE_REPOSITORY_PORT`. **`MasterProduct` is no
  longer written by sourcing ingest**.
- Cross-domain `MasterProduct` creation flows through
  `SOURCING_PRODUCTS_CATALOG_PORT.promoteCandidate` (Task 3 신설) —
  promotion is the only sourcing call site of products domain creation.
- After promotion, `SourcingPromotionService` (Task 3) fires
  `SOURCING_AGENT_GATEWAY_PORT.notifyPromoted` which delegates to ai
  domain's `POST_PROMOTION_AI_TRIGGER_PORT`. Sourcing has no knowledge of
  AI payload shape.
- Supplier registry, `MasterSupplierProduct` policy, and `PurchaseOrder`
  mutation belong to `supply/` (extracted during issue #192 follow-up Track A
  PR 1). Sourcing must not reintroduce supplier/procurement controllers,
  services, or DTOs. Cross-domain attach (PR 2) flows through a
  `SUPPLY_ATTACH_PORT`, not direct service injection.

## Contracts

- `GET /api/sourcing/:id` uses `findFirst({ id, organizationId, isDeleted: false })` on `SourcingCandidate`; miss is 404.
- `GET /api/sourcing/extension/products` returns paginated, organization-scoped `SourcingCandidate` rows where `status='sourced'`.
- Extension ingest is idempotent by `{ sourceUrl, organizationId, status='sourced', isDeleted=false }`. Re-scrape of a URL whose existing candidate is `promoted` or `rejected` creates a new `sourced` row (re-source intent).
- Promotion is atomic: `SourcingPromotionService.promote` opens a single
  `prisma.$transaction` that (1) tenant-scoped `findFirst` pre-checks the
  candidate, (2) `SELECT ... FOR UPDATE` row-locks via tagged-template
  `$queryRaw` (no `$queryRawUnsafe`), (3) delegates master+options+images
  creation to `SOURCING_PRODUCTS_CATALOG_PORT.promoteCandidate(tx, ...)`, and
  (4) flips the candidate row to `status='promoted' + promotedMasterId=<new>`.
  The row lock enforces 1:1 in current use-case while the D2 schema permits
  the future N:1 case (multiple candidates → one master).
- Promotion fires `SOURCING_AGENT_GATEWAY_PORT.notifyPromoted` after commit;
  failures are absorbed by the gateway (`OperationAlert`) so the HTTP path
  always reports the promotion outcome. `body.skipPostPromotionHooks=true`
  bypasses the AI trigger (ops escape hatch).
- Rejection sets `status='rejected', rejectedAt=now(), rejectedReason,
  rejectedByUserId` (D3). The candidate row is preserved; image rows stay
  attached for audit.
- Promote/reject from non-`sourced` states is 422 UnprocessableEntity; a
  concurrent promoter that wins the row lock surfaces as 409 Conflict to the
  loser.
- `/api/purchase-orders` keeps the legacy single POST action body
  (`create | updateStatus | delete`).
- Purchase-order status order is
  `draft -> pending -> ordered -> shipped -> received`; delete is allowed only
  from `draft` or `pending`.
- Supplier read/update/delete is tenant-scoped by `{ id, organizationId }`.

## Hard Bans

- Direct Agent OS injection from `application/service/**`.
- `findUnique({ where: { id } })` for supplier or purchase-order access.
- Direct import of products services from application services.
- Raw `master_products` INSERT from sourcing; code issuance belongs to products.
- Raw `master_products` INSERT/UPDATE from sourcing ingest — sourcing now writes `sourcing_candidates` only.
- Direct mutation of supply/ domain models (`Supplier`, `MasterSupplierProduct`,
  `PurchaseOrder`) or services from sourcing application services. PR 2 introduces
  `SUPPLY_ATTACH_PORT` for cross-domain attach; until then sourcing's promotion
  path stops at `SOURCING_PRODUCTS_CATALOG_PORT.promoteCandidate` (products
  domain only).
- Reintroducing supplier/procurement controllers, services, DTOs, or `supply.prisma`
  model mutations under `sourcing/`.

## Verification

```bash
git diff --check
npm exec --workspace=apps/server -- vitest run src/sourcing
npm run check:idor
npm run check:tenant-scope
npm run build --workspace=apps/server
npm run dev:server
```
