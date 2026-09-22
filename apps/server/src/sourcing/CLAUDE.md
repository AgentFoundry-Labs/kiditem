Before working in this directory, always read this document first rather than relying on memory.

# sourcing

`src/sourcing/` owns Chinese-product discovery, `SourcingCandidate`, source and
evidence governance and launch decisions. Candidate-originated registration
uses the Channels preparation capability. Suppliers, offers, procurement intents, and purchase orders
belong to Supply; supplier payments belong to Finance.

## Ownership

- `SourcingCandidate` is the immutable source record: source identity, raw
  payload, cost, images and launch evidence. Its status is only
  `sourced|rejected`; registration state is derived from the Channels execution
  fence and listings.
- Editing a collected product happens on the Channels selling-product draft,
  not on the candidate (KID-310). Every collection path asks Channels for one
  draft per candidate through
  `application/service/sourcing-collected-draft.service.ts`, and rejecting or
  deleting a candidate sends that draft to `unused` in the same transaction
  unless a mall still holds it. Both go through
  `application/port/out/cross-domain/sales-product-draft.port.ts`
  ([ADR-0022](../../../../docs/adr/0022-sales-product-drafts-exist-from-collection.md)).
- Sourcing serves no registration-setting route. Creating and editing one is
  `channels/registration-targets` (resolve, create, update, archive). Content
  generation starts on the draft too:
  `POST products/sales-products/:salesProductId/generation`, whose idempotency
  receipt (`sourcing.quick_process`) records `{ salesProductId }` — a directly
  authored draft with no candidate starts generation like any other.
- `SourcingEvidenceIngestionRun` and `SourcingEvidenceObservation` are the
  append-only collection/evidence ledger. Supplier-offer snapshots, launch
  candidates, decisions, and procurement intents retain immutable provenance.
- `SourcingLaunchCandidate` freezes the supplier variant, target account,
  bundle/plan, compliance/IP/QC versions, economics, and launch quantity.
- `SourcingDecisionBatch` and its items freeze server-derived baseline
  decisions. Coverage confidence is not a calibrated probability and cannot
  make a test order execution-eligible.
- Channels owns `RegistrationTarget` as a reusable registration target, one per
  selling product and channel account, and its execution history. Sourcing
  supplies candidate eligibility and content through its interfaces. Candidate
  screens use the Channels capability to edit registration settings; Sourcing
  never creates a `MasterProduct`.
- Cross-domain reads and mutations use named owner interfaces. Sourcing does
  not write Supply, Products, Channels, AI, or Finance models directly.

## Collection and evidence invariants

- The source owner is the mutation authority for its attempts, staged facts,
  canonical rows, coverage manifest, current complete snapshot, and terminal
  source status. A partial or failed attempt is never current.
- Extension ingress is untrusted transport. The server validates the source,
  organization, payload identity, and server-issued attempt token before
  storing data. Chunks and terminal submissions are idempotent; stale,
  expired, or post-terminal writes are rejected.
- A complete snapshot is the only input for downstream readers. Missing or
  stale source coverage remains explicit and is never treated as a zero.
  Completing collection does not implicitly publish analytics; downstream
  calculations use their explicit owner entrypoints.
- Collection and evidence writes preserve the source attempt, observed time,
  extractor/parser version, payload hash, and coverage period. Cancellation
  cannot reactivate an attempt; a retry receives a new attempt identity.
- Organization scope is enforced at every read and mutation. Unknown or
  disabled source controls produce no canonical candidate or evidence rows.

## Supplier URL security

- Extension ingest, DTO validation, and browser runtime share one SSRF policy.
  Admit only HTTPS 1688/Alibaba hosts without credentials or non-default
  ports; enforce the allowlist for redirects and navigation as well as the
  initial URL.
- Never expose arbitrary browser JavaScript, CDN scripts, raw CDP, credentials,
  or provider sessions as an Agent OS/MCP capability.

## Registration invariants

- Reach registration settings and the submission fence through the Channels
  registration execution interface and read candidate registration state back
  through its public capability; never write
  `ProductRegistrationExecution` rows
  ([ADR-0014](../../../../docs/adr/0014-channels-owns-the-registration-execution-fence.md)).
- Registration freezes the reviewed payload, content/hash, idempotency key,
  actor, account, execution kind, provider outcome, reconciliation state, and
  terminal listing in its ledger.
- Provider calls are idempotent and account-scoped. An uncertain outcome is
  reconciled before retrying; concurrent active drafts surface a conflict.
- Candidate deletion archives only the candidate workspace and AI rows. It
  never deletes promoted masters, images, listings, orders, inventory, or
  finance data. Storage deletion is retention/GC only and rechecks references.

## Owner confirm report

- Routes: `GET /api/sourcing/workspace/confirm-report/status` and
  `POST /api/sourcing/workspace/confirm-report/telegram`.
- The report sends only when an owner or admin asks. Telegram answers write the existing
  `final` review selection through `SourcingReviewService` with its version
  check, re-resolved against the latest recommendation run on every press.
  Button values carry no state and are signed by the messenger adapter. The bot
  token, chat, and allowed users stay server-side.

## Verification

Run the focused sourcing suite for changes in this domain:

    npm exec --workspace=apps/server vitest -- run src/sourcing
