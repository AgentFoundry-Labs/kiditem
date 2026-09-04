# channels — Marketplace Sync And SKU Matching

`src/channels/` owns marketplace accounts, listing/option identity, Coupang
catalog/order/return sync, matching, account-scoped registration, channel
capacity projections, and dashboard reads. Provider calls stay behind provider
adapters.

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

- Selected accounts must exist and be active. Credential lookup is
  account-scoped; server environment values are not a fallback.
- Persist/reconcile provider identity before create. Provider IO occurs outside
  the database transaction; final listing resolution/reactivation uses the
  caller's finalization transaction.
- Retries reuse frozen provider option keys and never create again while an
  outcome is uncertain.
- Catalog publication refreshes channel facts while preserving product links,
  option recipes, and listing content. It never creates `MasterProduct` rows
  or changes stock.
- Deletion operations persist actor-bound intent before browser mutation.
  Browser evidence alone cannot prove deletion; keep the listing active and
  uncertain until an independent provider verifier confirms it.

## Matching And Capacity Contract

- Matching reads all persisted listing/option rows for the account workspace.
  Only a complete full snapshot may reconcile absence.
- Candidate rows are transient evidence. Automatic matching may fill an empty
  recipe or recalculate one simple component only from unique,
  non-conflicting deterministic evidence; ambiguous, raw-alias, or AI evidence
  requires review.
- Confirmed recipes survive recollection. Matching state derives from recipe
  validity; do not restore a persisted mapping-status authority.
- Capacity is computed only from direct option components. Invalid composition
  returns null, exhausted valid composition returns zero, and reads never
  reserve stock.
- Use
  [channel-sellpia-matching.md](../../../../docs/runbooks/channel-sellpia-matching.md)
  as the policy and operator-workflow authority.

## Ports And Boundaries

- Provider access, Orders writes, Inventory evidence, and registration use their
  named ports. Consumers import the published capability, never the concrete
  service.
- Catalog imports use a fenced `SourceImportRun` attempt and publish only a
  complete source snapshot; stale or post-terminal submissions are rejected.
- New sync/matching paths carry `channelAccountId` and preserve
  parent/child/account consistency atomically.
- Wing and Rocket account rows remain distinct. Shared vendor identity may be
  claimed only from complete authenticated evidence under the publication
  lock; a mismatch conflicts.
- Rocket PO publication replaces the account raw snapshot while retaining
  source/workbook evidence. It publishes identities and capacity only; it does
  not reserve, submit, confirm, or mutate stock.
- Status normalization stays in `domain/coupang-normalization.ts`.
  `adapters/coupang/` contains compatibility shims only.
