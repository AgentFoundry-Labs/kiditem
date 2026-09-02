# sourcing

`src/sourcing/` owns Chinese-product discovery, `SourcingCandidate`,
source/evidence governance, launch decisions, and account-scoped registration
preparation. Suppliers, offers, procurement intents, and purchase orders belong
to `src/supply/`; supplier payments belong to `src/finance/`.

## Folder Map

```text
sourcing/
├── sourcing.module.ts
├── adapter/in/http/        # extension ingest, scrape, candidate workspace DTO/controllers
├── adapter/out/
│   ├── agent/              # sourcing Agent OS gateway adapter
│   ├── ai/                 # AI archive/workspace and registration-content adapters
│   ├── channels/           # account-scoped marketplace registration bridge
│   ├── products/           # Products boundary adapter
│   ├── supply/             # Supply incoming-port bridge; never direct model writes
│   └── repository/         # candidate, evidence, launch, decision repositories
├── application/
│   ├── port/in/            # Sourcing-owned Agent capability/use-case contracts
│   ├── port/out/           # local outbound ports + transaction handle
│   └── service/            # use-case orchestration
├── domain/
│   └── capability/         # strict Sourcing-owned CapabilityDefinitions
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
- `ProductPreparation` owns reviewed input, selected content, and legacy
  lifecycle columns for one candidate/account attempt, not provider effects.
- `ProductRegistrationExecution` owns frozen payload/hash, idempotency, actor,
  create-versus-external-WING kind, provider outcome, reconciliation, and the
  terminal listing. Preparation compatibility columns are dual-written only
  while legacy readers remain.
- `ChannelListing` registration is owned by Channels and reached only through
  a sourcing outgoing registration port. Registration never creates or returns
  a `MasterProduct`.
- Registration ledger, provider-call, uncertain-outcome, and retry invariants
  are defined in [Account-Scoped Registration And Content Ownership](../../../../docs/ARCHITECTURE.md#account-scoped-registration-and-content-ownership-0180125).

## Cross-Domain Ports

- URL scraping uses `SOURCING_SCRAPE_OPERATION_PORT`; deterministic AI product
  generation uses `SOURCING_AGENT_GATEWAY_PORT`.
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

Screen -> Operations -> owner handler. Mount/read/navigation starts no work;
browser ingest is fenced and Operations owns no canonical rows. No
direct/1688/status/read-or-compute paths. Cancellation never reactivates.

## Scrape Runtime

`/api/sourcing/scrape-url` and Agent capabilities enqueue the Sourcing-owned
`sourcing.scrape_url` Operation with the exact admitted idempotency key; no
provider-work manufacture or generic runner fallback. Its handler calls
`SourcingPlaywrightRuntimeHandler`, which uses persistent-profile Playwright
Chromium and approved deterministic extractors, reusing
`extensions/kiditem-os/content/sourcing/extractors/*` as reviewed reference
scripts; retired extension paths are not fallbacks.

The server-owned v2 1688 keyword Operation attaches only through
`SOURCING_PLAYWRIGHT_CDP_ENDPOINT` to authenticated Office Chrome, with no
extension, anonymous-browser, or fresh-profile fallback. It closes only its
page; host Chrome, login, and unrelated tabs survive. Login/security challenges
are truthful attention states, never bypassed.

Never expose arbitrary browser JS, CDN scripts, or raw CDP as Agent OS/MCP
tools. For direct `scrape_url`, `SourcingScrapeResultService` validates and
upserts the canonical candidate before completion. Agent OS projections never
write canonical sourcing rows.

Supplier URLs use one SSRF boundary, `supplier-source-url-policy.ts`, across
extension ingest, DTO validation, and Playwright. Admit only HTTPS 1688/Alibaba
hosts without credentials or non-default ports; enforce the allowlist through
navigation/redirects and add no second parser.

## Extension Ingest Contract

`POST /api/sourcing/extension/product-data` remains the KidItem OS v1
snake_case wire. `SourcingExtensionIngestService` parses the shared schema,
records the normalized commercial summary, and claims a controlled run before
candidate projection. Never restore `{ ...body, ...extra }`; `ValidationPipe`
must enumerate known fields rather than admit page-world data.

New extension writers obtain a permit at
`POST /api/sourcing/extension/v2/sessions`, then send the strict v2 contract to
`/api/sourcing/extension/v2/product-data` with offer identity, session UUID,
capture time, extractor version, and payload hash. Both versions use the
collection coordinator; unknown/disabled sources leave zero candidate and
evidence rows.
Identity includes variant. Alibaba uses canonical URL (aliases/tracking/fragments
removed); 1688 uses validated offer ID, then URL. All ingress uses it, never
title/extractor ID.

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

All ten are discoverable through the code-owned registry and private MCP
catalog. Required-idempotency mutations pass the exact owner key to the final
Sourcing DB or Operation boundary. Agent OS only aggregates, admits, and routes
them.

The dashboard opens the shared conversation workspace with the fixed Sourcing
Agent; Sourcing owns no local assistant endpoint, transcript, or CLI subprocess
path.

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
