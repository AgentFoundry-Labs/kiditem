Consult this document first instead of relying on memorized knowledge.

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
├── domain/
│   └── capability/         # sourcing resource/tool/workflow/sink manifest
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

## Scrape Runtime

`/api/sourcing/scrape-url` enqueues a `sourcing` Agent OS request. The active
runtime handler is `SourcingPlaywrightRuntimeHandler`: it opens Playwright
Chromium with a persistent profile and runs approved deterministic extractor
code. During migration it may still reuse
`extensions/product-scraper/extractors/*` as legacy/reference page scripts, but
new scraper development should happen through
`tools/codex/skills/magic-scraper/SKILL.md` and then be promoted into reviewed
sourcing extractor/runtime code with fixtures and tests.

For 1688/Alibaba sessions that need real user browser state, configure
`SOURCING_PLAYWRIGHT_CDP_ENDPOINT` or `runtimeConfig.playwrightCdpEndpoint` to
attach to a dedicated managed CDP browser/profile where the user has completed
login or verification. This is preferred over launching a fresh anonymous
browser when CAPTCHA/verification risk is high.

The `magic-scraper` skill is a development workflow, not a production runtime:
do not expose arbitrary browser JS, local file scripts, CDN scripts, or raw CDP
execution as Agent OS/MCP tools. If extraction fails, the runtime returns
`recommendedSkillKey: "sourcing.magic_scraper"` so the Sourcing Agent can repair
or harden the extractor from authorized browser evidence instead of bypassing
login or captcha controls. The runtime does not write sourcing rows directly;
candidate creation still happens through `SourcingScrapeFinalizedBridge` after
Agent OS finalization.

## Capability Surface

Sourcing is the first domain adopting the shared capability manifest model. The
initial manifest lives in `domain/capability/sourcing.capabilities.ts`:

- `sourcing.duplicateCheck` (`resource`) reads existing candidates by URL.
- `sourcing.scrapeProductUrl` (`tool`) runs the browser/runtime scraper and
  returns a product snapshot without canonical DB writes.
- `sourcing.ingestCandidate` (`sink`) validates and persists a candidate.
- `sourcing.scrapeUrlWorkflow` (`workflow`) composes duplicate-check, scrape,
  sink, alerting, and candidate-detail routing deterministically.

Capability manifests describe the platform-facing surface only. Agent OS and
automation must reach sourcing through incoming ports/capability dispatch, not
by importing sourcing application services directly.

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
