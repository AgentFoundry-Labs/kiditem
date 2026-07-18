# Product-Centered Channel Inventory Matching Design

**Date:** 2026-07-18
**Status:** Approved for implementation

## Goal

Make `/product-hub/matching` the single operator surface for matching a channel
product, its child options, and the flat Sellpia inventory SKUs that compose
those options. The operator starts one account-scoped matching command and
reviews unresolved work by product, not by navigating three independent
product, option, and inventory steps.

## Selected Approach

The selected approach is a product-centered orchestration command.

- One `상품·재고 자동 매칭` action evaluates the selected Wing or Rocket
  account.
- The server groups every active `ChannelListing` with its child
  `ChannelListingOption` rows.
- Existing confirmed `MasterProduct`, `ProductVariant`, and
  `ProductVariantComponent` relationships are preserved.
- Deterministic product/option identities and empty Sellpia recipes are applied
  in one server command only when the whole product group is safe.
- A product with any unresolved child option remains one product-level review
  item. The operator expands that product, reviews every child option, and
  confirms the product once.
- Sellpia candidates come from the organization-wide flat
  `SellpiaInventorySku` collection. They are not nested under a supplier or
  catalog product.

The schema remains hierarchical because channel options and internal variants
are sellable units, while the operator workflow becomes product-centered:

```text
ChannelListing
  -> MasterProduct
  -> ChannelListingOption[]
       -> ProductVariant[]
       -> ProductVariantComponent[]
            -> flat SellpiaInventorySku
```

## Alternatives Considered

### Rocket-triggered automatic writes

Applying recipes inside Rocket PO preview would make one screen appear faster,
but it would split matching ownership between Rocket operations and the product
matching center. Wing and manually linked products would behave differently.

### Separate product, option, and inventory steps

This mirrors the database closely but exposes implementation structure to the
operator. It also makes a multi-option product look complete when only its
parent or one child is linked.

### Product-centered orchestration (selected)

One explicit command keeps mutation ownership in Channels/Products, presents
one status per product, and retains the option-level and recipe-level database
relations required for capacity calculations.

## Matching Policy

### Identity links

An existing confirmed link is never overwritten. A missing channel product or
option identity may be confirmed automatically only by the current typed,
unique, non-conflicting identity rules. Normalized names and AI remain
candidate evidence for identity review rather than identity truth.

### Sellpia recipes

An empty `ProductVariantComponent` recipe may be created automatically with
quantity `1` only when exactly one active Sellpia SKU is selected by at least
one of these rules and no evidence conflicts:

- exact Sellpia code;
- unique normalized physical barcode;
- unique strict normalized product-name plus option match.

Pack/BOM signature differences, duplicate barcodes, conflicting identifiers,
name-only matches, fuzzy similarity, and AI suggestions remain review work.
Existing recipes are immutable to the automatic command.

### Product-group atomicity

For one channel product:

- if the parent identity, every child option identity, and every empty child
  recipe are deterministic, the command applies the full product group;
- if any child is unresolved, the command applies no new link or recipe for
  that product and returns the complete group for review;
- pre-existing confirmed links and recipes remain untouched in either case.

This prevents a product from being reported as automatically complete while a
child option still lacks inventory truth.

## Operator Experience

`/product-hub/matching` becomes one product list rather than separate operator
steps.

The account header contains one primary `상품·재고 자동 매칭` button. The command
returns these product-level states:

- `자동 완료`: the full product group was safely linked and configured;
- `구성 완료`: all relationships already existed;
- `검토 필요`: at least one child has a candidate requiring quantity or
  identity confirmation;
- `매칭 없음/충돌`: at least one child has no candidate, duplicate evidence,
  or conflicting evidence.

Each product row shows an option completion summary. Expanding a review row
shows all child options, their proposed ProductVariant, proposed flat Sellpia
SKU components, evidence, stock facts, and required quantities. One
`이 상품 매칭 확인` command saves the reviewed product group atomically.

The Rocket workspace does not write product recipes. Its review links include
the Rocket `channelAccountId` and the relevant product-level queue status so
the matching center opens on the correct account instead of defaulting to
Wing.

## Backend Boundaries

- Channels owns the account-scoped orchestration, evidence classification, and
  product-group result.
- Products owns all `MasterProduct`, `ProductVariant`, and
  `ProductVariantComponent` mutations and exposes a transaction-aware
  product-group confirmation capability.
- Inventory exposes read-only flat Sellpia evidence and never accepts recipe
  or stock writes from Channels.
- Supply/Rocket consumes the resulting common availability projection and does
  not own matching mutations.

The one-click automatic command computes and applies its current plan in the
same request. It does not perform a read-only preview followed by a second
operator confirmation. Product-level manual confirmation remains
version-fenced so stale candidates cannot overwrite newer links or recipes.

## Error Handling and Concurrency

- Every request is scoped by `organizationId + channelAccountId` from the
  authenticated session.
- Product-group writes use row locks and compare the current nullable links and
  recipe state before mutation.
- A concurrent confirmed link or recipe causes that product group to be
  skipped or returned as a conflict; it is never overwritten.
- One product failure does not roll back safely completed products in the same
  account command. The response reports applied, already complete, review, and
  blocked groups separately.
- A manual product confirmation is atomic for that product and rejects a stale
  proposal version.

## Existing Data

No schema or deploy-time backfill is required. Existing empty deterministic
candidates are evaluated the next time the operator runs
`상품·재고 자동 매칭` for that account. This includes the current Rocket exact
match. The existing `0.1.23` release bump remains the release boundary because
this behavior is part of the same unshipped PR 335 implementation.

## Verification

- Domain tests cover deterministic full-product completion, one unresolved
  child preventing partial writes, existing-recipe preservation, duplicate
  evidence, and pack/BOM review.
- PostgreSQL integration tests prove organization/account scoping, row-lock
  behavior, product-group atomicity, and no Sellpia stock mutation.
- Web tests cover one primary command, product-grouped statuses, expandable
  option evidence, one product confirmation, and Rocket account/status deep
  links.
- The existing Channels/Supply suites, Products recipe tests, IDOR scanner,
  tenant scanner, server build, and web build remain required.
- Actual UI verification runs the matching command for the Rocket account and
  confirms that a newly configured zero-stock SKU displays current stock `0`,
  commitment `0`, and available stock `0` rather than `—`.
