# sourcing — Owner Domain

Sourcing owns Chinese new-product discovery — scraper ingest from 1688 /
Alibaba, the `SourcingCandidate` inbox, and the candidate → master promotion
handoff. Supplier registry, master-supplier policy, and purchase-order
procurement live in `supply/`. `supplier-payments` lives in `finance/`.

Sourcing scrape/agent and products-catalog boundaries use application ports and
outgoing adapters.

## Public Routes

| Capability | Route |
|---|---|
| extension ingest + scrape | `/api/sourcing/extension/*`, `/api/sourcing/scrape-url` |
| manual product registration | `POST /api/sourcing/product-registration` |
| product generation | `POST /api/sourcing/product-generation` |
| sourcing candidate detail | `GET /api/sourcing/:id` |
| candidate inbox delete | `DELETE /api/sourcing/candidates/:id` |
| candidate promotion | `POST /api/sourcing/candidates/:id/promote` |
| candidate rejection | `POST /api/sourcing/candidates/:id/reject` |

Route shape is frozen.

## Layout

```text
sourcing/
  sourcing.module.ts
  adapter/in/http/        route-family controllers: extension ingest/scrape, candidate workspace + DTOs
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
  `SOURCING_PRODUCTS_CATALOG_PORT.promoteCandidate`; promotion is the only
  sourcing call site of products domain creation.
- Cross-domain AI workspace archival flows through `AI_WORKSPACE_ARCHIVE_PORT`.
  Sourcing owns the delete command and candidate row, but AI owns detail-page,
  thumbnail, and content asset archive rules.
- After promotion, `SourcingPromotionService` fires
  `SOURCING_AGENT_GATEWAY_PORT.notifyPromoted` which delegates to ai
  domain's `POST_PROMOTION_AI_TRIGGER_PORT`. Sourcing has no knowledge of
  AI payload shape.
- Product generation starts in sourcing because sourcing owns
  `SourcingCandidate` creation. `POST /api/sourcing/product-generation`
  creates the manual candidate, then delegates AI work through
  `SOURCING_AGENT_GATEWAY_PORT.startProductGeneration`, which maps to the AI
  domain's product-generation inbound port. Sourcing must not inject detail-page
  or thumbnail services directly.
- Supplier registry, `MasterSupplierProduct` policy, and `PurchaseOrder`
  mutation belong to `supply/`. Sourcing must not reintroduce supplier or
  procurement controllers, services, or DTOs. Cross-domain attach flows through
  `SUPPLY_ATTACH_PORT`, not direct service injection.

## Contracts

- `GET /api/sourcing/:id` uses
  `findFirst({ id, organizationId, isDeleted: false })`; miss is 404.
- `GET /api/sourcing/extension/products` returns paginated, organization-scoped
  `SourcingCandidate` rows where `status='sourced'`; without an explicit
  platform filter, the collected-product inbox includes imported sourcing
  platforms (`ALIBABA_1688`, `ALIBABA`) and manual product registration
  candidates (`KIDITEM_PRODUCT_REGISTRATION`). Product-less detail-generation
  outputs are direct registration workspaces, not collected-product candidates.
  It continues to exclude KidItem-generated thumbnail-only workspaces.
- `DELETE /api/sourcing/candidates/:id` archives an active sourced workspace in
  one transaction: `SourcingCandidate`, `CandidateImage`, candidate-bound
  `ContentGeneration`, `DetailPageArtifact`, `ContentAsset`, and
  `ThumbnailGeneration` become inactive. It does not delete promoted
  `MasterProduct`, product images, channel listings, orders, inventory, or
  finance data.
- Storage objects are not deleted inline with the HTTP request. Physical object
  deletion belongs to a retention/GC path that re-checks active storage-key
  references before calling storage delete.
- Extension ingest is idempotent by
  `{ sourceUrl, organizationId, status='sourced', isDeleted=false }`.
- Re-scraping a promoted or rejected URL creates a new `sourced` row.
- Promotion is atomic: `SourcingPromotionService.promote` opens a single
  `prisma.$transaction` that (1) tenant-scoped `findFirst` pre-checks the
  candidate, (2) `SELECT ... FOR UPDATE` row-locks via tagged-template
  `$queryRaw` (no `$queryRawUnsafe`), (3) delegates master+options+images
  creation to `SOURCING_PRODUCTS_CATALOG_PORT.promoteCandidate(tx, ...)`, and
  (4) flips the candidate row to `status='promoted' + promotedMasterId=<new>`.
  The row lock enforces 1:1 in the current use case while the schema still
  permits future N:1 promotion.
- Promotion may receive registration selections in the existing command body:
  `selectedThumbnailUrl` becomes the promoted master's primary image, and
  `selectedDetailPageGenerationId` / `selectedDetailPageArtifactId` attaches
  the chosen `DetailPageArtifact` to the new master. Do not add a
  `RegistrationDraft` table for this pre-submit choice.
- Promotion fires `SOURCING_AGENT_GATEWAY_PORT.notifyPromoted` after commit;
  failures are absorbed by the gateway (`OperationAlert`) so the HTTP path
  always reports the promotion outcome. `body.skipPostPromotionHooks=true`
  bypasses the AI trigger (ops escape hatch).
- Rejection sets `status='rejected', rejectedAt=now(), rejectedReason,
  rejectedByUserId`. The candidate row is preserved; image rows stay
  attached for audit.
- Promote/reject from non-`sourced` states is 422 UnprocessableEntity; a
  concurrent promoter that wins the row lock surfaces as 409 Conflict to the
  loser.
## Hard Bans

- Direct Agent OS injection from `application/service/**`.
- `findUnique({ where: { id } })` for supplier or purchase-order access.
- Direct import of products services from application services.
- Raw `master_products` INSERT from sourcing; code issuance belongs to products.
- Raw `master_products` INSERT/UPDATE from sourcing ingest — sourcing now writes `sourcing_candidates` only.
- Direct mutation of supply/ domain models (`Supplier`, `MasterSupplierProduct`,
  `PurchaseOrder`) or services from sourcing application services. Cross-domain
  attach flows through `SUPPLY_ATTACH_PORT`; otherwise sourcing promotion stops
  at `SOURCING_PRODUCTS_CATALOG_PORT.promoteCandidate`.
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
