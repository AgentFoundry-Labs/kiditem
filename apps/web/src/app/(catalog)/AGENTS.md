# web/catalog — Product Operations and Channel Matching

`app/(catalog)/` owns KidItem inventory-product metadata and per-channel-option
Sellpia inventory consumption rules. Public URLs remain under `/product-hub`.

## Domain Contracts

- `MasterProduct` owns canonical metadata/ABC; `SellpiaInventorySku` owns source
  facts/physical quantity; `ChannelListingOption` is the sellable consumer.
- Matching writes the option's complete component list. Listing-level product
  identity is derived only when every option resolves to one product.
- Candidates/rankings are evidence only and never confirm identity or overwrite
  a component rule.

## Boundary Rules

- Product list/detail and its focused inventory picker use Products APIs; only the
  options route reads the full Inventory SKU collection.
- Do not infer product or channel identity from display text,
  barcode, normalized name, or candidate rank.
- Catalog routes do not edit Sellpia stock, source prices, or channel prices.
- Component replacement requires explicit operator confirmation and optimistic
  current-component evidence.
- Sourcing candidates, generated content workspaces, marketplace ingest,
  Rocket operations, and purchase orders remain in their owner domains.
