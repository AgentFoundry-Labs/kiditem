# web/catalog — Product Operations and Channel Matching

`app/(catalog)/` owns KidItem operating-product metadata, explicit
channel-listing-to-product identity confirmation, and per-channel-option
Sellpia inventory consumption rules. Public URLs remain under `/product-hub`.

## Owned Surfaces

- Product operations list, create/edit, and channel-option inventory detail
  under `/product-hub`
- Coupang/Rocket account-scoped product-first, option-second matching under
  `/product-hub/matching`
- Dedicated read-only Sellpia option table under `/product-hub/options`

## Domain Contracts

- `MasterProduct` is the KidItem operating product and official ABC owner.
  `ChannelListingOption` is the channel's sellable option. Neither is a
  physical Sellpia inventory row.
- `/product-hub/options` owns the complete read-only Sellpia inventory
  collection and publishes channel-option destinations only from confirmed,
  organization-fenced direct component relations.
- Matching confirms only `ChannelListing -> MasterProduct`. A listing option's
  stock deduction is its own complete atomic list of
  `ChannelListingOptionInventoryComponent` rows.
- Candidates and ranking are evidence only. They never confirm product identity
  or overwrite an existing option consumption rule.

## Boundary Rules

- Product list/detail and its focused inventory picker use Products APIs; only the
  options route reads the full Inventory SKU collection.
- Do not infer product or channel identity from display text,
  barcode, normalized name, or candidate rank.
- Catalog routes do not edit Sellpia stock, source prices, or channel prices.
- Do not overwrite channel-option component quantities without explicit
  operator confirmation and optimistic current-component evidence.
- Never send `organizationId`; backend session scope owns it.
- Sourcing candidates, generated content workspaces, marketplace ingest,
  Rocket operations, and purchase orders remain in their owner domains.
