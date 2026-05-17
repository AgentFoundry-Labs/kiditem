# sourcing — Owner Domain

Sourcing owns Chinese new-product discovery — scraper ingest from 1688 /
Alibaba, the `SourcingCandidate` inbox, and the candidate → master promotion
handoff. Supplier registry, master-supplier policy, and purchase-order
procurement live in `supply/`. `supplier-payments` lives in `finance/`.

Sourcing scrape/agent, products-catalog, AI archival, operation-alert, and
repository boundaries use application ports and outgoing adapters.

## Public Routes

| Capability | Route |
|---|---|
| extension ingest + scrape | `/api/sourcing/extension/*`, `/api/sourcing/scrape-url` |
| manual product registration | `POST /api/sourcing/product-registration` |
| product generation | `POST /api/sourcing/product-generation` |
| sourcing candidate detail | `GET /api/sourcing/:id` |
| candidate inbox delete | `DELETE /api/sourcing/candidates/:id` |
| candidate promotion | `POST /api/sourcing/candidates/:id/promote` |
| candidate quick AI processing | `POST /api/sourcing/candidates/:id/quick-process` |
| candidate rejection | `POST /api/sourcing/candidates/:id/reject` |

Route shape is frozen.

## Layout

```text
sourcing/
  sourcing.module.ts
  adapter/in/http/        route-family controllers: extension ingest/scrape, candidate workspace + DTOs
  adapter/out/agent/      SOURCING_AGENT_GATEWAY_PORT implementation
  adapter/out/ai/         SOURCING_AI_WORKSPACE_ARCHIVE_PORT implementation
  adapter/out/automation/ SOURCING_OPERATION_ALERT_PORT implementation
  adapter/out/products/   products catalog port adapter
  adapter/out/repository/ SOURCING_CANDIDATE_REPOSITORY_PORT adapter
  application/port/out/   local outbound ports + opaque repository transaction handle
  application/service/    use-case orchestration; no Prisma, HTTP DTO, or concrete adapter imports
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
  `SOURCING_PRODUCTS_CATALOG_PORT.promoteCandidate`; its adapter consumes
  products' owner-side `PRODUCT_MASTER_PROMOTION_PORT`. Promotion is the only
  sourcing call site of products domain creation.
- Cross-domain AI workspace archival flows through local
  `SOURCING_AI_WORKSPACE_ARCHIVE_PORT`, implemented by `adapter/out/ai/`.
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
- Operation-alert lifecycle writes go through `SOURCING_OPERATION_ALERT_PORT`
  and `adapter/out/automation/operation-alert.adapter.ts`. Sourcing services
  and gateway adapters must not inject automation's `OperationAlertService`
  directly.
- Application services must not import `PrismaService`, `@prisma/client`,
  HTTP DTOs, or concrete `adapter/out/**` files. Inbound request shapes become
  application command/input interfaces under `application/port/in/*`.
  Persistence, row locks, and cross-owner transaction bridging live behind
  `application/port/out/*` and outgoing adapters. `sourcing.architecture.spec.ts`
  is the durable guard for this contract.
- Supplier registry, `MasterSupplierProduct` policy, and `PurchaseOrder`
  mutation belong to `supply/`. Sourcing must not reintroduce supplier or
  procurement controllers, services, or DTOs. Cross-domain attach flows through
  `SUPPLY_ATTACH_PORT`, not direct service injection.

## Contracts

- `GET /api/sourcing/:id` uses
  `findFirst({ id, organizationId, isDeleted: false })`; miss is 404.
- `GET /api/sourcing/extension/products` returns paginated, organization-scoped
  marketplace-unlisted `SourcingCandidate` rows where `status IN
  ('sourced','promoted')` and the promoted master has no active
  `ChannelListing`; without an explicit platform filter, the collected-product
  inbox includes imported sourcing platforms (`ALIBABA_1688`, `ALIBABA`) and
  manual product registration candidates (`KIDITEM_PRODUCT_REGISTRATION`).
  Product-less detail-generation outputs are direct content workspaces,
  not collected-product candidates. It continues to exclude
  KidItem-generated thumbnail-only workspaces.
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
- Promotion is atomic: `SourcingPromotionService.promote` runs through
  `SOURCING_CANDIDATE_REPOSITORY_PORT.runInTransaction` with an opaque
  `SourcingRepositoryTransaction` handle. The repository adapter performs the
  tenant-scoped pre-check, tagged-template `SELECT ... FOR UPDATE` row lock
  (no `$queryRawUnsafe`), candidate status flip, detail-page attachment, and
  `ProductPreparation` write; products creation still goes through
  `SOURCING_PRODUCTS_CATALOG_PORT.promoteCandidate(tx, ...)`. The row lock
  enforces 1:1 in the current use case while the schema still permits future
  N:1 promotion.
- Promotion may receive registration selections in the existing command body:
  `selectedThumbnailUrl` becomes the promoted master's primary image, and
  `selectedDetailPageGenerationId` / `selectedDetailPageArtifactId` attaches
  the chosen `DetailPageArtifact` to the new master. Do not add a
  `RegistrationDraft` table for this pre-submit choice.
- Promotion writes the chosen registration inputs/assets to
  `ProductPreparation`. Multiple preparations may point at one `MasterProduct`;
  exactly one active row per master is current via `isCurrentForMaster=true`.
- Candidate quick AI processing starts the product-generation parent operation
  for an existing sourcing candidate, creating detail-page and thumbnail child
  ledgers without creating another `SourcingCandidate`.
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
- Direct Prisma import/injection from `application/**`.
- Direct HTTP DTO imports from `application/service/**`.
- Direct AI archive port import from `ai/application/**`; use
  `SOURCING_AI_WORKSPACE_ARCHIVE_PORT`.
- `findUnique({ where: { id } })` for supplier or purchase-order access.
- Direct import of products services from application services or
  `adapter/out/products/**`. The products bridge consumes products owner-side
  ports only.
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
