# channels — Marketplace Identity And SKU Matching

`src/channels/` owns marketplace accounts, listing/option identity, Coupang
catalog publication/import, matching, account-scoped browser registration,
channel capacity projections, dashboard reads, and the mall operation outcome
log. Coupang Open API product, order, return, and deletion verification are
unsupported; the legacy sync HTTP routes return 501 without IO. Wing/browser
evidence and approved internal sources remain supported.

`MallOperationOutcome` is an append-only, idempotent log written by the web
through `/api/channels/mall-operation-outcomes`. Organization and actor come
from the session, the body is a strict shared contract, the mall key must be in
the adapter manifest, and rows hold counts and reason codes only.

## Identity And Ownership

- `ChannelAccount` is marketplace/store identity; Wing and Rocket are
  separate rows even when they share one vendor identity.
- Prisma `ChannelListing` and `ChannelListingOption` are the channel product
  and sellable-option identities. A listing's `masterProductId` is only a
  derived summary when every option resolves to one canonical product.
- Products owns each option's complete
  `ChannelListingOptionInventoryComponent` recipe. Inventory owns physical
  `SellpiaInventorySku.currentStock`. Channels owns neither recipes nor stock.
- Registration provenance in `sourceCandidateId` is immutable.

The model authority is
[prisma/models/channels.prisma](../../../../prisma/models/channels.prisma);
sync, registration, matching, and capacity behavior is executable in
[the Channels tests](__tests__/).

## Registration And Provider Contract

- Selected accounts must exist and be active. `ChannelAccount` stores the Wing
  vendor identity used to fence browser evidence; Open API credentials are not
  accepted or resolved.
- `register_confirmed_listing` is the supported registration mutation. It
  validates server-frozen provenance and Wing confirmation evidence before the
  final listing resolution transaction.
- New Open API submission and deletion authorization/claim/reconciliation are
  explicit unsupported paths with no external IO or database intent. Existing
  deletion status reads, unresolved records, and succeeded receipt replays
  remain readable.
- Catalog publication refreshes channel facts while preserving product links,
  option recipes, and listing content. It never creates `MasterProduct` rows
  or changes stock.

## Matching And Capacity Contract

- Matching reads all persisted listing/option rows for the account workspace.
  Only a complete full snapshot may reconcile absence.
- Candidate rows are transient evidence. Automatic matching may fill an empty
  recipe when a typed identifier or one clearly separated name candidate has
  no identifier/spec/option conflict and the selling quantity is confirmed.
  Ambiguous evidence, conflicting options, unknown quantities, raw aliases,
  and AI output require review. Never rewrite a confirmed recipe automatically.
- Confirmed recipes survive recollection. Matching state derives from recipe
  validity; do not restore a persisted mapping-status authority.
- Capacity is computed only from direct option components. Invalid composition
  returns null, exhausted valid composition returns zero, and reads never
  reserve stock.
- Use
  [channel-sellpia-matching.md](../../../../docs/runbooks/channel-sellpia-matching.md)
  as the policy and operator-workflow authority.

## Ports And Boundaries

- Inventory evidence and registration use their named ports. Auto-matching,
  registration, manual replacement, and clearing call the Products recipe
  mutation port; Channels never mutates component rows or their listing summary.
  Consumers import the published capability, never the concrete service.
- Catalog imports use a fenced `SourceImportRun` attempt and publish only a
  complete source snapshot; stale or post-terminal submissions are rejected.
- New sync/matching paths carry `channelAccountId` and preserve
  parent/child/account consistency atomically.
- Wing and Rocket account rows remain distinct. Shared vendor identity may be
  claimed only from complete authenticated evidence under the publication
  lock; a mismatch conflicts.
- Rocket PO reads select the latest COMPLETE before filtering rows; an empty
  COMPLETE replaces the current view. Preserve prior snapshots for exact
  source/workbook references. Publication changes source facts and identities,
  not recipes, reservations, provider confirmation, or physical stock.
