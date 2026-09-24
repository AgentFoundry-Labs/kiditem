Before working in this directory, always read this document first rather than relying on memory.

# sourcing

`src/sourcing/` owns Chinese-product discovery, `SourceRecord`, source and
evidence governance and launch decisions. Suppliers, offers, procurement intents, and purchase orders
belong to Supply; supplier payments belong to Finance.

## Ownership

- `SourceRecord` is the immutable source record: source identity, raw
  payload, cost, images and launch evidence. It has no status, no reject and
  no delete route; operators work only on the Channels draft (KID-313).
- Every collection path (scrape-url, extension ingest, Agent ingest) admits a
  record through `admitSourceRecord` inside the source-identity advisory lock
  (`adapter/out/repository/source-record-admission.transaction.ts`). The same
  source twice is refused with `SourceRecordDuplicateError`, which
  `adapter/in/http/source-record-duplicate.filter.ts` maps to 409 with the
  existing draft or selling product. The record and its draft commit together;
  a record never exists without its draft.
- Direct product creation (`product-generation`, `product-registration`)
  creates no source record: the draft has `sourceRecordId = null`.
- Drafts are created only through
  `application/port/out/cross-domain/sales-product-draft.port.ts`. Channels
  reads source facts through `SourceRecordPort` (`application/port/in/source-record.port.ts`,
  provided by `sourcing-source-record.module.ts`) and deletes the record
  through `deleteForDraft` in the draft-deletion transaction.
- Sourcing serves no registration-setting route. Creating and editing one is
  `channels/registration-targets` (resolve, update, archive). Content
  generation starts on the draft too:
  `POST products/sales-products/:salesProductId/generation`, whose idempotency
  receipt (`sourcing.quick_process`) records `{ salesProductId }` — a directly
  authored draft with no source record starts generation like any other.
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
  disabled source controls produce no source record or evidence rows.

## Supplier URL security

- Extension ingest, DTO validation, and browser runtime share one SSRF policy.
  Admit only HTTPS 1688/Alibaba hosts without credentials or non-default
  ports; enforce the allowlist for redirects and navigation as well as the
  initial URL.
- Never expose arbitrary browser JavaScript, CDN scripts, raw CDP, credentials,
  or provider sessions as an Agent OS/MCP capability.

## Registration invariants

- Reach registration settings and the submission fence through the Channels
  registration execution interface; never write
  `ProductRegistrationExecution` rows
  ([ADR-0014](../../../../docs/adr/0014-channels-owns-the-registration-execution-fence.md)).
- Registration freezes the reviewed payload, content/hash, idempotency key,
  actor, account, execution kind, provider outcome, reconciliation state, and
  terminal listing in its ledger.
- Provider calls are idempotent and account-scoped. An uncertain outcome is
  reconciled before retrying; concurrent active drafts surface a conflict.
- A source record is deleted only with its draft (Channels draft deletion). It
  never deletes masters, listings, orders, inventory, or finance data. Storage
  deletion is retention/GC only and rechecks references.

## Owner confirm report

- Routes: `GET /api/sourcing/workspace/confirm-report/status`,
  `POST /api/sourcing/workspace/confirm-report/telegram`, and
  `POST /api/sourcing/workspace/confirm-report/telegram/setup-token`.
- One bot serves the organization in `SOURCING_CONFIRM_TELEGRAM_ORGANIZATION_ID`;
  without it Telegram confirm is off. Other organizations get 403
  `TELEGRAM_ORGANIZATION_NOT_BOUND`, and their button values are ignored.
- The report sends only when an owner or admin asks. A chat is proposed only by
  `/start <token>` with the one-time setup token (in-process memory; Office
  runs one API process). Chat ID and pending token reach owner and admin only.
- Telegram answers write the existing `final` review selection through
  `SourcingReviewService`, re-resolved against the latest recommendation run on
  every press. Buttons carry the selection version they were drawn with; a
  changed version is not written and is answered as decided on the web. Button
  values are signed by the messenger adapter and fit the 64-byte limit. The bot
  token, chat, and allowed users stay server-side.

## Verification

Run the focused sourcing suite for changes in this domain:

    npm exec --workspace=apps/server vitest -- run src/sourcing
