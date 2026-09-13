---
status: accepted
---

# Products owns channel-option recipe mutations and bounded automatic matching

A `ChannelListingOptionInventoryComponent` recipe determines how much physical
Sellpia inventory one channel-option sale consumes. Products already owns that
composition and the listing-level `masterProductId` derived from complete
recipes, but Channels registration and matching still wrote component rows and
the summary directly. Those parallel mutation paths could skip organization
validation, overwrite confirmed quantities, advance mapping generation more
than once, or leave the summary inconsistent with the recipe.

Products now exposes one recipe mutation port for complete operator
replacement, preserve-existing automatic/registration fill, explicit clearing,
and listing-summary reconciliation. The owner validates active organization
scoped Sellpia SKUs and their canonical MasterProduct, locks product mapping,
changes the recipe and summary atomically, and advances mapping generation once
when the transaction changes mapping. Channels owns collection and marketplace
identity, but calls this port for every recipe mutation. Existing confirmed
recipes and physical stock remain unchanged during automatic matching and
registration; a conflicting proposed recipe returns to operator review.

Automatic matching may use a typed identifier or a high-confidence name only
when exactly one candidate is clearly separated, product and option facts do
not conflict, and the selling unit/quantity is confirmed. Normalized-name
duplicates, identifier disagreements, option/color/size conflicts, and unknown
quantities require operator review. AI output and rank alone remain evidence,
not confirmation.

## Consequences

- A complete manual replacement remains available through Products and does
  not change physical inventory.
- Catalog recollection and automatic matching preserve configured recipes.
- Registration can create Channels-owned listing and option identities in the
  caller transaction while Products owns recipe rows, summary derivation, and
  mapping generation in that same transaction.
- Public stale-edit/version semantics remain outside this decision; KID-102
  owns any future compare-and-swap user contract.
