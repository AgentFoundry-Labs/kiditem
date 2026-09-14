Before working in this directory, always read this document first rather than relying on memory.

# web/catalog — Product Operations And Channel Matching

`app/(catalog)/` owns canonical product operations and per-channel-option
Sellpia consumption rules under `/product-hub`.

- `MasterProduct` is canonical inventory-product metadata and official ABC
  identity.
- `SellpiaInventorySku` is the provider source and physical quantity
  authority.
- `ChannelListingOption` is the channel sellable identity; its complete
  direct component recipe determines capacity. A listing-level product link is
  only a derived summary.
- Candidates and ranking are evidence. One clearly separated name candidate
  may be confirmed automatically only with no identifier/spec/option conflict
  and a confirmed positive selling quantity.

Product list/detail uses Products APIs. The Inventory-owned `/inventory-hub`
reads the complete Sellpia collection in its tabless inventory workspace.
Matching writes recipes through Products and never edits Sellpia stock, source
price, or channel price. Typed identifiers and high-confidence names may fill
only an empty recipe under the matching policy. Preserve confirmed recipes
unless an operator submits a complete replacement.
