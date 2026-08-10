# sourcing

`src/sourcing/` owns Chinese new-product discovery: scraper ingest from
Alibaba/1688, `SourcingCandidate` workspaces, manual product registration
candidates, source/evidence governance, exact launch identity, immutable
recommendation decisions, and the account-scoped product-registration state
machine. Supplier registry, supplier-offer commercial terms, procurement test
intents, and purchase orders live in `src/supply/`; supplier payments live in
`src/finance/`.

## Folder Map

```text
sourcing/
├── sourcing.module.ts
├── adapter/in/http/        # extension ingest, scrape, candidate workspace DTO/controllers
├── adapter/out/
│   ├── agent/              # sourcing Agent OS gateway adapter
│   ├── ai/                 # AI archive/workspace and registration-content adapters
│   ├── automation/         # operation-alert adapter
│   ├── channels/           # account-scoped marketplace registration bridge
│   ├── products/           # legacy products compatibility bridge
│   ├── supply/             # Supply incoming-port bridge; never direct model writes
│   └── repository/         # candidate, evidence, launch, decision repositories
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
- Product preparation: `POST /api/sourcing/candidates/:id/preparations`,
  `PATCH /api/sourcing/preparations/:id`, and preparation submit/cancel routes
- Candidate rejection and quick AI processing: `/api/sourcing/candidates/:id/*`
- Decision intelligence: `/api/sourcing/intelligence/sources`,
  `/evidence-runs`, `/launch-candidates`, `/decision-batches`, and
  `/decision-items/:id/procurement-intents` beneath that prefix
- Entry recommendation + assistant: `/api/sourcing/entry/*`

Route shape is frozen. New routes need 2+ segments: `GET /api/sourcing/:id`
catches single-segment paths and fails as a bad candidate UUID.

## Main Data Models

- `SourcingCandidate` is the raw opportunity workspace.
- `SourcingCollectionSourceControl` is an optional organization-level pause
  for a server-allowlisted collector. Absence means enabled; it has no review,
  lifecycle, expiry, or decision-impact state.
- `SourcingEvidenceIngestionRun` and `SourcingEvidenceObservation` form the
  append-only collection/evidence ledger.
- `SourcingLaunchCandidate` freezes exact supplier variant, target account,
  bundle/plan/compliance/IP/QC versions, economics, and launch quantity.
- `SourcingDecisionBatch`, items, and evidence freeze server-derived baseline
  shadow decisions. Coverage confidence is never a calibrated probability and
  `policyProbability` remains null until a real assignment ledger exists.
- `CandidateImage` stores source images attached to a candidate.
- `ProductPreparation` owns the operator-reviewed input, selected content, and
  legacy lifecycle compatibility columns for one candidate/account attempt.
  It is not authoritative for provider side effects.
- `ProductRegistrationExecution` owns the frozen canonical payload/hash,
  idempotency key, actor, create-versus-external-WING kind, provider outcome,
  reconciliation state, and terminal listing result. Existing compatibility
  columns on `ProductPreparation` are dual-written only while legacy readers
  remain.
- `ChannelListing` registration is owned by Channels and reached only through
  a sourcing outgoing registration port. Registration never creates or returns
  a `MasterProduct`.
- Registration ledger, provider-call, uncertain-outcome, and retry invariants
  are defined in [Account-Scoped Registration And Content Ownership](../../../../docs/ARCHITECTURE.md#account-scoped-registration-and-content-ownership-0180125).
- AI-generated detail pages, thumbnails, and content assets remain owned by the
  AI domain.

## Cross-Domain Ports

- Sourcing delegates scrape/product-generation work through
  `SOURCING_AGENT_GATEWAY_PORT`.
- Product registration calls Channels through
  `CHANNEL_PRODUCT_REGISTRATION_PORT` and branches AI content through
  `REGISTRATION_CONTENT_WORKSPACE_PORT`.
- `SOURCING_PRODUCTS_CATALOG_PORT` is legacy compatibility only; new
  registration flows must not call it.
- Generated-content archive/delete calls AI through
  `SOURCING_AI_WORKSPACE_ARCHIVE_PORT`.
- Operation-alert lifecycle writes go through
  `SOURCING_OPERATION_ALERT_PORT`.
- Supplier-offer reads and RFQ/sample/test-order intent creation use
  `SOURCING_SUPPLY_INTELLIGENCE_PORT`, backed only by Supply's exported
  `SUPPLY_SOURCING_PROCUREMENT_PORT`; sourcing must not mutate supply models
  directly.

## Scrape Runtime

`/api/sourcing/scrape-url` enqueues a `sourcing` Agent OS request. Handler
`SourcingPlaywrightRuntimeHandler` opens Playwright Chromium with a persistent
profile and runs approved deterministic extractors, reusing
`extensions/kiditem-os/content/sourcing/extractors/*` as reviewed reference
scripts; retired extension paths are not fallbacks. Develop new scrapers via the
Codex-global `$magic-scraper` skill, then promote them into reviewed
extractor/runtime code with fixtures and tests.

For 1688/Alibaba use a dedicated managed profile via
`SOURCING_PLAYWRIGHT_CDP_ENDPOINT` / `runtimeConfig.playwrightCdpEndpoint`, not a
fresh anonymous browser. Even so, 1688 search answers programmatic navigation
with a `punish` challenge, so keyword collection that must succeed belongs in the
Chrome extension: it runs in the operator's session and hands any slider to them
rather than bypassing it.

`magic-scraper` is development-only: never expose arbitrary browser JS, CDN
scripts, or raw CDP as Agent OS/MCP tools. For the direct `scrape_url` action,
`SourcingScrapeResultService` validates and upserts the canonical candidate
synchronously before the runtime returns success. Agent OS finalized listeners
are non-authoritative alert/audit projections and never write canonical sourcing
rows.

Supplier URLs are an SSRF boundary. `supplier-source-url-policy.ts` is the
single parser for extension ingest, scrape DTO validation, and Playwright
navigation: only HTTPS 1688/Alibaba hosts without credentials or non-default
ports are accepted. Playwright must keep that allowlist on navigation and
redirect hops; do not add a second permissive URL parser.

## Extension Ingest Contract

`POST /api/sourcing/extension/product-data` is the deployed KidItem OS v1
snake_case wire and must remain compatible. `SourcingExtensionIngestService`
parses it through `@kiditem/shared/sourcing`, records only the normalized
commercial summary, and claims a controlled collection run before it projects a
candidate. Do not restore controller-side `{ ...body, ...extra }` merging:
global `ValidationPipe` must retain known commercial fields explicitly rather
than accepting arbitrary page-world data.

New extension writers first obtain a permit from
`POST /api/sourcing/extension/v2/sessions`, then post to
`/api/sourcing/extension/v2/product-data` with the strict v2 contract, an
external offer identity, collection session UUID, captured timestamp, extractor
version, and payload hash. V1 and v2 both use the collection coordinator;
an unknown or disabled source must leave zero candidate and evidence rows.
Candidate identity is platform + external offer + normalized variant, never
title, tracking URL, or search-result array index.

Entry assistant: server-only runtime/model; client never selects. Claude:
`--tools ""` (not `--allowed-tools`). Codex: ephemeral read-only/no tools.
Failure: retrieval-only.

## Capability Surface

Sourcing is the first domain adopting the shared capability manifest model. The
initial manifest lives in `domain/capability/sourcing.capabilities.ts`:

- `sourcing.duplicateCheck` (`resource`) reads existing candidates by URL.
- `sourcing.scrapeProductUrl` (`tool`) is an internal deterministic bridge for
  reviewed scrape workflows; it is not exposed to the Sourcing model.
- `sourcing.ingestCandidate` (`sink`) validates and persists a candidate.
- `sourcing.scrapeUrlWorkflow` (`workflow`) composes duplicate-check, scrape,
  sink, alerting, and candidate-detail routing deterministically.
- `sourcing.retrieveWorkspaceEvidence`, `sourcing.inspectRecommendationRun`,
  `sourcing.refreshCollection`, and `sourcing.refreshValidation` are the direct
  dashboard model's bounded evidence/run capabilities.
- `sourcing.createReviewBatch` is registry-valid for a future explicit
  selection handoff but is absent from the dashboard Sourcing policy.

The dashboard assistant reaches Claude/Codex only through
`AGENT_INTERACTION_PORT`; Sourcing does not own a second CLI subprocess path.

Capability manifests describe the platform-facing surface only. Agent OS and
automation must reach sourcing through incoming ports/capability dispatch, not
by importing sourcing application services directly.

## Boundary Rules

- Application services must not import Prisma, HTTP DTOs, concrete outbound
  adapters, or AI/products/automation services.
- Collection claim and commit require an allowlisted source and non-disabled
  organization control; no review, expiry, lifecycle, or policy history.
- Canonical recommendation actions are exactly `test_order|hold|reject`.
  Current heuristic `order|observe_3d|exclude` is baseline model output only.
  Coverage confidence cannot create an execution-eligible test order.
- Every supplier-offer snapshot, LaunchCandidate, decision, and procurement
  intent is immutable/idempotent provenance. Do not add direct intent→PO or
  provider-execution paths.
- Extension ingest records controlled immutable evidence before projecting a
  candidate/image; registration belongs to `ProductPreparation` and
  account-scoped `ChannelListing`, never candidate status.
- Product-less detail generation uses direct AI content workspaces and must not
  create collected-product `SourcingCandidate` rows.
- Candidate delete archives its workspace/AI rows, never promoted masters,
  product images, channel listings, orders, inventory, or finance data.
- Storage deletion is retention/GC only and rechecks active references.
- Candidate status is only `sourced|rejected`. Registration state is derived
  from preparations/listings; concurrent active-draft losers surface as
  conflict.
