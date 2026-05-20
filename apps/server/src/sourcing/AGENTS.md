# sourcing — Product Discovery + Candidate Promotion

`src/sourcing/` owns Chinese new-product discovery: scraper ingest from
Alibaba/1688, `SourcingCandidate` workspaces, manual product registration
candidates, and candidate-to-master promotion handoff. Supplier registry and
procurement live in `src/supply/`; supplier payments live in `src/finance/`.

## Folder Map

```text
sourcing/
├── sourcing.module.ts
├── adapter/in/http/        # extension ingest, scrape, candidate workspace DTO/controllers
├── adapter/out/
│   ├── agent/              # sourcing Agent OS gateway adapter
│   ├── ai/                 # AI archive/workspace adapter
│   ├── automation/         # operation-alert adapter
│   ├── products/           # products promotion bridge
│   └── repository/         # candidate repository + transaction adapter
├── application/
│   ├── port/out/           # local outbound ports + transaction handle
│   └── service/            # use-case orchestration
└── __tests__/              # architecture and behavior specs
```

## Owned Surfaces

- Extension ingest and scrape: `/api/sourcing/extension/*`,
  `/api/sourcing/scrape-url`
- Manual product registration: `POST /api/sourcing/product-registration`
- Candidate product generation: `POST /api/sourcing/product-generation`
- Candidate detail/read/delete: `GET /api/sourcing/:id`,
  `DELETE /api/sourcing/candidates/:id`
- Candidate promotion, quick AI processing, and rejection:
  `/api/sourcing/candidates/:id/*`

Route shape is frozen.

## Main Data Models

- `SourcingCandidate` is the raw opportunity workspace.
- `CandidateImage` stores source images attached to a candidate.
- `ProductPreparation` records the selected thumbnail/detail inputs after
  promotion.
- `MasterProduct` creation is owned by products and reached only through a
  sourcing outgoing products port.
- AI-generated detail pages, thumbnails, and content assets remain owned by the
  AI domain.

## Promotion Flow

```text
candidate command
  -> SourcingPromotionService.promote
  -> sourcing repository transaction + candidate row lock
  -> SOURCING_PRODUCTS_CATALOG_PORT.promoteCandidate(tx, ...)
  -> ProductPreparation write
  -> after commit: SOURCING_AGENT_GATEWAY_PORT.notifyPromoted
  -> AI post-promotion generation port
```

Promotion is atomic inside the sourcing repository transaction. The repository
adapter performs tenant-scoped pre-checks, tagged-template row locks, candidate
status changes, detail-page attachment, and preparation writes.

## Cross-Domain Ports

- Sourcing delegates scrape/product-generation work through
  `SOURCING_AGENT_GATEWAY_PORT`.
- Candidate promotion calls products through `SOURCING_PRODUCTS_CATALOG_PORT`,
  whose adapter consumes products' `PRODUCT_MASTER_PROMOTION_PORT`.
- Generated-content archive/delete calls AI through
  `SOURCING_AI_WORKSPACE_ARCHIVE_PORT`.
- Operation-alert lifecycle writes go through
  `SOURCING_OPERATION_ALERT_PORT`.
- Supply attach flows must use a supply-owned port such as
  `SUPPLY_ATTACH_PORT`; sourcing must not mutate supply models directly.

## Boundary Rules

- Application services must not import `PrismaService`, `@prisma/client`, HTTP
  DTOs, concrete `adapter/out/**` implementations, AI services, products
  services, or automation services.
- Extension ingest writes only `SourcingCandidate` and `CandidateImage`;
  `MasterProduct` is created only during promotion.
- Product-less detail generation uses direct AI content workspaces and must not
  create collected-product `SourcingCandidate` rows.
- Candidate delete archives the active source-candidate workspace and related
  AI rows; it must not delete promoted masters, product images, channel
  listings, orders, inventory, or finance data.
- Physical storage deletion is a retention/GC concern and must re-check active
  references before deleting objects.
- Promote/reject from non-`sourced` states is a domain error; concurrent
  promotion losers surface as conflict.

## Transitional Exceptions

- The route shape is frozen while frontend product-pipeline screens depend on
  it.
- The promotion transaction currently enforces 1:1 candidate-to-master behavior
  even though the schema still leaves room for future N:1 promotion.
