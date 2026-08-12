# sourcing — Decision Intelligence And Product Discovery

`src/sourcing/` owns Chinese product discovery, candidate/evidence
workspaces, immutable recommendation decisions, and the account-scoped
registration state machine. Supply owns suppliers, commercial offers,
procurement intents, and purchase orders; Finance owns supplier payments.

## Ownership And Identity

- `SourcingCandidate` is the raw opportunity workspace.
- Entitlement versions, ingestion runs, observations, launch candidates,
  decision batches/items, and their evidence form immutable provenance. Shadow
  evidence does not score or train.
- `ProductPreparation` is the operator-reviewed input for one
  candidate/account attempt. `ProductRegistrationExecution` is the
  authoritative frozen payload, idempotency, provider outcome, and
  reconciliation ledger.
- Channels owns the resulting `ChannelListing`; AI owns generated content.
  Registration never creates or returns a `MasterProduct`.
- Candidate state is only sourced or rejected. Registration state derives from
  preparations, executions, and account-scoped listings.

The complete model and constraint authority is
[prisma/models/sourcing.prisma](../../../../prisma/models/sourcing.prisma).
Request/transition behavior is executable in
[the sourcing test suite](__tests__/).

## Registration Contract

- Claim under candidate/preparation locks, freeze the canonical payload and
  submission key, and persist executing or uncertain before provider IO.
- Provider calls run outside database transactions. Retries reconcile the same
  execution and recorded provider identity; an uncertain attempt never regains
  create eligibility.
- Finalization atomically resolves the account listing, succeeds the execution,
  branches selected AI content, and updates compatibility status.
- Registration routes retain their current multi-segment shape because the
  legacy `GET /api/sourcing/:id` route catches a single segment.

## Discovery And Decision Contract

- Active reviewed source entitlement is required for collection. Scoring or
  training additionally requires a qualified, enabled, in-date source without
  a kill switch.
- Canonical recommendation actions are `test_order|hold|reject`. Coverage
  confidence is not a calibrated probability and cannot authorize execution.
- Supplier-offer snapshots, launch candidates, decisions, and procurement
  intents remain immutable and idempotent. There is no direct intent-to-PO or
  provider-execution path.
- Extension ingest writes candidate/image evidence only. Product-less detail
  generation uses an AI direct workspace rather than a synthetic candidate.
- Candidate deletion archives its workspace and AI rows but never deletes
  promoted products, listings, orders, inventory, finance data, or referenced
  storage objects.

Read
[sourcing-intelligence-phase0.md](../../../../docs/runbooks/sourcing-intelligence-phase0.md)
before changing evidence qualification, decision eligibility, or launch
provenance.

## Runtime And Ports

- Scrape and product-generation delegation uses
  `SOURCING_AGENT_GATEWAY_PORT`; registration uses
  `CHANNEL_PRODUCT_REGISTRATION_PORT` and
  `REGISTRATION_CONTENT_WORKSPACE_PORT`.
- AI archive, operation alerts, and Supply handoff use their dedicated outgoing
  ports. Do not mutate another domain's models or import its service.
- `/api/sourcing/scrape-url` creates a sourcing Agent OS request. The reviewed
  runtime uses approved deterministic extractors and a managed authenticated
  browser profile. Captcha or slider work stays with the operator; never expose
  arbitrary browser JavaScript, raw CDP, or local/CDN scripts as runtime tools.
- The capability manifest describes duplicate check, scrape, ingest sink, and
  deterministic workflow surfaces. Consumers dispatch through incoming ports,
  not sourcing application services.

Application code follows the server port/adapter rules. The legacy Products
catalog port is compatibility-only and must not enter new registration flows.
