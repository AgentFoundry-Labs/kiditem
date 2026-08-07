Consult this document first instead of relying on memorized knowledge.

# sourcing — Decision Intelligence + Product Discovery + Account Registration

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
- `SourcingSourceEntitlementVersion` is the reviewed, versioned access and
  decision-impact contract. Shadow evidence cannot score or train.
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
- AI-generated detail pages, thumbnails, and content assets remain owned by the
  AI domain.

## Registration Flow

```text
candidate command
  -> ProductRegistrationService.createDraft/updateDraft
  -> ProductPreparation repository + candidate/preparation row locks
  -> claim creates/loads ProductRegistrationExecution with frozen
     canonical payload/hash/idempotency key and actor
  -> persist executing/uncertain before provider IO, or start external WING
  -> reconcile the same execution; uncertain outcomes never regain create eligibility
  -> final sourcing transaction resolves the account listing and succeeds the execution
  -> REGISTRATION_CONTENT_WORKSPACE_PORT branches selected AI content
  -> ProductPreparation compatibility status becomes registered
```

Provider calls occur outside database transactions and only after the execution
ledger records the intent. Retries reuse the frozen submission key and
reconcile recorded provider identity before create. Listing resolution,
content branching, execution success, and the compatibility registered
transition commit in one sourcing-owned finalization transaction. A legacy
submitting/failed row without an execution is imported as failed or
reconciling; it is never reborn as a fresh prepared/create execution.

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

`magic-scraper` is a development workflow, not a production runtime: never
expose arbitrary browser JS, local/CDN scripts, or raw CDP as Agent OS/MCP
tools. On extraction failure the runtime returns
`recommendedSkillKey: "sourcing.magic_scraper"` so the extractor is repaired
from authorized evidence rather than bypassing login/captcha controls. The
runtime writes no sourcing rows; candidates are created by
`SourcingScrapeFinalizedBridge` after Agent OS finalization.

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
- Source collection requires an active reviewed entitlement. Scoring and future
  training additionally require the current source to be `qualified + enabled`
  with valid permission dates and no kill switch.
- Canonical recommendation actions are exactly `test_order|hold|reject`.
  Current heuristic `order|observe_3d|exclude` is baseline model output only.
  Coverage confidence cannot create an execution-eligible test order.
- Every supplier-offer snapshot, LaunchCandidate, decision, and procurement
  intent is immutable/idempotent provenance. Do not add direct intent→PO or
  provider-execution paths.
- Extension ingest writes only `SourcingCandidate` and `CandidateImage`;
  registration state belongs to `ProductPreparation` and account-scoped
  `ChannelListing` rows, never candidate status.
- Product-less detail generation uses direct AI content workspaces and must not
  create collected-product `SourcingCandidate` rows.
- Candidate delete archives the active source-candidate workspace and related
  AI rows; it must not delete promoted masters, product images, channel
  listings, orders, inventory, or finance data.
- Physical storage deletion is a retention/GC concern and must re-check active
  references before deleting objects.
- Candidate status is only `sourced|rejected`. Registration state is derived
  from preparations/listings; concurrent active-draft losers surface as
  conflict.
