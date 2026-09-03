# products — Product Operations + Categories Compatibility

`src/products/` owns canonical inventory-product (`MasterProduct`) operations,
absolute profitability ABC, and the direct inventory composition of channel
listing options. It also retains `/api/categories` compatibility CRUD. It never
owns physical stock quantities.

## Owned Surfaces

- Canonical `MasterProduct` operations and category compatibility.
- Direct channel-option inventory composition.
- Products-owned absolute ABC formula, evaluation, publication, current grade,
  and history.

## Final Owners

- Canonical inventory product and ABC: Products `MasterProduct`.
- Marketplace product/option identity: Channels `ChannelListing` and
  `ChannelListingOption`.
- Derived single-inventory-product listing summary:
  `ChannelListing.masterProductId`.
- Per-sale inventory consumption: Products-owned
  `ChannelListingOptionInventoryComponent`, keyed by channel option and
  `SellpiaInventorySku`.
- Sellpia source identity, stock, purchase price, provider imports, and
  one-to-one canonical MasterProduct provisioning: Inventory
  `SellpiaInventorySku`.
- Collected sourcing candidates and product preparation: Sourcing.
- Registered thumbnail/detail content: AI `ContentWorkspace` and its revisions.

## Boundary Rules

- Do not recreate `ProductVariant`, `ProductVariantComponent`, an operating
  option table, a master-level inventory recipe, or a second stock balance.
- `MasterProduct` is the only ABC owner. Channel option inventory composition is
  logistics data and does not create a second product grade.
- A channel option recipe is an atomic complete replacement of distinct,
  organization-owned Sellpia SKU IDs with positive integer quantities. An empty
  replacement explicitly clears the composition. Physical stock is never
  mutated by this endpoint.
- Capacity is derived from the option's direct components using Inventory's
  physical `availableStock === currentStock` projection.
- Product-level inventory is the owned source SKU of the canonical
  MasterProduct. Channel options are consumers of that inventory product;
  Products never creates a second ledger.
- Recipe candidate search enters Inventory only through the exported
  `SELLPIA_INVENTORY_SKU_READ_PORT`, passes the session-owned `organizationId`,
  and returns physical identities without a writer.
- Product list pagination returns summary counts over the complete filtered
  result before page slicing. Consumers do not rebuild counts from one page.
- `MasterProduct.imageUrls` is operator-managed metadata. Read responses may
  expose calculated `displayImageUrls`; channel collection never copies media
  into the product.
- Channel import creates or updates only Channels-owned listing identities and
  preserves existing option recipes. The listing-level `masterProductId` is
  rebuilt from those recipes and is null when options are incomplete or span
  multiple inventory products.
- Candidate rank, display text, untyped payload fields, and AI never confirm
  inventory identity. Channels owns conservative typed option-to-Sellpia
  matching and explicit operator confirmation.
- `MasterProduct.abcGrade` is nullable automatic output, never operator input.
  Products publishes ABC only through the explicit Product Hub grade-refresh
  command. The service reads the latest compatible `COMPLETE` source snapshots,
  persists formula/evaluation provenance, and records only actual grade changes
  in history.
- Evaluation requires a selling product, valid mapping, complete Sellpia
  profitability coverage, `ORDER_TIME_SUPPLY_COST`, VAT provenance, at least 30
  valid observation days, and advertising evidence of `OBSERVED`,
  `CONFIRMED_ZERO`, or `NOT_APPLIED`. Missing or stale Sellpia, mapping, or
  advertising evidence produces no publication; it is never zero-filled or
  synthesized as C. An existing normal grade remains visible while the source
  is stale.
- ABC is a versioned absolute formula with fixed business anchors and
  thresholds. A product's score depends only on its own complete facts and the
  formula version; cohort rank, percentile/quota, population hash, calibration,
  and reliability adjustments are forbidden. Exact formula policy belongs in
  the approved ABC design/spec.
- Revenue and operating-profit contribution, rank, cumulative share, and loss
  impact are separate reporting metrics. They never alter `abcGrade`.
- Evaluation/publication is organization-locked so an older snapshot cannot
  overwrite a newer completed publication.
- Thumbnail analysis quality grades remain AI registration evidence and are
  independent from automatic product ABC.
