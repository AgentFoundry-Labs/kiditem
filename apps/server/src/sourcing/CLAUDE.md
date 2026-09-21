Before working in this directory, always read this document first rather than relying on memory.

# sourcing

`src/sourcing/` owns Chinese-product discovery, `SourcingCandidate`, source and
evidence governance, launch decisions, and account-scoped registration
preparation. Suppliers, offers, procurement intents, and purchase orders
belong to Supply; supplier payments belong to Finance.

## Ownership

- `SourcingCandidate` is the raw opportunity workspace. Its status is only
  `sourced|rejected`; registration state is derived from the Channels execution
  fence and listings.
- `SourcingEvidenceIngestionRun` and `SourcingEvidenceObservation` are the
  append-only collection/evidence ledger. Supplier-offer snapshots, launch
  candidates, decisions, and procurement intents retain immutable provenance.
- `SourcingLaunchCandidate` freezes the supplier variant, target account,
  bundle/plan, compliance/IP/QC versions, economics, and launch quantity.
- `SourcingDecisionBatch` and its items freeze server-derived baseline
  decisions. Coverage confidence is not a calibrated probability and cannot
  make a test order execution-eligible.
- `ProductPreparation` owns reviewed content and registration input for one
  candidate/account attempt. `closedAt` controls the one-open-draft constraint;
  submission status and the resulting listing are read from Channels execution
  facts. Editing draft input or content clears its approval. `ChannelListing` registration is owned by
  Channels and is reached through the narrow registration capability; sourcing
  must not create or return a `MasterProduct`.
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

- Sourcing stops at the draft: reach the submission fence through the Channels
  registration execution interface and read candidate registration state back
  through `channels/read/registration-execution.reader.ts`; never write
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
