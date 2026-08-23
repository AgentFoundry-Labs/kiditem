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

## Cross-Domain Ports

- Sourcing starts URL scraping through `SOURCING_SCRAPE_OPERATION_PORT` and
  delegates deterministic AI product generation through `SOURCING_AGENT_GATEWAY_PORT`.
- Product registration calls Channels through
  `CHANNEL_PRODUCT_REGISTRATION_PORT` and branches AI content through
  `REGISTRATION_CONTENT_WORKSPACE_PORT`.
- `SOURCING_PRODUCTS_CATALOG_PORT` is legacy compatibility only; new
  registration flows must not call it.
- Generated-content archive/delete calls AI through
  `SOURCING_AI_WORKSPACE_ARCHIVE_PORT`.
- Supplier-offer reads and RFQ/sample/test-order intent creation use
  `SOURCING_SUPPLY_INTELLIGENCE_PORT`, backed only by Supply's exported
  `SUPPLY_SOURCING_PROCUREMENT_PORT`; sourcing must not mutate supply models
  directly.

## Operation-Backed Collection

Explicit screen -> Operations -> owner handler; mount/read/navigation starts no
work. Browser requires fenced owner ingest; Operations owns no canonical rows.
No direct/1688/status/read-or-compute paths. Cancellation never reactivates.

## Scrape Runtime

`/api/sourcing/scrape-url` starts the Sourcing-owned `sourcing.scrape_url`
Operation. Official AgentSession capabilities create one session-owned child
Operation through `AGENT_SESSION_OWNED_OPERATION_PORT`; they never manufacture
an AgentRun or fall back to the generic runner. The Operation handler calls
`SourcingPlaywrightRuntimeHandler`, which opens Playwright Chromium with a persistent
profile and runs approved deterministic extractors, reusing
`extensions/kiditem-os/content/sourcing/extractors/*` as reviewed reference
scripts; retired extension paths are not fallbacks.

The version-2 1688 keyword Operation is server-domain owned and attaches only
through `SOURCING_PLAYWRIGHT_CDP_ENDPOINT` to authenticated Office Chrome. It
has no extension, anonymous-browser, or fresh-profile fallback. The adapter
closes only its page; host Chrome, login, and unrelated tabs survive. Login or
security challenges are truthful attention states, never bypassed.

Never expose arbitrary browser JS, CDN scripts, or raw CDP as Agent OS/MCP tools. For the direct `scrape_url` action,
`SourcingScrapeResultService` validates and upserts the canonical candidate
synchronously before the Operation completes. Agent OS projections are
non-authoritative and never write canonical sourcing rows.

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

Strict Agent-facing definitions live in
`domain/capability/sourcing.capabilities.ts` and execute through Sourcing-owned
incoming ports. The exact ten are:

- reads: `sourcing.duplicateCheck`, `sourcing.retrieveWorkspaceEvidence`,
  `sourcing.inspectRecommendationRun`;
- split scrape/ingest: `sourcing.scrapeProductUrl` returns a bounded snapshot
  without writing a candidate, and `sourcing.ingestCandidate` admits only that
  same attempt's exact snapshot/hash;
- mutations: `sourcing.refreshValidation`, `sourcing.createReviewBatch`;
- Operation-backed: `sourcing.scrapeUrlWorkflow`,
  `sourcing.refreshCollection`, `sourcing.collect_shadow_signals`.

All ten are AgentVersion/MCP-discoverable with an exact context and grant.
Required-idempotency mutations pass the exact owner key to the final Sourcing
DB or Operation boundary. Agent OS only aggregates and routes them.

The dashboard opens the shared Interaction Surface with the Sourcing agent;
Sourcing owns no local assistant endpoint, transcript, or CLI subprocess path.

Agent OS and automation reach sourcing through incoming capability ports, not
by importing sourcing application services.

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
