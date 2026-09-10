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
- Candidates and ranking are evidence, never confirmation.

Product list/detail uses Products APIs. The Inventory-owned `/inventory-hub`
reads the complete Sellpia collection in its tabless inventory workspace.
Matching writes recipes through Products and never edits Sellpia stock, source
price, or channel price. Identity is not inferred from display text, normalized
name, barcode, or rank. Preserve confirmed recipes unless an operator submits
complete replacement with optimistic current-recipe evidence.
